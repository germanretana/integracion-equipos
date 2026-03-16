import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../lib/pg.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDbPath() {
  return process.env.DB_PATH || path.resolve(__dirname, "..", "data", "db.json");
}

function jsonCounts(db) {
  let participants = 0;
  let responseC1 = 0;
  let responseC2 = 0;

  for (const proc of db.processes || []) {
    participants += Array.isArray(proc.participants) ? proc.participants.length : 0;

    const c1Map =
      proc.responses?.c1 && typeof proc.responses.c1 === "object"
        ? proc.responses.c1
        : {};
    responseC1 += Object.keys(c1Map).length;

    const c2Outer =
      proc.responses?.c2 && typeof proc.responses.c2 === "object"
        ? proc.responses.c2
        : {};
    for (const peerMap of Object.values(c2Outer)) {
      if (peerMap && typeof peerMap === "object") {
        responseC2 += Object.keys(peerMap).length;
      }
    }
  }

  return {
    admins: Array.isArray(db.admins) ? db.admins.length : 0,
    baseTemplates: {
      c1: db.baseTemplates?.c1 ? 1 : 0,
      c2: db.baseTemplates?.c2 ? 1 : 0,
    },
    processes: Array.isArray(db.processes) ? db.processes.length : 0,
    participants,
    responseC1,
    responseC2,
    events: Array.isArray(db.events) ? db.events.length : 0,
  };
}

async function pgCounts() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const q = async (sql) => {
      const res = await client.query(sql);
      return Number(res.rows[0].count || 0);
    };

    const bt = await client.query(`
      select kind, count(*)::int as count
      from base_templates
      where domain = 'questionnaire'
      group by kind
      order by kind
    `);

    const baseTemplateMap = { c1: 0, c2: 0 };
    for (const row of bt.rows) {
      baseTemplateMap[row.kind] = Number(row.count || 0);
    }

    return {
      admins: await q(`select count(*)::int as count from admins`),
      baseTemplates: baseTemplateMap,
      processes: await q(`select count(*)::int as count from processes`),
      participants: await q(`select count(*)::int as count from participants`),
      responseC1: await q(`select count(*)::int as count from response_c1`),
      responseC2: await q(`select count(*)::int as count from response_c2`),
      events: await q(`select count(*)::int as count from events`),
    };
  } finally {
    client.release();
    await pool.end();
  }
}

function printComparison(jsonSide, pgSide) {
  const rows = [
    ["admins", jsonSide.admins, pgSide.admins],
    ["baseTemplates.c1", jsonSide.baseTemplates.c1, pgSide.baseTemplates.c1],
    ["baseTemplates.c2", jsonSide.baseTemplates.c2, pgSide.baseTemplates.c2],
    ["processes", jsonSide.processes, pgSide.processes],
    ["participants", jsonSide.participants, pgSide.participants],
    ["response_c1", jsonSide.responseC1, pgSide.responseC1],
    ["response_c2", jsonSide.responseC2, pgSide.responseC2],
    ["events", jsonSide.events, pgSide.events],
  ];

  let ok = true;

  console.log("");
  console.log("JSON vs PostgreSQL");
  console.log("------------------");

  for (const [label, a, b] of rows) {
    const match = a === b;
    if (!match) ok = false;
    console.log(`${label.padEnd(20)} JSON=${String(a).padEnd(6)} PG=${String(b).padEnd(6)} ${match ? "OK" : "MISMATCH"}`);
  }

  console.log("");
  if (!ok) {
    console.error("Verification failed: counts do not match.");
    process.exitCode = 1;
  } else {
    console.log("Verification successful: counts match.");
  }
}

async function main() {
  const dbPath = getDbPath();
  const raw = fs.readFileSync(dbPath, "utf8");
  const db = JSON.parse(raw);

  const jsonSide = jsonCounts(db);
  const pgSide = await pgCounts();

  printComparison(jsonSide, pgSide);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
