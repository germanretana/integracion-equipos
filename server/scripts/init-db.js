import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../lib/pg.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const schemaPath = path.resolve(__dirname, "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("Database schema initialized successfully.");
  } catch (err) {
    await client.query("rollback");
    console.error("Failed to initialize database schema.");
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
