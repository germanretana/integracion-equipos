import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "server");
const DB_PATH = path.join(ROOT, "data", "db.json");

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Uso: node server/scripts/unsubmit-c1-by-email.mjs ana@example.com");
  process.exit(1);
}

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function backupDb() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${DB_PATH}.bak-${ts}`;
  fs.copyFileSync(DB_PATH, backupPath);
  return backupPath;
}

const db = loadDb();
const backup = backupDb();

const report = [];

for (const proc of db.processes || []) {
  const participants = proc.participants || [];
  const me = participants.find((p) => String(p.email || "").toLowerCase() === email);
  if (!me) continue;

  proc.responses = proc.responses || { c1: {}, c2: {} };
  proc.responses.c1 = proc.responses.c1 || {};

  const entry = proc.responses.c1[me.id];
  if (!entry) {
    report.push({
      processSlug: proc.processSlug,
      participantId: me.id,
      participantEmail: email,
      foundEntry: false,
      changed: false,
      reason: "No había entry de C1.",
    });
    continue;
  }

  const wasSubmitted = !!entry.submittedAt;
  // unlock: quitar submittedAt
  entry.submittedAt = null;

  report.push({
    processSlug: proc.processSlug,
    participantId: me.id,
    participantEmail: email,
    foundEntry: true,
    changed: wasSubmitted,
    previousSubmittedAt: wasSubmitted ? entry.submittedAt : null,
    note: wasSubmitted ? "C1 desbloqueado (submittedAt -> null)." : "Ya estaba sin submit.",
  });
}

saveDb(db);

console.log("✅ Unsubmit C1 por email completado");
console.log({ backup, email, report });
