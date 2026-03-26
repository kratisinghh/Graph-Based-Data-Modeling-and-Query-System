require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

/*
========================================
DATABASE INITIALIZATION (DEPLOYMENT SAFE)
========================================
*/

const DB_PATH = path.join(__dirname, "business.db");

// Auto-create DB if missing
if (!fs.existsSync(DB_PATH)) {
  console.log("📦 Database not found. Running ingestion script...");
  require("./scripts/import_jsonl_to_sqlite");
  require("./scripts/downloadDataSet");
}

const db = new sqlite3.Database(DB_PATH);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/*
========================================
SCHEMA CACHE FOR PROMPT INJECTION
========================================
*/

let cachedSchema = "";

db.all(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  [],
  (err, rows) => {
    if (!err && rows) {
      cachedSchema = rows.map((r) => r.sql).join("\n");
      console.log("✅ Schema cached successfully");
    }
  }
);

const getDatabaseSchema = async () => {
  if (cachedSchema) return cachedSchema;

  return new Promise((resolve) => {
    db.all(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      [],
      (err, rows) => {
        cachedSchema = rows ? rows.map((r) => r.sql).join("\n") : "";
        resolve(cachedSchema);
      }
    );
  });
};

/*
========================================
SAFE SQL EXECUTION WRAPPER
========================================
*/

const executeQuery = (sql) =>
  new Promise((resolve) => {
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("❌ SQL Error:", err.message);
        console.error("SQL:", sql);
        return resolve([]);
      }
      resolve(rows || []);
    });
  });

/*
========================================
MAIN QUERY ENDPOINT
========================================
*/

app.post("/api/query", async (req, res) => {
  const { prompt } = req.body;

  try {
    const schema = await getDatabaseSchema();

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: `
You are an expert SAP Order-to-Cash data assistant.

Database Schema:
${schema}

Task:
1. Determine whether the question relates to the dataset.
2. If not relevant → return isRelevant = false
3. If relevant → generate:

answerSql → for textual answer
graphSql → for lifecycle relationship graph

Respond ONLY in JSON format:

{
  "isRelevant": boolean,
  "answerSql": "string",
  "graphSql": "string",
  "guardrailMessage": "string"
}
`,
    });

    const result = await model.generateContent(prompt);

    let text = result.response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    console.log("🤖 Gemini Config:", text);

    let config;

    try {
      config = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Failed to parse Gemini SQL response",
      });
    }

    if (!config.isRelevant) {
      return res.json({
        answer:
          config.guardrailMessage ||
          "This system answers SAP O2C dataset queries only.",
        data: null,
      });
    }

    console.log("🚀 Running Answer SQL:", config.answerSql);
    console.log("🚀 Running Graph SQL:", config.graphSql);

    const [answerData, graphRawData] = await Promise.all([
      executeQuery(config.answerSql),
      executeQuery(config.graphSql),
    ]);

    /*
    ========================================
    FINAL RESPONSE GENERATION (NLG + GRAPH)
    ========================================
    */

    const finalModel = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
    });

    const finalPrompt = `
User Question:
${prompt}

Answer Data:
${JSON.stringify(answerData).slice(0, 5000)}

Graph Data:
${JSON.stringify(graphRawData).slice(0, 5000)}

Respond ONLY in JSON format:

{
  "answer": "clear natural language explanation",
  "graph": {
    "nodes": [{"id": "string", "label": "string", "type": "string"}],
    "links": [{"source": "id", "target": "id", "label": "string"}]
  }
}
`;

    const finalResult = await finalModel.generateContent(finalPrompt);

    let finalText = finalResult.response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    console.log("🤖 Gemini Final:", finalText);

    let finalOutput;

    try {
      finalOutput = JSON.parse(finalText);
    } catch {
      return res.status(500).json({
        error: "Failed to parse Gemini graph response",
      });
    }

    res.json({
      answer: finalOutput.answer,
      graph: finalOutput.graph,
      query: config.answerSql,
    });
  } catch (error) {
    console.error("❌ ERROR:", error);

    if (error.message.includes("429")) {
      return res.status(429).json({
        error: "Gemini quota exceeded. Try again shortly.",
      });
    }

    res.status(500).json({
      error: "Internal server error",
    });
  }
});

/*
========================================
GRAPH EXPANSION ENDPOINT
========================================
*/

app.post("/api/expand", async (req, res) => {
  const { nodeId, nodeType } = req.body;

  try {
    const schema = await getDatabaseSchema();

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: `
You are an SAP O2C assistant.

Schema:
${schema}

Task:
Given node ID ${nodeId} of type ${nodeType},
generate SQL to retrieve directly connected entities.

Respond ONLY in JSON:

{
  "sql": "string"
}
`,
    });

    const result = await model.generateContent(
      `Expand neighbors for ${nodeType} ${nodeId}`
    );

    let config = JSON.parse(
      result.response.text().replace(/```json/g, "").replace(/```/g, "")
    );

    const rows = await executeQuery(config.sql);

    const finalModel = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
    });

    const finalPrompt = `
Convert rows into graph JSON.

Target Node:
${nodeType} ${nodeId}

Rows:
${JSON.stringify(rows).slice(0, 5000)}

Return ONLY JSON:

{
  "nodes": [{"id": "string", "label": "string", "type": "string"}],
  "links": [{"source": "id", "target": "id", "label": "string"}]
}
`;

    const finalResult = await finalModel.generateContent(finalPrompt);

    const finalOutput = JSON.parse(
      finalResult.response.text().replace(/```json/g, "").replace(/```/g, "")
    );

    res.json(finalOutput);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/*
========================================
SERVER START
========================================
*/

const PORT = process.env.PORT || 5001;

app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Backend running on http://127.0.0.1:${PORT}`)
);