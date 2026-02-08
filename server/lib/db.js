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
          "- Sea tan amplio como lo considere necesario para que el desempeño del equipo pueda mejorarse con base en su contribución.\n\n" +
          "Muchas gracias por su valiosa cooperación.",
        questions: []
      },
      c2: {
        instructionsMd:
          "# Retroalimentación a compañeros (C2)\n\n" +
          "Su opinión sobre el desempeño y relaciones de cada uno de sus colegas es de gran valor para ayudarles a mejorar su papel como líderes en la organización.\n\n" +
          "- Emita su criterio con la mayor profundidad y sinceridad.\n" +
          "- No remita estos documentos a sus compañeros.\n" +
          "- Completará un cuestionario sobre cada uno de sus colegas.\n" +
          "- Sus colegas no conocerán la fuente de las evaluaciones o comentarios, pues esta información se procesa en forma anónima.",
        questions: []
      }
    },
    processes: [],
    logs: []
  };
}

function migrateDb(db) {
  let changed = false;

  // Ensure top-level keys
  if (!db || typeof db !== "object") {
    db = defaultDb();
    return { db, changed: true };
  }

  if (!Array.isArray(db.admins)) {
    db.admins = [];
    changed = true;
  }

  if (!db.baseTemplates) {
    db.baseTemplates = defaultDb().baseTemplates;
    changed = true;
  }

  // Migrate baseTemplates instructions -> instructionsMd
  for (const kind of ["c1", "c2"]) {
    const t = db.baseTemplates?.[kind];
    if (!t) continue;

    if (typeof t.instructionsMd !== "string") {
      // old format: instructions object
      if (t.instructions && typeof t.instructions === "object") {
        t.instructionsMd = instructionsObjToMd(t.instructions);
        delete t.instructions;
        changed = true;
      } else {
        // set default if missing
        t.instructionsMd = defaultDb().baseTemplates[kind].instructionsMd;
        changed = true;
      }
    }

    if (!Array.isArray(t.questions)) {
      t.questions = [];
      changed = true;
    }
  }

  // Ensure processes structure
  if (!Array.isArray(db.processes)) {
    db.processes = [];
    changed = true;
  }

  // Migrate process templates as well
  for (const p of db.processes) {
    if (!p || typeof p !== "object") continue;
    if (!p.templates || typeof p.templates !== "object") continue;

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
  }

  // Ensure logs exists
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

  // Auto-migrate existing DB if needed
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const { db, changed } = migrateDb(parsed);
    if (changed) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
  } catch {
    // If corrupted, reset to default (dev only)
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
