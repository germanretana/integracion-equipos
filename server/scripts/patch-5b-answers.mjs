import fs from "fs";

const path = new URL("../index.js", import.meta.url);
let src = fs.readFileSync(path, "utf8");

function replaceBlock(name, startNeedle, endNeedle, replacement) {
  const a = src.indexOf(startNeedle);
  if (a === -1) throw new Error(`No encontré startNeedle para ${name}`);
  const b = src.indexOf(endNeedle, a);
  if (b === -1) throw new Error(`No encontré endNeedle para ${name}`);
  const before = src.slice(0, a);
  const after = src.slice(b);
  src = before + replacement + after;
}

// C1: reemplazar desde app.get("/api/app/:processSlug/c1"... hasta justo antes del bloque C2
replaceBlock(
  "C1 routes",
  'app.get("/api/app/:processSlug/c1", requireParticipant',
  "/* =========================\n   C2 DRAFT + SUBMIT (per peer)\n========================= */",
`app.get("/api/app/:processSlug/c1", requireParticipant, (req, res) => {
  const db = readDb();
  const scoped = getProcAndMeScoped(db, req);
  if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

  const entry = scoped.proc.responses.c1[scoped.me.id] || null;

  if (!entry) {
    return res.json({ draft: { answers: {} }, savedAt: null, submittedAt: null });
  }

  entry.draft = entry.draft || {};
  if (!entry.draft.answers || typeof entry.draft.answers !== "object") {
    entry.draft.answers = {};
  }

  res.json(entry);
});

app.put("/api/app/:processSlug/c1", requireParticipant, (req, res) => {
  const { draft } = req.body || {};
  const incomingDraft = draft && typeof draft === "object" ? draft : {};
  const freeText = String(incomingDraft?.freeText || ""); // legacy

  const next = updateDb((db2) => {
    const scoped2 = getProcAndMeScoped(db2, req);
    if (scoped2.error) return db2;

    const { proc, me } = scoped2;

    proc.responses.c1[me.id] =
      proc.responses.c1[me.id] || { draft: { answers: {} }, savedAt: null, submittedAt: null };

    if (proc.responses.c1[me.id].submittedAt) return db2; // locked after submit

    const prev = proc.responses.c1[me.id].draft || {};
    const answers =
      incomingDraft.answers && typeof incomingDraft.answers === "object"
        ? incomingDraft.answers
        : prev.answers || {};

    proc.responses.c1[me.id].draft = {
      ...prev,
      ...incomingDraft,
      freeText, // keep legacy compatibility
      answers,
    };

    proc.responses.c1[me.id].savedAt = new Date().toISOString();
    return db2;
  });

  const db = next;
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  const entry = proc?.responses?.c1?.[req.participant.participantId];
  res.json(entry);
});

app.post("/api/app/:processSlug/c1/submit", requireParticipant, (req, res) => {
  const next = updateDb((db2) => {
    const scoped2 = getProcAndMeScoped(db2, req);
    if (scoped2.error) return db2;

    const { proc, me } = scoped2;

    const entry =
      proc.responses.c1[me.id] || { draft: { answers: {} }, savedAt: null, submittedAt: null };

    if (!hasMeaningfulDraft(entry.draft)) return db2;

    entry.submittedAt = new Date().toISOString();
    proc.responses.c1[me.id] = entry;
    return db2;
  });

  const db = next;
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  const entry = proc?.responses?.c1?.[req.participant.participantId];

  if (!hasMeaningfulDraft(entry?.draft)) {
    return res.status(400).json({ error: "Debe completar el cuestionario antes de enviarlo." });
  }

  res.json(entry);
});

/* =========================
   C2 DRAFT + SUBMIT (per peer)
========================= */
`
);

fs.writeFileSync(path, src, "utf8");
console.log("OK: server/index.js parcheado para draft.answers (C1/C2).");
