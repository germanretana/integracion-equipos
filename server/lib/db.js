import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * DB canonical: server/data/db.json
 * IMPORTANT: path must be independent from process.cwd() because the server
 * may be started from repo root or from ./server.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, "..", "data", "db.json");

function instructionsObjToMd(ins) {
  if (!ins || typeof ins !== "object") return "";

  const title = ins.title ? `# ${String(ins.title).trim()}\n\n` : "";
  const paragraphs = Array.isArray(ins.paragraphs) ? ins.paragraphs : [];
  const bullets = Array.isArray(ins.bullets) ? ins.bullets : [];
  const closing = ins.closing ? `\n\n${String(ins.closing).trim()}` : "";

  const p = paragraphs
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join("\n\n");

  const b = bullets
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((x) => `- ${x}`)
    .join("\n");

  const mid = [p, b].filter(Boolean).join("\n\n");

  return `${title}${mid}${closing}`.trim();
}

function defaultDb() {
  return {
    admins: [],
    baseTemplates: {
      c1: {
        instructionsMd:
          "# Retroalimentación del equipo (C1)\n\n" +
          "El propósito de esta encuesta es facilitar la evaluación del desempeño del equipo gerencial de la organización e identificar áreas de oportunidad para mejorar.\n\n" +
          "- Conteste con sinceridad, en beneficio propio y de todo el equipo.\n" +
          "- No remita esta encuesta a sus colegas.\n" +
          "- Sea tan amplio como lo considere necesario.\n\n" +
          "Muchas gracias por su valiosa cooperación.",
        questions: [],
      },
      c2: {
        instructionsMd:
          "# Retroalimentación a compañeros (C2)\n\n" +
          "Su opinión sobre el desempeño y relaciones de cada uno de sus colegas es de gran valor.\n\n" +
          "- Emita su criterio con profundidad y sinceridad.\n" +
          "- No remita estos documentos a sus compañeros.\n" +
          "- Sus colegas no conocerán la fuente, pues se procesa en forma anónima.",
        questions: [],
      },
    },
    processes: [],
    events: [],
  };
}

function normalizeTemplate(tpl, fallback) {
  const out = tpl && typeof tpl === "object" ? tpl : structuredClone(fallback);

  if (typeof out.instructionsMd !== "string") {
    if (out.instructions && typeof out.instructions === "object") {
      out.instructionsMd = instructionsObjToMd(out.instructions);
      delete out.instructions;
    } else {
      out.instructionsMd = fallback.instructionsMd;
    }
  }

  if (!Array.isArray(out.questions)) {
    out.questions = [];
  }

  return out;
}

function migrateDb(db) {
  if (!db || typeof db !== "object") return defaultDb();

  const defs = defaultDb();

  if (!Array.isArray(db.admins)) {
    db.admins = [];
  }

  if (!db.baseTemplates || typeof db.baseTemplates !== "object") {
    db.baseTemplates = structuredClone(defs.baseTemplates);
  }

  db.baseTemplates.c1 = normalizeTemplate(
    db.baseTemplates.c1,
    defs.baseTemplates.c1,
  );
  db.baseTemplates.c2 = normalizeTemplate(
    db.baseTemplates.c2,
    defs.baseTemplates.c2,
  );

  if (!Array.isArray(db.processes)) {
    db.processes = [];
  }

  for (const p of db.processes) {
    if (!p || typeof p !== "object") continue;

    if (!p.templates || typeof p.templates !== "object") {
      p.templates = structuredClone(db.baseTemplates);
    }

    p.templates.c1 = normalizeTemplate(p.templates.c1, db.baseTemplates.c1);
    p.templates.c2 = normalizeTemplate(p.templates.c2, db.baseTemplates.c2);

    if (!Array.isArray(p.participants)) {
      p.participants = [];
    }

    if (!p.responses || typeof p.responses !== "object") {
      p.responses = { c1: {}, c2: {} };
    } else {
      if (!p.responses.c1 || typeof p.responses.c1 !== "object") {
        p.responses.c1 = {};
      }
      if (!p.responses.c2 || typeof p.responses.c2 !== "object") {
        p.responses.c2 = {};
      }
    }

    if (!("expectedStartAt" in p)) {
      p.expectedStartAt = null;
    }
    if (!("expectedEndAt" in p)) {
      p.expectedEndAt = null;
    }
    if (!("logoUrl" in p)) {
      p.logoUrl = null;
    }
    if (!("launchedAt" in p)) {
      p.launchedAt = null;
    }
    if (!("closedAt" in p)) {
      p.closedAt = null;
    }

    delete p.expectedStartDate;
    delete p.expectedEndDate;
  }

  if (!Array.isArray(db.events)) {
    db.events = [];
  }

  delete db.logs;

  return db;
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
    return;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const normalized = migrateDb(parsed);
    fs.writeFileSync(DB_PATH, JSON.stringify(normalized, null, 2));
  } catch {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

export function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

export function writeDb(next) {
  ensureDb();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

export function updateDb(mutator) {
  const db = readDb();
  const next = mutator(structuredClone(db)) ?? db;
  writeDb(next);
  return next;
}
