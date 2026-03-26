const fs = require('fs');
const readline = require('readline');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_ROOT = path.join(__dirname, '../sap-o2c-data');
const DB_PATH = path.join(__dirname, '../business.db');

const db = new sqlite3.Database(DB_PATH);

// Track initialized tables
const initializedTables = new Set();

// Promisified SQL runner
function runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Process one JSONL file
async function processFile(filePath, tableName) {
    console.log(`📖 Processing: ${tableName} → ${path.basename(filePath)}`);

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let headers = null;
    let stmt = null;
    let inserted = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        let row;
        try {
            row = JSON.parse(line);
        } catch {
            continue;
        }

        // First row determines schema
        if (!headers) {
            headers = Object.keys(row);

            // Create table ONLY once
            if (!initializedTables.has(tableName)) {
                const columns = headers
                    .map(col => `"${col}" TEXT`)
                    .join(", ");

                await runSql(
                    `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns})`
                );

                initializedTables.add(tableName);
                console.log(`✅ Table ready: ${tableName}`);
            }

            // Prepare insert statement once per file
            const placeholders = headers.map(() => "?").join(",");
            stmt = db.prepare(
                `INSERT INTO "${tableName}" VALUES (${placeholders})`
            );
        }

        const values = headers.map(h =>
            typeof row[h] === "object"
                ? JSON.stringify(row[h])
                : String(row[h] ?? "")
        );

        stmt.run(values);
        inserted++;

        // Progress log every 10k rows
        if (inserted % 10 === 0) {
            console.log(`   ↳ ${inserted} rows inserted into ${tableName}`);
        }
    }

    if (stmt) stmt.finalize();

    console.log(`📦 Finished ${tableName}: ${inserted} rows`);
}


// Walk dataset directory recursively
async function walk(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            await walk(fullPath);
        } else if (!file.startsWith(".")) {
            const parentDir = path.basename(path.dirname(fullPath));

            // Convert folder name → table name
            const tableName = parentDir.replace(/[^a-z0-9]/gi, "_");

            await processFile(fullPath, tableName);
        }
    }
}


// Main execution
(async () => {
    console.log("🚀 Starting dataset ingestion...");

    if (!fs.existsSync(DATA_ROOT)) {
        console.error("❌ Dataset folder not found:", DATA_ROOT);
        process.exit(1);
    }

    try {
        await runSql("BEGIN TRANSACTION");

        await walk(DATA_ROOT);

        await runSql("COMMIT");

        console.log("🎉 All data ingested successfully!");
    } catch (err) {
        console.error("❌ Error during ingestion:", err);
        await runSql("ROLLBACK");
    } finally {
        db.close(() => {
            console.log("💾 SQLite connection closed.");
        });
    }
})();