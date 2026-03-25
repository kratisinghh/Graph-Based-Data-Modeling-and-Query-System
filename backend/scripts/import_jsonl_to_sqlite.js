const fs = require('fs');
const readline = require('readline');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_ROOT = path.join(__dirname, '../sap-o2c-data');
const DB_PATH = path.join(__dirname, '../business.db');
const db = new sqlite3.Database(DB_PATH);

async function processFile(filePath, tableName) {
    console.log(`📖 Attempting to read: ${tableName} (${path.basename(filePath)})`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let isFirstLine = true;
    let stmt = null;
    let headers = [];

    for await (const line of rl) {
        if (!line.trim()) continue;
        let row;
        try {
            row = JSON.parse(line);
        } catch (e) { continue; }
        
        if (isFirstLine) {
            headers = Object.keys(row);
            const cols = headers.map(k => `"${k}" TEXT`).join(', ');
            await new Promise((res) => {
                db.serialize(() => {
                    db.run(`DROP TABLE IF EXISTS "${tableName}"`);
                    db.run(`CREATE TABLE "${tableName}" (${cols})`, () => res());
                });
            });
            stmt = db.prepare(`INSERT INTO "${tableName}" VALUES (${headers.map(() => '?').join(',')})`);
            isFirstLine = false;
        }
        stmt.run(headers.map(h => typeof row[h] === 'object' ? JSON.stringify(row[h]) : String(row[h] ?? "")));
    }
    if (stmt) {
        stmt.finalize();
        console.log(`✅ Table Populated: ${tableName}`);
    }
}

function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            walk(fullPath); 
        } else if (!item.startsWith('.')) { // Process any file that isn't a hidden system file
            const parentDir = path.basename(path.dirname(fullPath));
            const tableName = parentDir.replace(/[^a-z0-9]/gi, '_');
            processFile(fullPath, tableName);
        }
    }
}

console.log("🚀 Starting Brute Force Ingestion...");
if (fs.existsSync(DATA_ROOT)) walk(DATA_ROOT);
else console.error("❌ Folder not found!");