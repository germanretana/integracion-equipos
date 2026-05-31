import "dotenv/config";

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";

import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  testConnection,
  listProcessesFromPg,
  getProcessFromPg,
  listProcessSummariesFromPg,
  listProcessSlugsFromPg,
  listParticipantsFromPg,
  findParticipantsByEmailFromPg,
  findParticipantByEmailInProcessFromPg,
  getParticipantFromPg,
  getC1ResponseFromPg,
  listC1ResponsesByProcessFromPg,
  upsertC1ResponseDraftToPg,
  submitC1ResponseInPg,
  reopenC1ResponseInPg,
  listC2ResponsesByParticipantFromPg,
  listC2ResponsesByProcessFromPg,
  getC2ResponseFromPg,
  upsertC2ResponseDraftToPg,
  submitC2ResponseInPg,
  reopenC2ResponseInPg,
  insertParticipantToPg,
  updateParticipantInPg,
  deleteParticipantFromPg,
  resetParticipantAccessInPg,
  upsertProcessToPg,
  getProcessTemplatesFromPg,
  upsertProcessTemplateToPg,
  getBaseTemplateFromPg,
  getBaseTemplatesFromPg,
  upsertBaseTemplateToPg,
  deleteProcessFromPg,
  renameProcessSlugInPg,
  findAdminByEmailFromPg,
  countAdminsFromPg,
  insertAdminToPg,
  insertEventToPg,
  listEventsFromPg,
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

async function generateUniqueProcessSlug(desiredSlug, companyName, processName) {
  const base =
    slugify(desiredSlug) ||
    slugify(`${companyName}-${processName}`) ||
    `process-${Date.now()}`;

  const existing = new Set(await listProcessSlugsFromPg());

  let slug = base;
  let counter = 2;

  while (existing.has(slug)) {
    slug = `${base}-${counter++}`;
  }

  return slug;
}

function canParticipantEdit(proc) {
  return proc?.status === "EN_CURSO";
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

async function getProcAndMeScoped(req) {
  const { processSlug } = req.params;
  if (req.participant.processSlug !== processSlug)
    return { error: "Acceso denegado.", status: 403 };

  let proc = null;
  let me = null;
  try {
    proc = await getProcessFromPg(processSlug);
    if (!proc) return { error: "Proceso no encontrado.", status: 404 };

    me = await getParticipantFromPg(processSlug, req.participant.participantId);
  } catch (err) {
    return { error: "No se pudo validar el participante.", status: 500 };
  }

  if (!me) return { error: "Acceso denegado.", status: 403 };

  return { proc, me };
}

/* =========================
   DRAFT + SUBMIT HELPERS
========================= */
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

  try {
    const existing = await countAdminsFromPg();
    if (existing > 0)
      return res.status(409).json({ error: "Bootstrap ya realizado." });

    const passwordHash = await bcrypt.hash(String(password), 10);

    await insertAdminToPg({
      email: String(email).toLowerCase(),
      name: String(name || ""),
      passwordHash,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: "No se pudo completar el bootstrap." });
  }

  res.json({ ok: true });
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};

  let admin = null;
  try {
    admin = await findAdminByEmailFromPg(String(email || ""));
  } catch (err) {
    return res.status(500).json({ error: "No se pudo iniciar sesión." });
  }

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

  try {
    const existing = await getBaseTemplateFromPg(kind);
    const merged = { ...(existing || {}), ...incoming };
    await upsertBaseTemplateToPg(kind, merged);
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: "No se pudo guardar la plantilla base." });
  }
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

  try {
    const baseTemplates = await getBaseTemplatesFromPg();

    if (!baseTemplates?.c1 || !baseTemplates?.c2) {
      return res.status(500).json({
        error: "No se encontraron las plantillas base en PostgreSQL.",
      });
    }

    const processSlug = await generateUniqueProcessSlug(
      requestedSlug,
      companyNameClean,
      processNameClean,
    );

    const now = new Date().toISOString();

    const newProcess = {
      processSlug,
      companyName: companyNameClean,
      processName: processNameClean,
      status: "EN_PREPARACION",
      createdAt: now,
      launchedAt: null,
      closedAt: null,
      expectedStartAt: expectedStartAt || null,
      expectedEndAt: expectedEndAt || null,
      logoUrl: null,
    };

    await upsertProcessToPg(newProcess);
    await upsertProcessTemplateToPg(processSlug, "c1", baseTemplates.c1);
    await upsertProcessTemplateToPg(processSlug, "c2", baseTemplates.c2);

    res.json(newProcess);
  } catch (err) {
    res.status(500).json({ error: "No se pudo crear el proceso." });
  }
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

  try {
    const existing = await getProcessFromPg(processSlug);

    if (!existing)
      return res.status(404).json({ error: "Proceso no encontrado." });

    if (existing.status !== "EN_PREPARACION")
      return res.status(400).json({
        error: "Solo se puede editar un proceso en EN_PREPARACION.",
      });

    let finalSlug = processSlug;

    if (newSlug && newSlug !== processSlug) {
      const normalized = slugify(newSlug);
      if (!normalized) return res.status(400).json({ error: "Slug inválido." });

      const slugs = await listProcessSlugsFromPg();
      if (slugs.includes(normalized))
        return res.status(409).json({ error: "El slug ya existe." });

      finalSlug = normalized;
    }

    let resolvedLogoUrl =
      logoUrl !== undefined ? logoUrl || null : existing.logoUrl;

    if (finalSlug !== processSlug) {
      const oldLogoPath = path.join(LOGO_DIR, `${processSlug}.jpg`);
      const newLogoPath = path.join(LOGO_DIR, `${finalSlug}.jpg`);
      if (fs.existsSync(oldLogoPath)) {
        fs.renameSync(oldLogoPath, newLogoPath);
      }
      resolvedLogoUrl = `/uploads/logos/${finalSlug}.jpg`;

      await renameProcessSlugInPg(processSlug, finalSlug);
    }

    const updated = {
      ...existing,
      processSlug: finalSlug,
      companyName: companyName ?? existing.companyName,
      processName: processName ?? existing.processName,
      expectedStartAt: expectedStartAt ?? existing.expectedStartAt ?? null,
      expectedEndAt: expectedEndAt ?? existing.expectedEndAt ?? null,
      logoUrl: resolvedLogoUrl,
    };

    await upsertProcessToPg(updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el proceso." });
  }
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

    try {
      const existing = await getProcessFromPg(req.params.processSlug);
      if (!existing)
        return res.status(404).json({ error: "Proceso no encontrado." });

      const updated = {
        ...existing,
        status,
        launchedAt:
          status === "EN_CURSO" ? now : existing.launchedAt || null,
        closedAt: status === "CERRADO" ? now : existing.closedAt || null,
      };

      await upsertProcessToPg(updated);

      res.json(updated);
    } catch (err) {
      res
        .status(500)
        .json({ error: "No se pudo actualizar el estado del proceso." });
    }
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

    try {
      const existing = await getProcessFromPg(processSlug);

      if (!existing)
        return res.status(404).json({ error: "Proceso no encontrado." });

      if (existing.status !== "EN_PREPARACION") {
        return res.json(existing);
      }

      let finalSlug = processSlug;

      if (newSlug && newSlug !== processSlug) {
        const normalized = slugify(newSlug);
        if (!normalized)
          return res.status(400).json({ error: "Slug inválido." });

        if (normalized !== processSlug) {
          const slugs = await listProcessSlugsFromPg();
          if (slugs.includes(normalized))
            return res.status(409).json({ error: "El slug ya existe." });

          finalSlug = normalized;
          await renameProcessSlugInPg(processSlug, finalSlug);
        }
      }

      const updated = {
        ...existing,
        processSlug: finalSlug,
        companyName:
          companyName != null
            ? String(companyName).trim()
            : existing.companyName,
        processName:
          processName != null
            ? String(processName).trim()
            : existing.processName,
        expectedStartAt:
          expectedStartAt !== undefined
            ? expectedStartAt || null
            : existing.expectedStartAt,
        expectedEndAt:
          expectedEndAt !== undefined
            ? expectedEndAt || null
            : existing.expectedEndAt,
        logoUrl:
          logoUrl !== undefined ? logoUrl || null : existing.logoUrl,
      };

      await upsertProcessToPg(updated);

      res.json(updated);
    } catch (err) {
      res
        .status(500)
        .json({ error: "No se pudo actualizar el proceso." });
    }
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

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      const templates = await getProcessTemplatesFromPg(processSlug);
      const merged = { ...(templates?.[kind] || {}), ...incoming };

      await upsertProcessTemplateToPg(processSlug, kind, merged);
      res.json(merged);
    } catch (err) {
      res.status(500).json({ error: "No se pudo guardar la plantilla." });
    }
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

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      if (proc.status !== "EN_PREPARACION")
        return res.status(400).json({
          error: "Solo se puede modificar el logo en EN_PREPARACION.",
        });

      if (!req.file)
        return res.status(400).json({ error: "No file uploaded." });

      const outputPath = path.join(LOGO_DIR, `${processSlug}.jpg`);

      await sharp(req.file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80 })
        .toFile(outputPath);

      const logoUrl = `/uploads/logos/${processSlug}.jpg`;

      await upsertProcessToPg({ ...proc, logoUrl });

      res.json({ logoUrl });
    } catch (err) {
      res.status(500).json({ error: "No se pudo guardar el logo." });
    }
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

  let row;
  if (matches.length === 1) {
    row = matches[0];
  } else {
    const active = matches.filter((m) => m.processStatus === "EN_CURSO");
    if (active.length === 1) {
      row = active[0];
    } else {
      return res.status(409).json({
        error:
          "Este correo pertenece a más de un proceso. Por favor escriba a integracion@germanretana.com.",
      });
    }
  }

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
    const scoped = await getProcAndMeScoped(req);
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

    const scoped = await getProcAndMeScoped(req);
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
  const scoped = await getProcAndMeScoped(req);
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

  const scoped0 = await getProcAndMeScoped(req);
  if (scoped0.error)
    return res.status(scoped0.status).json({ error: scoped0.error });

  const { proc, me } = scoped0;
  if (!canParticipantEdit(proc)) {
    return res
      .status(403)
      .json({
        error:
          "Este proceso no está abierto y no se pueden ingresar respuestas. Sólo puede visualizar el cuestionario.",
      });
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

    const scoped0 = await getProcAndMeScoped(req);
    if (scoped0.error)
      return res.status(scoped0.status).json({ error: scoped0.error });

    const { proc: p0, me: me0 } = scoped0;

    if (!canParticipantEdit(p0)) {
      return res.status(403).json({
        error:
          "Este proceso no está abierto y no se pueden ingresar respuestas. Sólo puede visualizar el cuestionario.",
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
    const scoped = await getProcAndMeScoped(req);
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

    const scoped0 = await getProcAndMeScoped(req);
    if (scoped0.error)
      return res.status(scoped0.status).json({ error: scoped0.error });

    const { proc, me } = scoped0;

    if (!canParticipantEdit(proc)) {
      return res
        .status(403)
        .json({
        error:
          "Este proceso no está abierto y no se pueden ingresar respuestas. Sólo puede visualizar el cuestionario.",
      });
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

    const scoped0 = await getProcAndMeScoped(req);
    if (scoped0.error)
      return res.status(scoped0.status).json({ error: scoped0.error });

    const { proc: p0, me: me0 } = scoped0;

    if (!canParticipantEdit(p0)) {
      return res.status(403).json({
        error:
          "Este proceso no está abierto y no se pueden ingresar respuestas. Sólo puede visualizar el cuestionario.",
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

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      if (proc.status !== "EN_PREPARACION")
        return res.status(400).json({
          error: "Solo se pueden agregar participantes en EN_PREPARACION.",
        });

      const duplicate = await findParticipantByEmailInProcessFromPg(
        processSlug,
        emailNorm,
      );
      if (duplicate)
        return res
          .status(409)
          .json({ error: "El correo ya existe en el proceso." });

      const tempPassword = genTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const newParticipant = {
        id: `p-${Date.now()}`,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: emailNorm,
        passwordHash,
      };

      await insertParticipantToPg(processSlug, newParticipant);

      res.json({ ...newParticipant, tempPassword });
    } catch (err) {
      res.status(500).json({ error: "No se pudo crear el participante." });
    }
  },
);

app.put(
  "/api/admin/processes/:processSlug/participants/:participantId",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;
    const { firstName, lastName, email } = req.body || {};

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      if (proc.status !== "EN_PREPARACION")
        return res.status(400).json({
          error: "Solo se pueden editar participantes en EN_PREPARACION.",
        });

      const participant = await getParticipantFromPg(processSlug, participantId);
      if (!participant)
        return res.status(404).json({ error: "Participante no encontrado." });

      let resolvedEmail = participant.email;
      if (email !== undefined) {
        const emailNorm = String(email).trim().toLowerCase();
        const duplicate = await findParticipantByEmailInProcessFromPg(
          processSlug,
          emailNorm,
        );
        if (duplicate && duplicate.id !== participantId) {
          return res
            .status(409)
            .json({ error: "El correo ya existe en el proceso." });
        }
        resolvedEmail = emailNorm;
      }

      const updatedParticipant = {
        id: participant.id,
        firstName:
          firstName !== undefined
            ? String(firstName).trim()
            : participant.firstName,
        lastName:
          lastName !== undefined
            ? String(lastName).trim()
            : participant.lastName,
        email: resolvedEmail,
        passwordHash: participant.passwordHash,
      };

      await updateParticipantInPg(processSlug, updatedParticipant);

      res.json(updatedParticipant);
    } catch (err) {
      res
        .status(500)
        .json({ error: "No se pudo actualizar el participante." });
    }
  },
);

app.delete(
  "/api/admin/processes/:processSlug/participants/:participantId",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      if (proc.status !== "EN_PREPARACION")
        return res.status(400).json({
          error: "Solo se pueden eliminar participantes en EN_PREPARACION.",
        });

      const participant = await getParticipantFromPg(processSlug, participantId);
      if (!participant)
        return res.status(404).json({ error: "Participante no encontrado." });

      await deleteParticipantFromPg(processSlug, participantId);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "No se pudo eliminar el participante." });
    }
  },
);

/* =========================
   ADMIN – PARTICIPANT ACTIONS
========================= */
function genTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function newEventId() {
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

app.post(
  "/api/admin/processes/:processSlug/participants/:participantId/remind",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;

    try {
      const participant = await getParticipantFromPg(processSlug, participantId);
      if (!participant)
        return res.status(404).json({ error: "Participante no encontrado." });

      const now = new Date().toISOString();

      await insertEventToPg({
        id: newEventId(),
        ts: now,
        type: "ADMIN_REMINDER_REQUESTED",
        processSlug,
        participantId,
        participantEmail: String(participant.email || ""),
        participantName: participantDisplayName(participant),
        adminEmail: req.admin?.email || null,
      });

      res.json({ ok: true, ts: now });
    } catch (err) {
      res
        .status(500)
        .json({ error: "No se pudo registrar el recordatorio." });
    }
  },
);

app.post(
  "/api/admin/processes/:processSlug/participants/:participantId/reset-access",
  requireAdmin,
  async (req, res) => {
    const { processSlug, participantId } = req.params;

    try {
      const participant = await getParticipantFromPg(processSlug, participantId);
      if (!participant)
        return res.status(404).json({ error: "Participante no encontrado." });

      const tempPassword = genTempPassword();
      const passwordHash = await bcrypt.hash(String(tempPassword), 10);
      const now = new Date().toISOString();

      await resetParticipantAccessInPg(processSlug, participantId, passwordHash);

      await insertEventToPg({
        id: newEventId(),
        ts: now,
        type: "ADMIN_ACCESS_RESET",
        processSlug,
        participantId,
        participantEmail: String(participant.email || ""),
        participantName: participantDisplayName(participant),
        adminEmail: req.admin?.email || null,
      });

      res.json({ ok: true, ts: now, tempPassword });
    } catch (err) {
      res.status(500).json({ error: "No se pudo resetear el acceso." });
    }
  },
);

app.post(
  "/api/admin/processes/:processSlug/participants/:participantId/reopen",
  requireAdmin,
  async (req, res) => {
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

    try {
      const participant = await getParticipantFromPg(processSlug, participantId);
      if (!participant)
        return res.status(404).json({ error: "Participante no encontrado." });

      if (k === "c1") {
        await reopenC1ResponseInPg(processSlug, participantId);
      } else {
        await reopenC2ResponseInPg(processSlug, participantId, String(peerId));
      }

      const now = new Date().toISOString();

      await insertEventToPg({
        id: newEventId(),
        ts: now,
        type: "ADMIN_REOPEN",
        processSlug,
        participantId,
        participantEmail: String(participant.email || ""),
        participantName: participantDisplayName(participant),
        adminEmail: req.admin?.email || null,
        payload: { kind: k, peerId: k === "c2" ? String(peerId) : null },
      });

      res.json({
        ok: true,
        at: now,
        processSlug,
        participantId,
        kind: k,
        peerId: k === "c2" ? String(peerId) : null,
      });
    } catch (err) {
      res.status(500).json({ error: "No se pudo reabrir el cuestionario." });
    }
  },
);

/* =========================
   ADMIN – EVENTS (LOGS)
========================= */
app.get("/api/admin/events", requireAdmin, async (req, res) => {
  const { processSlug, participantId, type } = req.query || {};
  const limitRaw = Number(req.query?.limit);

  try {
    const out = await listEventsFromPg({
      processSlug: processSlug ? String(processSlug) : undefined,
      participantId: participantId ? String(participantId) : undefined,
      type: type ? String(type) : undefined,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: "No se pudieron cargar los eventos." });
  }
});

/* =========================
   ADMIN - DELETE PROCESS (EN_PREPARACION only)
========================= */
app.delete(
  "/api/admin/processes/:processSlug",
  requireAdmin,
  async (req, res) => {
    const { processSlug } = req.params;

    try {
      const proc = await getProcessFromPg(processSlug);
      if (!proc)
        return res.status(404).json({ error: "Proceso no encontrado." });

      if (proc.status !== "EN_PREPARACION") {
        return res.status(400).json({
          error: "Solo se pueden eliminar procesos en EN_PREPARACION.",
        });
      }

      await deleteProcessFromPg(processSlug);

      const logoPath = path.join(LOGO_DIR, `${processSlug}.jpg`);
      try {
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
      } catch (e) {
        return res.status(500).json({
          error:
            "El proceso fue eliminado, pero no se pudo eliminar el logo del disco.",
        });
      }

      res.json({ ok: true, processSlug });
    } catch (err) {
      res.status(500).json({ error: "No se pudo eliminar el proceso." });
    }
  },
);

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
