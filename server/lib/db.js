import fs from "fs";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "data", "db.json");

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
        questions: []
      },
      c2: {
        instructionsMd:
          "# Retroalimentación a compañeros (C2)\n\n" +
          "Su opinión sobre el desempeño y relaciones de cada uno de sus colegas es de gran valor.\n\n" +
          "- Emita su criterio con profundidad y sinceridad.\n" +
          "- No remita estos documentos a sus compañeros.\n" +
          "- Sus colegas no conocerán la fuente, pues se procesa en forma anónima.",
        questions: []
      }
    },
    processes: [],
    logs: []
  };
}

function migrateDb(db) {
  let changed = false;

  if (!db || typeof db !== "object") return { db: defaultDb(), changed: true };

  if (!Array.isArray(db.admins)) {
    db.admins = [];
    changed = true;
  }

  if (!db.baseTemplates) {
    db.baseTemplates = defaultDb().baseTemplates;
    changed = true;
  }

  for (const kind of ["c1", "c2"]) {
    const t = db.baseTemplates?.[kind];
    if (!t) continue;

    if (typeof t.instructionsMd !== "string") {
      if (t.instructions && typeof t.instructions === "object") {
        t.instructionsMd = instructionsObjToMd(t.instructions);
        delete t.instructions;
        changed = true;
      } else {
        t.instructionsMd = defaultDb().baseTemplates[kind].instructionsMd;
        changed = true;
      }
    }

    if (!Array.isArray(t.questions)) {
      t.questions = [];
      changed = true;
    }
  }

  if (!Array.isArray(db.processes)) {
    db.processes = [];
    changed = true;
  }

  for (const p of db.processes) {
    if (!p || typeof p !== "object") continue;

    if (!p.templates || typeof p.templates !== "object") {
      p.templates = structuredClone(db.baseTemplates);
      changed = true;
    }

    for (const kind of ["c1", "c2"]) {
      const t = p.templates?.[kind];
      if (!t || typeof t !== "object") continue;

      if (typeof t.instructionsMd !== "string") {
        if (t.instructions && typeof t.instructions === "object") {
          t.instructionsMd = instructionsObjToMd(t.instructions);
          delete t.instructions;
          changed = true;
        } else if (db.baseTemplates?.[kind]?.instructionsMd) {
          t.instructionsMd = db.baseTemplates[kind].instructionsMd;
          changed = true;
        } else {
          t.instructionsMd = "";
          changed = true;
        }
      }

      if (!Array.isArray(t.questions)) {
        t.questions = [];
        changed = true;
      }
    }

    if (!Array.isArray(p.participants)) {
      p.participants = [];
      changed = true;
    }

    // NEW: responses per process
    if (!p.responses || typeof p.responses !== "object") {
      p.responses = {
        c1: {}, // participantId -> { draft: { freeText }, savedAt, submittedAt }
        c2: {}  // participantId -> { [peerId]: { draft: { freeText }, savedAt, submittedAt } }
      };
      changed = true;
    } else {
      if (!p.responses.c1 || typeof p.responses.c1 !== "object") {
        p.responses.c1 = {};
        changed = true;
      }
      if (!p.responses.c2 || typeof p.responses.c2 !== "object") {
        p.responses.c2 = {};
        changed = true;
      }
    }
  }

  if (!Array.isArray(db.logs)) {
    db.logs = [];
    changed = true;
  }

  return { db, changed };
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
    const { db, changed } = migrateDb(parsed);
    if (changed) fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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
  fs.writeFileSync(DB_PATH, JSON.stringify(next, null, 2));
}

export function updateDb(mutator) {
  const db = readDb();
  const next = mutator(structuredClone(db)) ?? db;
  writeDb(next);
  return next;
}
