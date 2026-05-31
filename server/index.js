import "dotenv/config";

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";

import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { readDb, updateDb } from "./lib/db.js";

import {
  testConnection,
  listProcessesFromPg,
  getProcessFromPg,
  listProcessSummariesFromPg,
  listParticipantsFromPg,
  findParticipantsByEmailFromPg,
  getParticipantFromPg,
  getC1ResponseFromPg,
  listC1ResponsesByProcessFromPg,
  upsertC1ResponseDraftToPg,
  submitC1ResponseInPg,
  listC2ResponsesByParticipantFromPg,
  listC2ResponsesByProcessFromPg,
  getC2ResponseFromPg,
  upsertC2ResponseDraftToPg,
  submitC2ResponseInPg,
  insertParticipantToPg,
  updateParticipantInPg,
  deleteParticipantFromPg,
  resetParticipantAccessInPg,
  upsertProcessToPg,
  replaceProcessQuestionnaireTemplatesInPg,
  getProcessTemplatesFromPg,
  upsertProcessTemplateToPg,
  getBaseTemplateFromPg,
  getBaseTemplatesFromPg,
  upsertBaseTemplateToPg,
  deleteProcessFromPg,
  renameProcessSlugInPg,
} from "./lib/pg.js";

import {
  requireAdmin,
  signAdminToken,
  requireParticipant,
  signParticipantToken,
} from "./lib/auth.js";

import {
  hasMeaningfulDraft,
  computeCompletionFromTemplate,
  calcStatusFromEntryAndTemplate,
} from "./lib/questionnaires.js";
import process from "process";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "uploads");
const LOGO_DIR = path.join(UPLOAD_DIR, "logos");

if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

app.use("/uploads", express.static(UPLOAD_DIR));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* =========================
   HELPERS
========================= */

function slugify(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function generateUniqueProcessSlug(db, desiredSlug, companyName, processName) {
  const base =
    slugify(desiredSlug) ||
    slugify(`${companyName}-${processName}`) ||
    `process-${Date.now()}`;

  let slug = base;
  let counter = 2;

  while (db.processes.some((p) => p.processSlug === slug)) {
    slug = `${base}-${counter++}`;
  }

  return slug;
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

// ===== Response entry helpers (pure accessors over process.responses) =====

function canParticipantEdit(proc) {
  // Editar = guardar draft + submit
  return proc?.status === "EN_CURSO";
}

function canParticipantView(proc) {
  // Ver = GETs /questionnaires, /templates, /c1, /c2
  // Permitimos ver incluso cerrado (histórico). Ajustable.
  return proc?.status === "EN_CURSO" || proc?.status === "CERRADO";
}

function ensureResponsesShape(p) {
  if (!p.responses || typeof p.responses !== "object")
    p.responses = { c1: {}, c2: {} };
  if (!p.responses.c1 || typeof p.responses.c1 !== "object")
    p.responses.c1 = {};
  if (!p.responses.c2 || typeof p.responses.c2 !== "object")
    p.responses.c2 = {};
  return p.responses;
}

// Read a response entry
// - kind=c1: p.responses.c1[participantId]
// - kind=c2: p.responses.c2[participantId][peerId]
function getResponseEntry(p, kind, participantId, peerId) {
  const k = String(kind || "").toLowerCase();
  const pid = String(participantId || "");
  const peer = peerId == null ? null : String(peerId);

  if (!p || typeof p !== "object") return null;
  const responses = ensureResponsesShape(p);

  if (k === "c1") {
    const entry = responses.c1?.[pid];
    return entry && typeof entry === "object" ? entry : null;
  }

  if (k === "c2") {
    const byPid = responses.c2?.[pid];
    if (!byPid || typeof byPid !== "object") return null;
    const entry = byPid?.[peer || ""];
    return entry && typeof entry === "object" ? entry : null;
  }

  return null;
}

// Write a response entry (creates intermediate objects as needed)
function setResponseEntry(p, kind, participantId, peerId, entry) {
  const k = String(kind || "").toLowerCase();
  const pid = String(participantId || "");
  const peer = peerId == null ? null : String(peerId);

  if (!p || typeof p !== "object") return;
  const responses = ensureResponsesShape(p);

  if (k === "c1") {
    responses.c1[pid] = entry;
    return;
  }

  if (k === "c2") {
    if (!responses.c2[pid] || typeof responses.c2[pid] !== "object")
      responses.c2[pid] = {};
    responses.c2[pid][peer || ""] = entry;
    return;
  }
}

function participantDisplayName(p) {
  const fn = p.firstName || "";
  const ln = p.lastName || "";
  return `${fn} ${ln}`.trim() || p.email || "Participante";
}

function normalizeEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

async function getProcAndMeScoped(db, req) {
  const { processSlug } = req.params;
  if (req.participant.processSlug !== processSlug)
    return { error: "Acceso denegado.", status: 403 };

  const proc = db.processes.find((p) => p.processSlug === processSlug);
  if (!proc) return { error: "Proceso no encontrado.", status: 404 };

  let me = null;
  try {
    me = await getParticipantFromPg(processSlug, req.participant.participantId);
  } catch (err) {
    return { error: "No se pudo validar el participante.", status: 500 };
  }

  if (!me) return { error: "Acceso denegado.", status: 403 };

  proc.responses = proc.responses || { c1: {}, c2: {} };
  proc.responses.c1 = proc.responses.c1 || {};
  proc.responses.c2 = proc.responses.c2 || {};

  return { proc, me };
}

async function getProcAndMeScopedWithPg(req) {
  const db = readDb();
  const { processSlug } = req.params;

  if (req.participant.processSlug !== processSlug)
    return { error: "Acceso denegado.", status: 403 };

  const proc = db.processes.find((p) => p.processSlug === processSlug);
  if (!proc) return { error: "Proceso no encontrado.", status: 404 };

  let me = null;
  try {
    me = await getParticipantFromPg(processSlug, req.participant.participantId);
  } catch (err) {
    return { error: "No se pudo validar el participante.", status: 500 };
  }

  if (!me) return { error: "Acceso denegado.", status: 403 };

  proc.responses = proc.responses || { c1: {}, c2: {} };
  proc.responses.c1 = proc.responses.c1 || {};
  proc.responses.c2 = proc.responses.c2 || {};

  return { proc, me };
}

/* =========================
   DRAFT + SUBMIT HELPERS
========================= */
function ensureC1Entry(proc, meId) {
  proc.responses.c1[meId] = proc.responses.c1[meId] || {
    draft: { answers: {} },
    savedAt: null,
    submittedAt: null,
  };

  const entry = proc.responses.c1[meId];
  entry.draft = entry.draft || {};
  if (!entry.draft.answers || typeof entry.draft.answers !== "object")
    entry.draft.answers = {};
  return entry;
}

function ensureC2Entry(proc, meId, peerId) {
  proc.responses.c2[meId] = proc.responses.c2[meId] || {};
  proc.responses.c2[meId][peerId] = proc.responses.c2[meId][peerId] || {
    draft: { answers: {}, freeText: "" },
    savedAt: null,
    submittedAt: null,
  };

  const entry = proc.responses.c2[meId][peerId];
  entry.draft = entry.draft || {};
  if (!entry.draft.answers || typeof entry.draft.answers !== "object")
    entry.draft.answers = {};
  if (typeof entry.draft.freeText !== "string") entry.draft.freeText = "";
  return entry;
}

function saveDraftIntoEntry({
  entry,
  incomingDraft,
  forceLegacyFreeText = false,
}) {
  const safeIncoming =
    incomingDraft && typeof incomingDraft === "object" ? incomingDraft : {};
  const prev = entry.draft || {};

  const freeText = forceLegacyFreeText
    ? String(safeIncoming?.freeText || "")
    : String(safeIncoming?.freeText || prev.freeText || "");
  const answers =
    safeIncoming.answers && typeof safeIncoming.answers === "object"
      ? safeIncoming.answers
      : prev.answers || {};

  entry.draft = {
    ...prev,
    ...safeIncoming,
    freeText, // legacy
    answers,
  };

  entry.savedAt = new Date().toISOString();
}

function validateBeforeSubmit({ proc, meId, kind, peerId = null }) {
  const tpl = proc.templates?.[kind] || null;

  let entry0 = null;
  if (kind === "c1") {
    entry0 = proc.responses?.c1?.[meId] || null;
  } else {
    entry0 = proc.responses?.c2?.[meId]?.[peerId] || null;
  }

  if (!hasMeaningfulDraft(entry0?.draft)) {
    return {
      ok: false,
      status: 400,
      payload: { error: "Debe completar el cuestionario antes de enviarlo." },
    };
  }

  const comp0 = computeCompletionFromTemplate(tpl, entry0?.draft);

  if (Array.isArray(comp0.invalidIds) && comp0.invalidIds.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        error:
          "Hay pares inválidos en las selecciones para conversaciones. No se permite una persona con sigo misma ni pares de personas duplicados. Corríjalos antes de enviar.",
        missingIds: comp0.invalidIds, // scroll/highlight
        percent: comp0.percent,
      },
    };
  }

  if (comp0.total > 0 && comp0.missingIds.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "Debe completar todas las preguntas antes de enviarlo.",
        missingIds: comp0.missingIds,
        percent: comp0.percent,
      },
    };
  }

  return { ok: true, status: 200, payload: null };
}

/* =========================
   CONFIGURE MULTER FOR LOGO UPLOADS
========================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("El archivo debe ser de tipo imagen."));
    } else {
      cb(null, true);
    }
  },
});

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
app.get("/api/admin/base-templates/:kind", requireAdmin, async (req, res) => {
  const kind = req.params.kind;
  if (!["c1", "c2"].includes(kind))
    return res.status(404).json({ error: "No encontrado." });

  try {
    const tpl = await getBaseTemplateFromPg(kind);
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: "No se pudo cargar la plantilla base." });
  }
});

app.put("/api/admin/base-templates/:kind", requireAdmin, async (req, res) => {
  const kind = req.params.kind;
  if (!["c1", "c2"].includes(kind))
    return res.status(404).json({ error: "No encontrado." });

  const incoming = req.body || {};

  const next = updateDb((db) => {
    db.baseTemplates = db.baseTemplates || {};
    db.baseTemplates[kind] = { ...db.baseTemplates[kind], ...incoming };
    return db;
  });

  const merged = next.baseTemplates[kind];

  try {
    await upsertBaseTemplateToPg(kind, merged);
  } catch (err) {
    return res.status(500).json({
      error:
        "La plantilla base se guardó en JSON pero falló la sincronización a PostgreSQL.",
    });
  }

  res.json(merged);
});

/* =========================
   PROCESSES (ADMIN)
========================= */
app.get("/api/admin/processes", requireAdmin, async (_req, res) => {
  try {
    const processes = await listProcessesFromPg();
    res.json(processes);
  } catch (err) {
    res.status(500).json({ error: "No se pudieron cargar los procesos." });
  }
});

app.post("/api/admin/processes", requireAdmin, async (req, res) => {
  const {
    companyName,
    processName,
    processSlug: requestedSlug,
    expectedStartAt,
    expectedEndAt,
  } = req.body || {};

  const companyNameClean = String(companyName || "").trim();
  const processNameClean = String(processName || "").trim();

  if (!companyNameClean || !processNameClean) {
    return res.status(400).json({ error: "Datos incompletos." });
  }

  const db = readDb();
  const processSlug = generateUniqueProcessSlug(
    db,
    requestedSlug,
    companyNameClean,
    processNameClean,
  );

  let baseTemplates = null;
  try {
    baseTemplates = await getBaseTemplatesFromPg();
  } catch (err) {
    return res
      .status(500)
      .json({ error: "No se pudieron cargar las plantillas base." });
  }

  if (!baseTemplates?.c1 || !baseTemplates?.c2) {
    return res.status(500).json({
      error: "No se encontraron las plantillas base en PostgreSQL.",
    });
  }

  const now = new Date().toISOString();

  const newProcess = {
    processSlug,
    companyName: companyNameClean,
    processName: processNameClean,
    status: "EN_PREPARACION",
    templates: structuredClone(baseTemplates),
    participants: [],
    responses: { c1: {}, c2: {} },
    createdAt: now,
    launchedAt: null,
    closedAt: null,
    expectedStartAt: expectedStartAt || null,
    expectedEndAt: expectedEndAt || null,
    logoUrl: null,
  };

  updateDb((db2) => {
    db2.processes.push(newProcess);
    return db2;
  });

  try {
    await upsertProcessToPg(newProcess);
    await replaceProcessQuestionnaireTemplatesInPg(newProcess);
  } catch (err) {
    return res.status(500).json({
      error:
        "El proceso se guardó en JSON pero falló la sincronización a PostgreSQL.",
    });
  }

  res.json(newProcess);
});

app.get(
  "/api/admin/processes/:processSlug",
  requireAdmin,
  async (req, res) => {
    try {
      const proc = await getProcessFromPg(req.params.processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });
      res.json(proc);
    } catch (err) {
      res.status(500).json({ error: "No se pudo cargar el proceso." });
    }
  },
);

// Update Slug
app.put("/api/admin/processes/:processSlug", requireAdmin, async (req, res) => {
  const { processSlug } = req.params;
  const {
    companyName,
    processName,
    expectedStartAt,
    expectedEndAt,
    logoUrl,
    newSlug,
  } = req.body || {};

  const db = readDb();
  const existing = db.processes.find((p) => p.processSlug === processSlug);

  if (!existing)
    return res.status(404).json({ error: "Proceso no encontrado." });

  if (existing.status !== "EN_PREPARACION")
    return res.status(400).json({
      error: "Solo se puede editar un proceso en EN_PREPARACION.",
    });

  // Slug change
  let finalSlug = processSlug;

  if (newSlug && newSlug !== processSlug) {
    const normalized = slugify(newSlug);

    if (!normalized) return res.status(400).json({ error: "Slug inválido." });

    if (db.processes.some((p) => p.processSlug === normalized))
      return res.status(409).json({ error: "El slug ya existe." });

    finalSlug = normalized;
  }

  const next = updateDb((db2) => {
    const proc = db2.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return db2;

    proc.companyName = companyName ?? proc.companyName;
    proc.processName = processName ?? proc.processName;
    proc.expectedStartAt = expectedStartAt ?? proc.expectedStartAt ?? null;
    proc.expectedEndAt = expectedEndAt ?? proc.expectedEndAt ?? null;
    proc.logoUrl = logoUrl ?? proc.logoUrl ?? null;

    if (finalSlug !== processSlug) {
      const oldLogoPath = path.join(LOGO_DIR, `${processSlug}.jpg`);
      const newLogoPath = path.join(LOGO_DIR, `${finalSlug}.jpg`);

      if (fs.existsSync(oldLogoPath)) {
        fs.renameSync(oldLogoPath, newLogoPath);
      }

      proc.processSlug = finalSlug;
      proc.logoUrl = `/uploads/logos/${finalSlug}.jpg`;
    }

    return db2;
  });

  const updated = next.processes.find((p) => p.processSlug === finalSlug);

  try {
    if (finalSlug !== processSlug) {
      await renameProcessSlugInPg(processSlug, finalSlug);
    }
    await upsertProcessToPg(updated);
    await replaceProcessQuestionnaireTemplatesInPg(updated);
  } catch (err) {
    return res.status(500).json({
      error:
        "El proceso se actualizó en JSON pero falló la sincronización a PostgreSQL.",
    });
  }

  res.json(updated);
});

app.get(
  "/api/admin/processes/:processSlug/progress",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;

    try {
      const participants = await listParticipantsFromPg(processSlug);
      const procPg = await getProcessFromPg(processSlug);

      if (!procPg)
        return res
          .status(404)
          .json({ error: `Process not found: ${processSlug}` });

      const c1Rows = await listC1ResponsesByProcessFromPg(processSlug);
      const c2Rows = await listC2ResponsesByProcessFromPg(processSlug);

      const db = readDb();
      const p = (db.processes || []).find(
        (x) => String(x?.processSlug || x?.slug || "") === String(processSlug),
      );
      if (!p)
        return res
          .status(404)
          .json({ error: `Process not found: ${processSlug}` });

      let templates = null;
      try {
        templates = await getProcessTemplatesFromPg(processSlug);
      } catch (err) {
        return res
          .status(500)
          .json({ error: "No se pudieron cargar las plantillas." });
      }

      const tplC1 = templates?.c1 || {};
      const tplC2 = templates?.c2 || {};

      const c1ByParticipantId = Object.fromEntries(
        c1Rows.map((row) => [row.participantId, row]),
      );

      const c2ByParticipantAndPeer = {};
      for (const row of c2Rows) {
        const pid = String(row.participantId || "");
        const peerId = String(row.peerId || "");
        if (!c2ByParticipantAndPeer[pid]) c2ByParticipantAndPeer[pid] = {};
        c2ByParticipantAndPeer[pid][peerId] = row;
      }

      function participantNameById(pid) {
        const found = participants.find(
          (pp) => String(pp?.id || "") === String(pid),
        );
        return found ? participantDisplayName(found) : String(pid);
      }

      const outParticipants = participants.map((pp) => {
        const participantId = String(pp?.id || "");
        const name = participantDisplayName(pp);

        const c1Entry = c1ByParticipantId[participantId] || null;
        const c1 = calcStatusFromEntryAndTemplate(c1Entry, tplC1);

        const questionnaires = [
          {
            kind: "c1",
            title: "C1",
            status: c1.status,
            percent: c1.percent,
            submittedAt: c1Entry?.submittedAt || null,
            savedAt: c1Entry?.savedAt || null,
          },
        ];

        for (const peer of participants) {
          const peerId = String(peer?.id || "");
          if (!peerId || peerId === participantId) continue;

          const entry =
            c2ByParticipantAndPeer?.[participantId]?.[peerId] || null;
          const st = calcStatusFromEntryAndTemplate(entry, tplC2);

          questionnaires.push({
            kind: "c2",
            peerId,
            title: `C2 → ${participantNameById(peerId)}`,
            status: entry?.submittedAt ? "done" : st.status,
            percent: entry?.submittedAt ? 100 : st.percent,
            submittedAt: entry?.submittedAt || null,
            savedAt: entry?.savedAt || null,
          });
        }

        return { id: participantId, name, questionnaires };
      });

      return res.json({
        processSlug: String(procPg.processSlug || processSlug),
        processName: procPg.processName || null,
        participants: outParticipants,
      });
    } catch (err) {
      return res.status(500).json({ error: "No se pudo cargar el progreso." });
    }
  },
);

app.patch(
  "/api/admin/processes/:processSlug/status",
  requireAdmin,
  async (req, res) => {
    const { status } = req.body || {};
    if (!["EN_PREPARACION", "EN_CURSO", "CERRADO"].includes(status))
      return res.status(400).json({ error: "Estado inválido." });

    const now = new Date().toISOString();

    const next = updateDb((db2) => {
      const proc2 = db2.processes.find(
        (p) => p.processSlug === req.params.processSlug,
      );
      if (!proc2) return db2;

      proc2.status = status;
      if (status === "EN_CURSO") proc2.launchedAt = now;
      if (status === "CERRADO") proc2.closedAt = now;

      return db2;
    });

    const proc = next.processes.find(
      (p) => p.processSlug === req.params.processSlug,
    );
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    try {
      await upsertProcessToPg(proc);
    } catch (err) {
      return res.status(500).json({
        error:
          "El estado se actualizó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json(proc);
  },
);

app.patch(
  "/api/admin/processes/:processSlug",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;
    const {
      companyName,
      processName,
      expectedStartAt,
      expectedEndAt,
      newSlug,
      logoUrl,
    } = req.body || {};

    const next = updateDb((db2) => {
      const proc = db2.processes.find((p) => p.processSlug === processSlug);
      if (!proc) return db2;

      // Only editable in EN_PREPARACION
      if (proc.status !== "EN_PREPARACION") {
        return db2;
      }

      if (companyName != null) {
        proc.companyName = String(companyName).trim();
      }

      if (processName != null) {
        proc.processName = String(processName).trim();
      }

      if (expectedStartAt !== undefined) {
        proc.expectedStartAt = expectedStartAt || null;
      }

      if (expectedEndAt !== undefined) {
        proc.expectedEndAt = expectedEndAt || null;
      }

      if (logoUrl !== undefined) {
        proc.logoUrl = logoUrl || null;
      }

      // Slug change
      if (newSlug && newSlug !== processSlug) {
        const exists = db2.processes.some((p) => p.processSlug === newSlug);
        if (!exists) {
          proc.processSlug = newSlug;
        }
      }

      return db2;
    });

    const updated = next.processes.find(
      (p) => p.processSlug === newSlug || p.processSlug === processSlug,
    );

    if (!updated) {
      return res.status(404).json({ error: "Proceso no encontrado." });
    }

    try {
      if (updated.processSlug !== processSlug) {
        await renameProcessSlugInPg(processSlug, updated.processSlug);
      }
      await upsertProcessToPg(updated);
      await replaceProcessQuestionnaireTemplatesInPg(updated);
    } catch (err) {
      return res.status(500).json({
        error:
          "El proceso se actualizó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json(updated);
  },
);

/* =========================
   PROCESS TEMPLATES (ADMIN)
========================= */
app.get(
  "/api/admin/processes/:processSlug/templates/:kind",
  requireAdmin,
  async (req, res) => {
    const { processSlug, kind } = req.params;
    if (!["c1", "c2"].includes(kind))
      return res.status(404).json({ error: "No encontrado." });

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      const templates = await getProcessTemplatesFromPg(processSlug);
      res.json(templates?.[kind] || null);
    } catch (err) {
      res
        .status(500)
        .json({ error: "No se pudieron cargar las plantillas." });
    }
  },
);

app.put(
  "/api/admin/processes/:processSlug/templates/:kind",
  requireAdmin,
  async (req, res) => {
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

    const merged = proc.templates[kind];

    try {
      await upsertProcessTemplateToPg(processSlug, kind, merged);
    } catch (err) {
      return res.status(500).json({
        error:
          "La plantilla se guardó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json(merged);
  },
);

/* =========================
   ADMIN – PROCESS LOGO UPLOAD
========================= */

app.post(
  "/api/admin/processes/:processSlug/logo",
  requireAdmin,
  upload.single("logo"),
  async (req, res) => {
    const { processSlug } = req.params;

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);

    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    if (proc.status !== "EN_PREPARACION")
      return res.status(400).json({
        error: "Solo se puede modificar el logo en EN_PREPARACION.",
      });

    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const outputPath = path.join(LOGO_DIR, `${processSlug}.jpg`);

    try {
      await sharp(req.file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .flatten({ background: "#ffffff" }) // white background for transparent images
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    } catch (err) {
      return res.status(500).json({ error: "Image processing failed." });
    }

    const logoUrl = `/uploads/logos/${processSlug}.jpg`;

    const next = updateDb((db2) => {
      const p2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (p2) p2.logoUrl = logoUrl;
      return db2;
    });

    const updatedProc = next.processes.find(
      (p) => p.processSlug === processSlug,
    );

    try {
      await upsertProcessToPg(updatedProc);
    } catch (err) {
      return res.status(500).json({
        error:
          "El logo se guardó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json({ logoUrl });
  },
);

/* =========================
   PARTICIPANTS AUTH (APP)
========================= */
app.post("/api/app/login", async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || "")
    .trim()
    .toLowerCase();

  if (!emailNorm || !password)
    return res.status(400).json({ error: "Datos incompletos." });

  let matches;
  try {
    matches = await findParticipantsByEmailFromPg(emailNorm);
  } catch (err) {
    return res.status(500).json({ error: "No se pudo iniciar sesión." });
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(401).json({ error: "Credenciales inválidas." });
  }

  if (matches.length > 1) {
    return res.status(409).json({
      error:
        "Este correo pertenece a más de un proceso. Ingrese utilizando el enlace de invitación.",
    });
  }

  const row = matches[0];

  if (!row.passwordHash)
    return res.status(401).json({ error: "Credenciales inválidas." });

  const ok = await bcrypt.compare(String(password || ""), row.passwordHash);

  if (!ok) return res.status(401).json({ error: "Credenciales inválidas." });

  const participant = {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
  };

  const token = signParticipantToken({
    processSlug: row.processSlug,
    participantId: row.id,
    email: row.email,
    name: participantDisplayName(participant),
  });

  res.json({
    token,
    participant: {
      id: row.id,
      name: participantDisplayName(participant),
      email: row.email,
    },
    process: {
      processSlug: row.processSlug,
      companyName: row.companyName,
      processName: row.processName,
      logoUrl: row.logoUrl || null,
    },
  });
});

/* =========================
   PARTICIPANT API (SCOPED)
========================= */
app.get(
  "/api/app/:processSlug/questionnaires",
  requireParticipant,
  async (req, res) => {
    const db = readDb();
    const scoped = await getProcAndMeScoped(db, req);
    if (scoped.error)
      return res.status(scoped.status).json({ error: scoped.error });

    const { proc, me } = scoped;

    let participants = [];
    let c2Rows = [];
    let c1Entry = null;

    try {
      participants = await listParticipantsFromPg(proc.processSlug);
      c1Entry = await getC1ResponseFromPg(proc.processSlug, me.id);
      c2Rows = await listC2ResponsesByParticipantFromPg(
        proc.processSlug,
        me.id,
      );
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar las respuestas." });
    }

    const c2ByPeerId = Object.fromEntries(
      c2Rows.map((row) => [row.peerId, row]),
    );

    let templates = null;
    try {
      templates = await getProcessTemplatesFromPg(proc.processSlug);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar las plantillas." });
    }

    const c1Tpl = templates?.c1 || null;
    const c2Tpl = templates?.c2 || null;

    const c1Status = calcStatusFromEntryAndTemplate(c1Entry, c1Tpl);

    const peers = participants
      .filter(
        (p) =>
          p.id !== me.id &&
          normalizeEmail(p.email) !== normalizeEmail(me.email),
      )
      .map((p) => {
        const entry = c2ByPeerId[p.id] || null;
        const st = calcStatusFromEntryAndTemplate(entry, c2Tpl);
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
        logoUrl: proc.logoUrl || null,
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
  },
);

app.get(
  "/api/app/:processSlug/templates/:kind",
  requireParticipant,
  async (req, res) => {
    const { kind } = req.params;
    if (!["c1", "c2"].includes(kind))
      return res.status(404).json({ error: "No encontrado." });

    const db = readDb();
    const scoped = await getProcAndMeScoped(db, req);
    if (scoped.error)
      return res.status(scoped.status).json({ error: scoped.error });

    let templates = null;
    try {
      templates = await getProcessTemplatesFromPg(scoped.proc.processSlug);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar las plantillas." });
    }

    res.json(templates?.[kind] || null);
  },
);

/* =========================
   C1 DRAFT + SUBMIT
========================= */
app.get("/api/app/:processSlug/c1", requireParticipant, async (req, res) => {
  const db = readDb();
  const scoped = await getProcAndMeScoped(db, req);
  if (scoped.error)
    return res.status(scoped.status).json({ error: scoped.error });

  let entry = null;
  try {
    entry = await getC1ResponseFromPg(scoped.proc.processSlug, scoped.me.id);
  } catch (err) {
    return res.status(500).json({ error: "No se pudo cargar la respuesta." });
  }

  if (!entry) {
    return res.json({
      draft: { answers: {} },
      savedAt: null,
      submittedAt: null,
    });
  }

  entry.draft = entry.draft || {};
  if (!entry.draft.answers || typeof entry.draft.answers !== "object") {
    entry.draft.answers = {};
  }

  res.json(entry);
});

app.put("/api/app/:processSlug/c1", requireParticipant, async (req, res) => {
  const { draft } = req.body || {};
  const incomingDraft = draft && typeof draft === "object" ? draft : {};

  const db0 = readDb();
  const scoped0 = await getProcAndMeScoped(db0, req);
  if (scoped0.error)
    return res.status(scoped0.status).json({ error: scoped0.error });

  const { proc, me } = scoped0;
  if (!canParticipantEdit(proc)) {
    return res
      .status(403)
      .json({ error: "El proceso no está habilitado para edición." });
  }

  let currentEntry = null;
  try {
    currentEntry = await getC1ResponseFromPg(proc.processSlug, me.id);
  } catch (err) {
    return res.status(500).json({ error: "No se pudo cargar la respuesta." });
  }

  const entry = currentEntry || {
    draft: { answers: {} },
    savedAt: null,
    submittedAt: null,
  };

  if (entry.submittedAt) {
    return res.json(entry);
  }

  saveDraftIntoEntry({ entry, incomingDraft, forceLegacyFreeText: true });

  let saved = null;
  try {
    saved = await upsertC1ResponseDraftToPg(
      proc.processSlug,
      me.id,
      entry.draft,
    );
  } catch (err) {
    return res.status(500).json({ error: "No se pudo guardar." });
  }

  return res.json(
    saved || { draft: { answers: {} }, savedAt: null, submittedAt: null },
  );
});

app.post(
  "/api/app/:processSlug/c1/submit",
  requireParticipant,
  async (req, res) => {
    const processSlug = req.params.processSlug;

    const db0 = readDb();
    const scoped0 = await getProcAndMeScoped(db0, req);
    if (scoped0.error)
      return res.status(scoped0.status).json({ error: scoped0.error });

    const { proc: p0, me: me0 } = scoped0;

    if (!canParticipantEdit(p0)) {
      return res.status(403).json({
        error: "El proceso está cerrado. No se pueden enviar respuestas.",
      });
    }

    let currentEntry = null;
    try {
      currentEntry = await getC1ResponseFromPg(processSlug, me0.id);
    } catch (err) {
      return res.status(500).json({ error: "No se pudo cargar la respuesta." });
    }

    let templates = null;
    try {
      templates = await getProcessTemplatesFromPg(processSlug);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar las plantillas." });
    }

    const procForValidation = {
      ...p0,
      templates: {
        c1: templates?.c1 || null,
        c2: templates?.c2 || null,
      },
      responses: {
        c1: {
          [me0.id]: currentEntry || null,
        },
        c2: {},
      },
    };
    const validation = validateBeforeSubmit({
      proc: procForValidation,
      meId: me0.id,
      kind: "c1",
    });

    if (!validation.ok)
      return res.status(validation.status).json(validation.payload);

    let entry = null;
    try {
      entry = await submitC1ResponseInPg(processSlug, me0.id);
    } catch (err) {
      return res.status(500).json({ error: "No se pudo enviar." });
    }

    res.json(entry);
  },
);

/* =========================
   C2 DRAFT + SUBMIT (per peer)
========================= */
app.get(
  "/api/app/:processSlug/c2/:peerId",
  requireParticipant,
  async (req, res) => {
    const db = readDb();
    const scoped = await getProcAndMeScoped(db, req);
    if (scoped.error)
      return res.status(scoped.status).json({ error: scoped.error });

    const { proc, me } = scoped;
    const peerId = req.params.peerId;

    let participants = [];
    let entry = null;
    try {
      participants = await listParticipantsFromPg(proc.processSlug);
      entry = await getC2ResponseFromPg(proc.processSlug, me.id, peerId);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar los datos." });
    }

    const exists = participants.some((p) => p.id === peerId && p.id !== me.id);
    if (!exists)
      return res.status(404).json({ error: "Participante no encontrado." });

    if (!entry) {
      entry = {
        draft: { answers: {}, freeText: "" },
        savedAt: null,
        submittedAt: null,
      };
    }

    entry.draft = entry.draft || {};
    if (!entry.draft.answers || typeof entry.draft.answers !== "object")
      entry.draft.answers = {};
    if (typeof entry.draft.freeText !== "string") entry.draft.freeText = "";

    res.json(entry);
  },
);

app.put(
  "/api/app/:processSlug/c2/:peerId",
  requireParticipant,
  async (req, res) => {
    const peerId = req.params.peerId;
    const { draft } = req.body || {};
    const incomingDraft = draft && typeof draft === "object" ? draft : {};

    const db0 = readDb();
    const scoped0 = await getProcAndMeScoped(db0, req);
    if (scoped0.error)
      return res.status(scoped0.status).json({ error: scoped0.error });

    const { proc, me } = scoped0;

    if (!canParticipantEdit(proc)) {
      return res
        .status(403)
        .json({ error: "El proceso no está habilitado para edición." });
    }

    let participants = [];
    let currentEntry = null;
    try {
      participants = await listParticipantsFromPg(proc.processSlug);
      currentEntry = await getC2ResponseFromPg(proc.processSlug, me.id, peerId);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar los datos." });
    }

    const exists0 = participants.some((p) => p.id === peerId && p.id !== me.id);
    if (!exists0)
      return res.status(404).json({ error: "Participante no encontrado." });

    const entry = currentEntry || {
      draft: { answers: {}, freeText: "" },
      savedAt: null,
      submittedAt: null,
    };

    if (entry.submittedAt) {
      return res.json(entry);
    }

    saveDraftIntoEntry({ entry, incomingDraft, forceLegacyFreeText: true });

    let saved = null;
    try {
      saved = await upsertC2ResponseDraftToPg(
        proc.processSlug,
        me.id,
        peerId,
        entry.draft,
      );
    } catch (err) {
      return res.status(500).json({ error: "No se pudo guardar." });
    }

    return res.json(
      saved || {
        draft: { answers: {}, freeText: "" },
        savedAt: null,
        submittedAt: null,
      },
    );
  },
);

app.post(
  "/api/app/:processSlug/c2/:peerId/submit",
  requireParticipant,
  async (req, res) => {
    const processSlug = req.params.processSlug;
    const peerId = req.params.peerId;

    const db0 = readDb();
    const scoped0 = await getProcAndMeScoped(db0, req);
    if (scoped0.error)
      return res.status(scoped0.status).json({ error: scoped0.error });

    const { proc: p0, me: me0 } = scoped0;

    if (!canParticipantEdit(p0)) {
      return res.status(403).json({
        error: "El proceso está cerrado. No se pueden enviar respuestas.",
      });
    }

    let participants = [];
    let currentEntry = null;
    try {
      participants = await listParticipantsFromPg(processSlug);
      currentEntry = await getC2ResponseFromPg(processSlug, me0.id, peerId);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar los datos." });
    }

    const exists = participants.some((p) => p.id === peerId && p.id !== me0.id);
    if (!exists)
      return res.status(404).json({ error: "Participante no encontrado." });

    let templates = null;
    try {
      templates = await getProcessTemplatesFromPg(processSlug);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "No se pudieron cargar las plantillas." });
    }

    const procForValidation = {
      ...p0,
      templates: {
        c1: templates?.c1 || null,
        c2: templates?.c2 || null,
      },
      responses: {
        c1: {},
        c2: {
          [me0.id]: {
            [peerId]: currentEntry || null,
          },
        },
      },
    };

    const validation = validateBeforeSubmit({
      proc: procForValidation,
      meId: me0.id,
      kind: "c2",
      peerId,
    });

    if (!validation.ok)
      return res.status(validation.status).json(validation.payload);

    let entry = null;
    try {
      entry = await submitC2ResponseInPg(processSlug, me0.id, peerId);
    } catch (err) {
      return res.status(500).json({ error: "No se pudo enviar." });
    }

    res.json(entry);
  },
);

/* =========================
   ADMIN DB TEST
========================= */
app.get("/api/admin/db-test", requireAdmin, async (_req, res) => {
  try {
    const result = await testConnection();
    res.json({ ok: true, now: result.now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   ADMIN – PROCESSES SUMMARY
========================= */
app.get("/api/admin/processes-summary", requireAdmin, async (_req, res) => {
  try {
    const summary = await listProcessSummariesFromPg();
    res.json(summary);
  } catch (err) {
    res
      .status(500)
      .json({ error: "No se pudo cargar el resumen de procesos." });
  }
});

/* =========================
   ADMIN – PROCESS DASHBOARD
========================= */
app.get(
  "/api/admin/processes/:processSlug/dashboard",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;

    try {
      const procPg = await getProcessFromPg(processSlug);
      if (!procPg)
        return res.status(404).json({ error: "Proceso no encontrado." });

      const participants = await listParticipantsFromPg(processSlug);
      const c1Rows = await listC1ResponsesByProcessFromPg(processSlug);
      const c2Rows = await listC2ResponsesByProcessFromPg(processSlug);

      const db = readDb();
      const procJson = db.processes.find((p) => p.processSlug === processSlug);
      if (!procJson)
        return res.status(404).json({ error: "Proceso no encontrado." });

      let templates = null;
      try {
        templates = await getProcessTemplatesFromPg(processSlug);
      } catch (err) {
        return res
          .status(500)
          .json({ error: "No se pudieron cargar las plantillas." });
      }

      const tplC1 = templates?.c1 || {};

      const c1ByParticipantId = Object.fromEntries(
        c1Rows.map((row) => [row.participantId, row]),
      );

      const c2SubmittedCountByParticipantId = {};
      for (const row of c2Rows) {
        if (!row?.submittedAt) continue;
        const pid = String(row.participantId || "");
        c2SubmittedCountByParticipantId[pid] =
          (c2SubmittedCountByParticipantId[pid] || 0) + 1;
      }

      const rows = participants.map((p) => {
        const c1Entry = c1ByParticipantId[p.id] || null;
        const c1Status = calcStatusFromEntryAndTemplate(c1Entry, tplC1);

        const peersCount = participants.filter((x) => x.id !== p.id).length;
        const completed = c2SubmittedCountByParticipantId[p.id] || 0;

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
          processSlug: procPg.processSlug,
          companyName: procPg.companyName,
          processName: procPg.processName,
          status: procPg.status,
          logoUrl: procPg.logoUrl || null,
          launchedAt: procPg.launchedAt || null,
          closedAt: procPg.closedAt || null,
        },
        participants: rows,
      });
    } catch (err) {
      res.status(500).json({ error: "No se pudo cargar el proceso." });
    }
  },
);

/* =========================
   ADMIN – PARTICIPANTS CRUD (EN_PREPARACION only)
========================= */

app.get(
  "/api/admin/processes/:processSlug/participants",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      const participants = await listParticipantsFromPg(processSlug);
      res.json(participants);
    } catch (err) {
      res
        .status(500)
        .json({ error: "No se pudieron cargar los participantes." });
    }
  },
);

app.post(
  "/api/admin/processes/:processSlug/participants",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;
    const { firstName, lastName, email } = req.body || {};

    if (!firstName || !lastName || !email)
      return res.status(400).json({ error: "Datos incompletos." });

    const emailNorm = String(email).trim().toLowerCase();

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    if (proc.status !== "EN_PREPARACION")
      return res.status(400).json({
        error: "Solo se pueden agregar participantes en EN_PREPARACION.",
      });

    if (
      (proc.participants || []).some((p) => p.email.toLowerCase() === emailNorm)
    )
      return res
        .status(409)
        .json({ error: "El correo ya existe en el proceso." });

    const id = `p-${Date.now()}`;
    const tempPassword = genTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newParticipant = {
      id,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: emailNorm,
      passwordHash,
    };

    updateDb((db2) => {
      const p2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!p2) return db2;
      p2.participants.push(newParticipant);
      return db2;
    });

    try {
      await insertParticipantToPg(processSlug, newParticipant);
    } catch (err) {
      return res.status(500).json({
        error:
          "El participante se guardó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json({
      ...newParticipant,
      tempPassword,
    });
  },
);

app.put(
  "/api/admin/processes/:processSlug/participants/:participantId",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;
    const { firstName, lastName, email } = req.body || {};

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    if (proc.status !== "EN_PREPARACION")
      return res.status(400).json({
        error: "Solo se pueden editar participantes en EN_PREPARACION.",
      });

    const participant = (proc.participants || []).find(
      (p) => p.id === participantId,
    );
    if (!participant)
      return res.status(404).json({ error: "Participante no encontrado." });

    let emailNorm = null;
    if (email !== undefined) {
      emailNorm = String(email).trim().toLowerCase();
      if (
        (proc.participants || []).some(
          (p) => p.email === emailNorm && p.id !== participantId,
        )
      ) {
        return res
          .status(409)
          .json({ error: "El correo ya existe en el proceso." });
      }
    }

    const next = updateDb((db2) => {
      const proc2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!proc2) return db2;

      const participant2 = (proc2.participants || []).find(
        (p) => p.id === participantId,
      );
      if (!participant2) return db2;

      if (firstName !== undefined) {
        participant2.firstName = String(firstName).trim();
      }
      if (lastName !== undefined) {
        participant2.lastName = String(lastName).trim();
      }
      if (emailNorm !== null) {
        participant2.email = emailNorm;
      }

      return db2;
    });

    const updatedProc = next.processes.find(
      (p) => p.processSlug === processSlug,
    );
    const updatedParticipant = (updatedProc?.participants || []).find(
      (p) => p.id === participantId,
    );

    if (!updatedParticipant) {
      return res.status(404).json({ error: "Participante no encontrado." });
    }

    try {
      await updateParticipantInPg(processSlug, updatedParticipant);
    } catch (err) {
      return res.status(500).json({
        error:
          "El participante se actualizó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json(updatedParticipant);
  },
);

app.delete(
  "/api/admin/processes/:processSlug/participants/:participantId",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

    if (proc.status !== "EN_PREPARACION")
      return res.status(400).json({
        error: "Solo se pueden eliminar participantes en EN_PREPARACION.",
      });

    const participant = (proc.participants || []).find(
      (p) => p.id === participantId,
    );
    if (!participant)
      return res.status(404).json({ error: "Participante no encontrado." });

    updateDb((db2) => {
      const p2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!p2) return db2;

      p2.participants = (p2.participants || []).filter(
        (p) => p.id !== participantId,
      );

      return db2;
    });

    try {
      await deleteParticipantFromPg(processSlug, participantId);
    } catch (err) {
      return res.status(500).json({
        error:
          "El participante se eliminó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json({ ok: true });
  },
);

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
  for (let i = 0; i < 10; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
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

    const participant = (proc.participants || []).find(
      (p) => p.id === participantId,
    );
    if (!participant)
      return res.status(404).json({ error: "Participante no encontrado." });

    const now = new Date().toISOString();

    updateDb((db2) => {
      const proc2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!proc2) return db2;

      const part2 = (proc2.participants || []).find(
        (p) => p.id === participantId,
      );
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

    const participant = (proc.participants || []).find(
      (p) => p.id === participantId,
    );
    if (!participant)
      return res.status(404).json({ error: "Participante no encontrado." });

    const tempPassword = genTempPassword();
    const passwordHash = await bcrypt.hash(String(tempPassword), 10);
    const now = new Date().toISOString();

    updateDb((db2) => {
      const proc2 = db2.processes.find((p) => p.processSlug === processSlug);
      if (!proc2) return db2;

      const part2 = (proc2.participants || []).find(
        (p) => p.id === participantId,
      );
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

    try {
      await resetParticipantAccessInPg(
        processSlug,
        participantId,
        passwordHash,
      );
    } catch (err) {
      return res.status(500).json({
        error:
          "El acceso se reseteó en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    res.json({ ok: true, ts: now, tempPassword });
  },
);

app.post(
  "/api/admin/processes/:processSlug/participants/:participantId/reopen",
  requireAdmin,
  (req, res) => {
    const { processSlug, participantId } = req.params;
    const { kind, peerId } = req.body || {};

    const k = String(kind || "")
      .toLowerCase()
      .trim();
    if (k !== "c1" && k !== "c2") {
      return res.status(400).json({ error: "Body.kind must be 'c1' or 'c2'." });
    }
    if (k === "c2" && !peerId) {
      return res
        .status(400)
        .json({ error: "Body.peerId is required for kind=c2." });
    }

    const now = new Date().toISOString();

    const nextDb = updateDb((db) => {
      const p = (db.processes || []).find(
        (x) => String(x?.processSlug || x?.slug || "") === String(processSlug),
      );
      if (!p) throw new Error(`Process not found: ${processSlug}`);

      const pid = String(participantId);

      const existing = getResponseEntry(
        p,
        k,
        pid,
        peerId ? String(peerId) : null,
      );

      // If no entry exists yet, create a blank one (so admin can "unsubmit" into an editable draft)
      const entry =
        existing && typeof existing === "object"
          ? structuredClone(existing)
          : { draft: { answers: {} } };

      // Core: re-open / unsubmit
      entry.submittedAt = null;
      entry.savedAt = now;

      setResponseEntry(p, k, pid, peerId ? String(peerId) : null, entry);

      // Optional audit trail if you keep db.events
      if (!Array.isArray(db.events)) db.events = [];
      db.events.push({
        at: now,
        type: "admin.reopen",
        processSlug: String(p.processSlug || p.slug || processSlug),
        participantId: pid,
        kind: k,
        peerId: k === "c2" ? String(peerId) : null,
      });

      return db;
    });

    return res.json({
      ok: true,
      at: now,
      processSlug,
      participantId,
      kind: k,
      peerId: k === "c2" ? String(peerId) : null,
    });
  },
);

/* =========================
   ADMIN – EVENTS (LOGS)
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

  if (processSlug)
    out = out.filter((e) => e?.processSlug === String(processSlug));
  if (participantId)
    out = out.filter((e) => e?.participantId === String(participantId));
  if (type) out = out.filter((e) => e?.type === String(type));

  out = out
    .slice()
    .sort((a, b) => String(b?.ts || "").localeCompare(String(a?.ts || "")))
    .slice(0, limit);

  res.json(out);
});

/* =========================
   ADMIN - DELETE PROCESS (EN_PREPARACION only)
========================= */
app.delete(
  "/api/admin/processes/:processSlug",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;

    const db = readDb();
    const proc = db.processes.find((p) => p.processSlug === processSlug);

    if (!proc) {
      return res.status(404).json({ error: "Proceso no encontrado." });
    }

    if (proc.status !== "EN_PREPARACION") {
      return res.status(400).json({
        error: "Solo se pueden eliminar procesos en EN_PREPARACION.",
      });
    }

    const logoPath = path.join(LOGO_DIR, `${processSlug}.jpg`);

    updateDb((db2) => {
      db2.processes = (db2.processes || []).filter(
        (p) => p.processSlug !== processSlug,
      );

      db2.events = (db2.events || []).filter(
        (evt) => String(evt?.processSlug || "") !== String(processSlug),
      );

      return db2;
    });

    try {
      await deleteProcessFromPg(processSlug);
    } catch (e) {
      return res.status(500).json({
        error:
          "El proceso fue eliminado en JSON pero falló la sincronización a PostgreSQL.",
      });
    }

    try {
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    } catch (e) {
      return res.status(500).json({
        error:
          "El proceso fue removido de la base de datos, pero no se pudo eliminar el logo del disco.",
      });
    }

    return res.json({ ok: true, processSlug });
  },
);

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
