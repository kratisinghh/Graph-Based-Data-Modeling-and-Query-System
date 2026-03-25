require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// Connect to the database you created in Phase 1
const db = new sqlite3.Database('./business.db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/query', async (req, res) => {
    const { prompt } = req.body;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        // This is the "System Instruction" that tells Gemini how to behave
        const systemInstruction = `You are an expert SQL assistant for an SAP O2C dataset.
        Available tables: billing_document_headers, sales_order_items, products, business_partners.
        Given a user question, return ONLY the SQL code to get the answer. 
        No markdown formatting, no explanations.`;

        const result = await model.generateContent(`${systemInstruction}\n\nQuestion: ${prompt}`);
        let sql = result.response.text().trim();
        
        // Clean up any accidental markdown the AI might include
        sql = sql.replace(/```sql|```/g, "").trim();

        console.log("🚀 Executing SQL:", sql);

        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error("❌ SQL Error:", err.message);
                return res.status(500).json({ error: err.message, generatedSql: sql });
            }
            res.json({ data: rows, query: sql });
        });
     } catch (error) {
        console.error("❌ DETAILED ERROR:", error); // This will print the real error in your server terminal
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 FDE Backend running on http://localhost:${PORT}`));