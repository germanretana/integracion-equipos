import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { readDb, updateDb } from "./lib/db.js";
import {
  requireAdmin,
  signAdminToken,
  requireParticipant,
  signParticipantToken,
} from "./lib/auth.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* =========================
   HELPERS
========================= */
function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function ensureMockParticipantsForProcess(proc) {
  if (Array.isArray(proc.participants) && proc.participants.length > 0) return;

  proc.participants = [
    {
      id: "p1",
      firstName: "German",
      lastName: "Retana",
      email: "german.retana@gmail.com",
      passwordHash: null,
    },
    {
      id: "p2",
      firstName: "Ana",
      lastName: "López",
      email: "ana@example.com",
      passwordHash: null,
    },
    {
      id: "p3",
      firstName: "Carlos",
      lastName: "Méndez",
      email: "carlos@example.com",
      passwordHash: null,
    },
    {
      id: "p4",
      firstName: "Laura",
      lastName: "Jiménez",
      email: "laura@example.com",
      passwordHash: null,
    },
    {
      id: "p5",
      firstName: "Diego",
      lastName: "Vargas",
      email: "diego@example.com",
      passwordHash: null,
    },
  ];
}

function participantDisplayName(p) {
  const fn = p.firstName || "";
  const ln = p.lastName || "";
  return `${fn} ${ln}`.trim() || p.email || "Participante";
}

function getProcAndMeScoped(db, req) {
  const { processSlug } = req.params;
  if (req.participant.processSlug !== processSlug)
    return { error: "Acceso denegado.", status: 403 };

  const proc = db.processes.find((p) => p.processSlug === processSlug);
  if (!proc) return { error: "Proceso no encontrado.", status: 404 };

  const me = (proc.participants || []).find(
    (p) => p.id === req.participant.participantId,
  );
  if (!me) return { error: "Acceso denegado.", status: 403 };

  // ensure responses objects exist
  proc.responses = proc.responses || { c1: {}, c2: {} };
  proc.responses.c1 = proc.responses.c1 || {};
  proc.responses.c2 = proc.responses.c2 || {};

  return { proc, me };
}

function hasMeaningfulDraft(draft) {
  if (!draft) return false;

  // legacy (freeText)
  const txt = String(draft?.freeText || "").trim();
  if (txt) return true;

  const answers = draft?.answers;
  if (!answers || typeof answers !== "object") return false;

  // Cualquier respuesta "no vacía" cuenta como progreso
  for (const v of Object.values(answers)) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return true;
    if (typeof v === "number" && Number.isFinite(v)) return true;
    if (Array.isArray(v) && v.some((x) => String(x || "").trim())) return true;
    if (typeof v === "object") {
      if (typeof v.value === "number" && Number.isFinite(v.value)) return true;
      if (typeof v.suggestion === "string" && v.suggestion.trim()) return true;
      if (typeof v.leftId === "string" && v.leftId) return true;
      if (typeof v.rightId === "string" && v.rightId) return true;
    }
  }

  return false;
}

function calcStatusFromDraft(entry) {
  // entry: { draft, savedAt, submittedAt }
  if (!entry) return { status: "todo", percent: 0 };
  if (entry.submittedAt) return { status: "done", percent: 100 };
  if (!hasMeaningfulDraft(entry.draft)) return { status: "todo", percent: 0 };
  return { status: "progress", percent: 100 };
}

/* =========================
   ADMIN AUTH
========================= */
app.post("/api/admin/bootstrap", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "email y password requeridos." });

  const db = readDb();
  if (db.admins.length > 0)
    return res.status(409).json({ error: "Bootstrap ya realizado." });

  const passwordHash = await bcrypt.hash(String(password), 10);

  updateDb((db2) => {
    db2.admins.push({
      email: String(email).toLowerCase(),
      name: String(name || ""),
      passwordHash,
      createdAt: new Date().toISOString(),
    });
    return db2;
  });

  res.json({ ok: true });
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const admin = db.admins.find(
    (a) => a.email === String(email || "").toLowerCase(),
  );
  if (!admin) return res.status(401).json({ error: "Credenciales inválidas." });

  const ok = await bcrypt.compare(String(password || ""), admin.passwordHash);
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas." });

  const token = signAdminToken(admin);
  res.json({ token, admin: { email: admin.email, name: admin.name } });
});

/* =========================
   BASE TEMPLATES (ADMIN)
========================= */
app.get("/api/admin/base-templates/:kind", requireAdmin, (req, res) => {
  const kind = req.params.kind;
  if (!["c1", "c2"].includes(kind))
    return res.status(404).json({ error: "No encontrado." });

  const db = readDb();
  res.json(db.baseTemplates?.[kind] || null);
});

app.put("/api/admin/base-templates/:kind", requireAdmin, (req, res) => {
  const kind = req.params.kind;
  if (!["c1", "c2"].includes(kind))
    return res.status(404).json({ error: "No encontrado." });

  const incoming = req.body || {};

  const next = updateDb((db) => {
    db.baseTemplates = db.baseTemplates || {};
    db.baseTemplates[kind] = { ...db.baseTemplates[kind], ...incoming };
    return db;
  });

  res.json(next.baseTemplates[kind]);
});

/* =========================
   PROCESSES (ADMIN)
========================= */
app.get("/api/admin/processes", requireAdmin, (_req, res) => {
  const db = readDb();
  res.json(db.processes);
});

app.post("/api/admin/processes", requireAdmin, (req, res) => {
  const { processSlug, companyName, processName } = req.body || {};
  if (!processSlug || !companyName || !processName)
    return res.status(400).json({ error: "Datos incompletos." });

  const db = readDb();
  if (db.processes.some((p) => p.processSlug === processSlug))
    return res.status(409).json({ error: "processSlug ya existe." });

  const now = new Date().toISOString();
  const newProcess = {
    processSlug,
    companyName,
    processName,
    status: "PREPARACION",
    templates: structuredClone(db.baseTemplates),
    participants: [],
    responses: { c1: {}, c2: {} },
    createdAt: now,
    launchedAt: null,
    closedAt: null,
  };

  updateDb((db2) => {
    db2.processes.push(newProcess);
    return db2;
  });

  res.json(newProcess);
});

app.get("/api/admin/processes/:processSlug", requireAdmin, (req, res) => {
  const db = readDb();
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });
  res.json(proc);
});

app.patch("/api/admin/processes/:processSlug/status", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["PREPARACION", "EN_CURSO", "CERRADO"].includes(status))
    return res.status(400).json({ error: "Estado inválido." });

  const db = readDb();
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

  proc.status = status;
  if (status === "EN_CURSO") proc.launchedAt = new Date().toISOString();
  if (status === "CERRADO") proc.closedAt = new Date().toISOString();

  updateDb(() => db);
  res.json(proc);
});

/* =========================
   PROCESS TEMPLATES (ADMIN)
========================= */
app.get(
  "/api/admin/processes/:processSlug/templates/:kind",
  requireAdmin,
  (req, res) => {
    const { processSlug, kind } = req.params;
    if (!["c1", "c2"].includes(kind))
      return res.status(404).json({ error: "No encontrado." });

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    res.json(proc.templates?.[kind] || null);
  },
);

app.put(
  "/api/admin/processes/:processSlug/templates/:kind",
  requireAdmin,
  (req, res) => {
    const { processSlug, kind } = req.params;
    if (!["c1", "c2"].includes(kind))
      return res.status(404).json({ error: "No encontrado." });

    const incoming = req.body || {};

    const next = updateDb((db) => {
      const proc = db.processes.find((p) => p.processSlug === processSlug);
      if (!proc) return db;

      proc.templates = proc.templates || {};
      proc.templates[kind] = { ...proc.templates[kind], ...incoming };
      return db;
    });

    const proc = next.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    res.json(proc.templates[kind]);
  },
);

/* =========================
   PARTICIPANTS AUTH (APP)
========================= */
app.post("/api/app/login", async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || "").toLowerCase();

  if (!emailNorm || !password)
    return res.status(400).json({ error: "Datos incompletos." });

  const db = readDb();
  if (!Array.isArray(db.processes) || db.processes.length === 0)
    return res.status(409).json({ error: "No hay procesos configurados." });

  const matches = [];
  for (const proc of db.processes) {
    if (!proc.participants) proc.participants = [];
    const found = proc.participants.find(
      (p) => String(p.email || "").toLowerCase() === emailNorm,
    );
    if (found) matches.push({ proc, participant: found });
  }

  let proc;
  let participant;

  if (matches.length === 0) {
    proc = db.processes[0];
    ensureMockParticipantsForProcess(proc);

    participant = proc.participants.find(
      (p) => String(p.email).toLowerCase() === emailNorm,
    );

    if (!participant) {
      const newId = `p-${Date.now()}`;
      participant = {
        id: newId,
        firstName: emailNorm.split("@")[0],
        lastName: "",
        email: emailNorm,
        passwordHash: null,
      };
      proc.participants.push(participant);
    }

    updateDb((db2) => {
      const p2 = db2.processes.find((x) => x.processSlug === proc.processSlug);
      if (p2) p2.participants = proc.participants;
      return db2;
    });
  } else if (matches.length === 1) {
    proc = matches[0].proc;
    participant = matches[0].participant;

    ensureMockParticipantsForProcess(proc);

    updateDb((db2) => {
      const p2 = db2.processes.find((x) => x.processSlug === proc.processSlug);
      if (p2 && (!Array.isArray(p2.participants) || p2.participants.length === 0))
        p2.participants = proc.participants;
      return db2;
    });
  } else {
    return res.status(409).json({
      error:
        "Este correo pertenece a más de un proceso. Ingrese utilizando el enlace de invitación.",
    });
  }

  if (String(password).length < 6)
    return res.status(401).json({ error: "Credenciales inválidas." });

  const token = signParticipantToken({
    processSlug: proc.processSlug,
    participantId: participant.id,
    email: participant.email,
    name: participantDisplayName(participant),
  });

  res.json({
    token,
    participant: {
      id: participant.id,
      name: participantDisplayName(participant),
      email: participant.email,
    },
    process: {
      processSlug: proc.processSlug,
      companyName: proc.companyName,
      processName: proc.processName,
    },
  });
});

/* =========================
   PARTICIPANT API (SCOPED)
========================= */
app.get("/api/app/:processSlug/questionnaires", requireParticipant, (req, res) => {
  const db = readDb();
  const scoped = getProcAndMeScoped(db, req);
  if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

  const { proc, me } = scoped;

  const c1Entry = proc.responses?.c1?.[me.id];
  const c1Status = calcStatusFromDraft(c1Entry);

  const peers = (proc.participants || [])
    .filter((p) => p.id !== me.id)
    .map((p) => {
      const perMap = proc.responses?.c2?.[me.id] || {};
      const entry = perMap?.[p.id];
      const st = calcStatusFromDraft(entry);
      return {
        peerId: p.id,
        name: participantDisplayName(p),
        to: `/app/${proc.processSlug}/c2/${p.id}`,
        status: st.status,
        percent: st.percent,
      };
    });

  res.json({
    process: {
      processSlug: proc.processSlug,
      companyName: proc.companyName,
      processName: proc.processName,
    },
    c1: {
      to: `/app/${proc.processSlug}/c1`,
      title: "Cuestionario general sobre el equipo gerencial",
      status: c1Status.status,
      percent: c1Status.percent,
    },
    c2: peers.map((x) => ({
      to: x.to,
      title: x.name,
      status: x.status,
      percent: x.percent,
    })),
  });
});

app.get("/api/app/:processSlug/templates/:kind", requireParticipant, (req, res) => {
  const { kind } = req.params;
  if (!["c1", "c2"].includes(kind))
    return res.status(404).json({ error: "No encontrado." });

  const db = readDb();
  const scoped = getProcAndMeScoped(db, req);
  if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

  res.json(scoped.proc.templates?.[kind] || null);
});

/* =========================
   C1 DRAFT + SUBMIT
========================= */
app.get("/api/app/:processSlug/c1", requireParticipant, (req, res) => {
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
/* =========================
   C2 DRAFT + SUBMIT (per peer)
========================= */
app.get("/api/app/:processSlug/c2/:peerId", requireParticipant, (req, res) => {
  const db = readDb();
  const scoped = getProcAndMeScoped(db, req);
  if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

  const { proc, me } = scoped;
  const peerId = req.params.peerId;

  const exists = (proc.participants || []).some((p) => p.id === peerId && p.id !== me.id);
  if (!exists) return res.status(404).json({ error: "Participante no encontrado." });

  const map = proc.responses.c2[me.id] || {};
  const entry = map[peerId] || { draft: { freeText: "" }, savedAt: null, submittedAt: null };
  res.json(entry);
});

app.put("/api/app/:processSlug/c2/:peerId", requireParticipant, (req, res) => {
  const peerId = req.params.peerId;
  const { draft } = req.body || {};
  const freeText = String(draft?.freeText || "");

  const next = updateDb((db2) => {
    const scoped2 = getProcAndMeScoped(db2, req);
    if (scoped2.error) return db2;

    const { proc, me } = scoped2;
    const exists = (proc.participants || []).some((p) => p.id === peerId && p.id !== me.id);
    if (!exists) return db2;

    proc.responses.c2[me.id] = proc.responses.c2[me.id] || {};
    proc.responses.c2[me.id][peerId] =
      proc.responses.c2[me.id][peerId] || { draft: { freeText: "" }, savedAt: null, submittedAt: null };

    if (proc.responses.c2[me.id][peerId].submittedAt) return db2; // locked after submit

    proc.responses.c2[me.id][peerId].draft = { freeText };
    proc.responses.c2[me.id][peerId].savedAt = new Date().toISOString();

    return db2;
  });

  const db = next;
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  const entry = proc?.responses?.c2?.[req.participant.participantId]?.[peerId];
  res.json(entry);
});

app.post("/api/app/:processSlug/c2/:peerId/submit", requireParticipant, (req, res) => {
  const peerId = req.params.peerId;

  const next = updateDb((db2) => {
    const scoped2 = getProcAndMeScoped(db2, req);
    if (scoped2.error) return db2;

    const { proc, me } = scoped2;
    const exists = (proc.participants || []).some((p) => p.id === peerId && p.id !== me.id);
    if (!exists) return db2;

    proc.responses.c2[me.id] = proc.responses.c2[me.id] || {};
    const entry =
      proc.responses.c2[me.id][peerId] || { draft: { freeText: "" }, savedAt: null, submittedAt: null };

    if (!hasMeaningfulDraft(entry.draft)) return db2;

    entry.submittedAt = new Date().toISOString();
    proc.responses.c2[me.id][peerId] = entry;
    return db2;
  });

  const db = next;
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  const entry = proc?.responses?.c2?.[req.participant.participantId]?.[peerId];

  if (!hasMeaningfulDraft(entry?.draft)) {
    return res.status(400).json({ error: "Debe completar el cuestionario antes de enviarlo." });
  }

  res.json(entry);
});

/* =========================
   ADMIN – PROCESSES SUMMARY
========================= */
app.get("/api/admin/processes-summary", requireAdmin, (_req, res) => {
  const db = readDb();

  const summary = db.processes.map((p) => {
    const participants = p.participants || [];
    const responses = p.responses || { c1: {}, c2: {} };

    const c1Total = participants.length;
    const c1Completed = Object.values(responses.c1 || {}).filter((r) => r?.submittedAt).length;

    let c2Total = 0;
    let c2Completed = 0;

    for (const me of participants) {
      const peers = participants.filter((x) => x.id !== me.id);
      c2Total += peers.length;

      const map = responses.c2?.[me.id] || {};
      c2Completed += Object.values(map).filter((r) => r?.submittedAt).length;
    }

    return {
      processSlug: p.processSlug,
      companyName: p.companyName,
      processName: p.processName,
      status: p.status,
      logoUrl: p.logoUrl || null,
      progress: {
        c1Completed,
        c1Total,
        c2Completed,
        c2Total,
      },
    };
  });

  res.json(summary);
});

/* =========================
   ADMIN – PROCESS DASHBOARD
========================= */
app.get("/api/admin/processes/:processSlug/dashboard", requireAdmin, (req, res) => {
  const db = readDb();
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

  const participants = proc.participants || [];
  const responses = proc.responses || { c1: {}, c2: {} };
  const c1 = responses.c1 || {};
  const c2 = responses.c2 || {};

  const rows = participants.map((p) => {
    const c1Entry = c1?.[p.id] || null;
    const c1Status = calcStatusFromDraft(c1Entry);

    const peersCount = participants.filter((x) => x.id !== p.id).length;
    const myMap = c2?.[p.id] || {};
    const completed = Object.values(myMap).filter((r) => r?.submittedAt).length;

    return {
      id: p.id,
      name: participantDisplayName(p),
      email: p.email || "",
      c1: c1Status.status,
      c2: { completed, total: peersCount },
    };
  });

  res.json({
    process: {
      processSlug: proc.processSlug,
      companyName: proc.companyName,
      processName: proc.processName,
      status: proc.status,
      logoUrl: proc.logoUrl || null,
      launchedAt: proc.launchedAt || null,
      closedAt: proc.closedAt || null,
    },
    participants: rows,
  });
});

/* =========================
   ADMIN – PARTICIPANT ACTIONS
========================= */
function ensureEventsArray(db) {
  db.events = Array.isArray(db.events) ? db.events : [];
  return db.events;
}

function pushEvent(db, evt) {
  const events = ensureEventsArray(db);
  events.push(evt);
}

function genTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

app.post(
  "/api/admin/processes/:processSlug/participants/:participantId/remind",
  requireAdmin,
  (req, res) => {
    const { processSlug, participantId } = req.params;

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    const participant = (proc.participants || []).find((p) => p.id === participantId);
    if (!participant) return res.status(404).json({ error: "Participante no encontrado." });

    const now = new Date().toISOString();

    updateDb((db2) => {
      const proc2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!proc2) return db2;

      const part2 = (proc2.participants || []).find((p) => p.id === participantId);
      if (!part2) return db2;

      pushEvent(db2, {
        id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ts: now,
        type: "ADMIN_REMINDER_REQUESTED",
        processSlug,
        participantId,
        participantEmail: String(part2.email || ""),
        participantName: participantDisplayName(part2),
        adminEmail: req.admin?.email || null,
      });

      return db2;
    });

    res.json({ ok: true, ts: now });
  },
);

app.post(
  "/api/admin/processes/:processSlug/participants/:participantId/reset-access",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    const participant = (proc.participants || []).find((p) => p.id === participantId);
    if (!participant) return res.status(404).json({ error: "Participante no encontrado." });

    const tempPassword = genTempPassword();
    const passwordHash = await bcrypt.hash(String(tempPassword), 10);
    const now = new Date().toISOString();

    updateDb((db2) => {
      const proc2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!proc2) return db2;

      const part2 = (proc2.participants || []).find((p) => p.id === participantId);
      if (!part2) return db2;

      part2.passwordHash = passwordHash;

      pushEvent(db2, {
        id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ts: now,
        type: "ADMIN_ACCESS_RESET",
        processSlug,
        participantId,
        participantEmail: String(part2.email || ""),
        participantName: participantDisplayName(part2),
        adminEmail: req.admin?.email || null,
      });

      return db2;
    });

    // Mock: devolvemos la clave para debug local (tu UI ya la oculta por defecto)
    res.json({
      ok: true,
      ts: now,
      tempPassword,
    });
  },
);

/* =========================
   ADMIN – EVENTS (LOGS)
   Query:
    - processSlug (optional)
    - participantId (optional)
    - type (optional)
    - limit (optional, default 200, max 500)
========================= */
app.get("/api/admin/events", requireAdmin, (req, res) => {
  const { processSlug, participantId, type } = req.query || {};
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 500)
    : 200;

  const db = readDb();
  const events = Array.isArray(db.events) ? db.events : [];

  let out = events;

  if (processSlug) out = out.filter((e) => e?.processSlug === String(processSlug));
  if (participantId) out = out.filter((e) => e?.participantId === String(participantId));
  if (type) out = out.filter((e) => e?.type === String(type));

  out = out
    .slice()
    .sort((a, b) => String(b?.ts || "").localeCompare(String(a?.ts || "")))
    .slice(0, limit);

  res.json(out);
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
