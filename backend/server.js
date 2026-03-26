require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./business.db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let cachedSchema = "";
db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
    if (!err && rows) cachedSchema = rows.map(r => r.sql).join('\n');
});

const getDatabaseSchema = async () => {
    if (cachedSchema) return cachedSchema;
    return new Promise((resolve) => {
        db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
            cachedSchema = rows ? rows.map(r => r.sql).join('\n') : "";
            resolve(cachedSchema);
        });
    });
};

app.post('/api/query', async (req, res) => {
    const { prompt } = req.body;
    try {
        const schema = await getDatabaseSchema();
        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-latest",
            systemInstruction: `You are an expert SAP O2C data assistant. 
            Schema: ${schema}
            
            Task:
            1. Determine if the question is about the dataset.
            2. If not, set isRelevant to false.
            3. If yes, generate TWO SQLite queries: 
               - 'answerSql': To get the data for the text answer.
               - 'graphSql': To get the interconnected flow (SalesOrder -> Delivery -> Billing -> Journal).
            
            Respond ONLY in JSON:
            {
              "isRelevant": boolean,
              "answerSql": "string",
              "graphSql": "string",
              "guardrailMessage": "string (only if irrelevant)"
            }`
        });

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        // Remove potential markdown code blocks
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        
        console.log("🤖 Gemini Config Response:", text);
        const config = JSON.parse(text);

        if (!config.isRelevant) {
            return res.json({ answer: config.guardrailMessage || "This system is designed to answer questions related to the provided dataset only.", data: null });
        }

        console.log("🚀 Executing Answer SQL:", config.answerSql);
        console.log("🚀 Executing Graph SQL:", config.graphSql);

        // Execute both queries
        const executeQuery = (sql) => new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error("❌ SQL Error:", err.message, "SQL:", sql);
                    resolve([]); // Resolve with empty to avoid crashing, but log it
                } else {
                    resolve(rows || []);
                }
            });
        });
        
        const [answerData, graphRawData] = await Promise.all([
            executeQuery(config.answerSql),
            executeQuery(config.graphSql)
        ]);

        // Final step: Generate the natural language answer and the graph structure in ONE go
        const finalModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const finalPrompt = `User Question: ${prompt}
        Data for Answer: ${JSON.stringify(answerData).substring(0, 5000)}
        Data for Graph: ${JSON.stringify(graphRawData).substring(0, 5000)}
        
        Respond ONLY in JSON format:
        {
          "answer": "Clear natural language answer",
          "graph": {
            "nodes": [{"id": "string", "label": "string", "type": "string"}],
            "links": [{"source": "id", "target": "id", "label": "string"}]
          }
        }`;

        const finalResult = await finalModel.generateContent(finalPrompt);
        let finalText = finalResult.response.text();
        finalText = finalText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        console.log("🤖 Gemini Final Response:", finalText);
        const finalOutput = JSON.parse(finalText);


        res.json({
            answer: finalOutput.answer,
            graph: finalOutput.graph,
            query: config.answerSql
        });

    } catch (error) {
        console.error("Error:", error);
        if (error.message.includes("429")) {
            res.status(429).json({ error: "API Quota Exceeded. Please try again in a few minutes." });
        } else {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

app.post('/api/expand', async (req, res) => {
    const { nodeId, nodeType } = req.body;
    try {
        const schema = await getDatabaseSchema();
        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-latest",
            systemInstruction: `You are an expert SAP O2C data assistant. 
            Schema: ${schema}
            
            Task:
            Given a specific Node (ID: ${nodeId}, Type: ${nodeType}), generate a SQLite query to find all directly connected entities (1-step neighbors) in the O2C flow.
            
            Respond ONLY in JSON:
            {
              "sql": "string",
              "explanation": "string (why these are connected)"
            }`
        });

        const result = await model.generateContent(`Find all connected entities for ${nodeType} ${nodeId}`);
        const config = JSON.parse(result.response.text().replace(/```json/g, "").replace(/```/g, "").trim());

        db.all(config.sql, [], async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            const finalModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
            const finalPrompt = `Convert these connected database rows into a JSON graph.
            Target Node: ${nodeType} ${nodeId}
            Rows: ${JSON.stringify(rows).substring(0, 5000)}
            
            Respond ONLY in JSON:
            {
              "nodes": [{"id": "string", "label": "string", "type": "string"}],
              "links": [{"source": "id", "target": "id", "label": "string"}]
            }`;

            const finalResult = await finalModel.generateContent(finalPrompt);
            const finalOutput = JSON.parse(finalResult.response.text().replace(/```json/g, "").replace(/```/g, "").trim());
            res.json(finalOutput);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Optimized Backend running on http://127.0.0.1:${PORT}`));

