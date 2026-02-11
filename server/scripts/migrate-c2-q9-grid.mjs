import { readDb, writeDb } from "../lib/db.js";

function parseArgs(argv) {
  const out = {
    processKey: null,
    processLike: null,
    processIndex: null,
    base: false,
    write: false,
    dryRun: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--process" || a === "-p") out.processKey = argv[++i] || null;
    else if (a === "--process-like") out.processLike = argv[++i] || null;
    else if (a === "--process-index") {
      const n = Number(argv[++i]);
      out.processIndex = Number.isFinite(n) ? n : null;
    } else if (a === "--base") out.base = true;
    else if (a === "--write") {
      out.write = true;
      out.dryRun = false;
    } else if (a === "--dry-run") {
      out.dryRun = true;
      out.write = false;
    }
  }

  return out;
}

function normId(x) {
  return String(x || "").trim();
}

function normType(x) {
  return String(x || "").toLowerCase().trim();
}

function qText(q) {
  return q?.text ?? q?.item ?? q?.Item ?? q?.title ?? q?.label ?? "";
}

function isC2Q9HeaderId(id) {
  const x = normId(id);
  return /^c2-9$/i.test(x) || /^c2\.q9$/i.test(x);
}

function isC2Q9ItemId(id) {
  const x = normId(id);
  return /^c2-9[_-]\d{2}$/i.test(x) || /^c2\.q9\.\d{2}$/i.test(x);
}

function migrateQuestions(questions) {
  const qs = Array.isArray(questions) ? questions.slice() : [];
  let changed = false;

  const out = [];
  let i = 0;

  while (i < qs.length) {
    const q = qs[i];
    const id = normId(q?.id || q?.key || `${i}`);
    const type = normType(q?.type);

    if (isC2Q9HeaderId(id) && type === "header") {
      const items = [];
      i += 1;

      while (i < qs.length) {
        const q2 = qs[i];
        const id2 = normId(q2?.id || q2?.key || `${i}`);
        if (!isC2Q9ItemId(id2)) break;

        items.push({ id: id2, text: qText(q2) });
        i += 1;
      }

      if (items.length > 0) {
        out.push({
          id,
          type: "value_0_4_grid",
          text: qText(q),
          items,
          meta: { columns: ["label", "value"] },
        });
        changed = true;
        continue;
      }

      out.push({ ...q, id });
      continue;
    }

    out.push({ ...q, id });
    i += 1;
  }

  return { questions: out, changed };
}

function migrateBaseTemplates(db) {
  const tpl = db?.baseTemplates?.c2;
  if (!tpl) return false;

  const before = Array.isArray(tpl.questions) ? tpl.questions : [];
  const { questions, changed } = migrateQuestions(before);
  if (changed) tpl.questions = questions;
  return changed;
}

function getProcessIdent(p) {
  // Return a stable label for logs
  const candidates = [
    p?.slug,
    p?.processSlug,
    p?.code,
    p?.id,
    p?.name,
  ].map((x) => (x == null ? "" : String(x))).filter(Boolean);

  return candidates[0] || "(unlabeled-process)";
}

function findProcess(db, args) {
  const ps = db.processes || [];
  if (!Array.isArray(ps) || ps.length === 0) return null;

  if (args.processIndex != null) {
    return ps[args.processIndex] || null;
  }

  const key = args.processKey ? String(args.processKey) : null;
  if (key) {
    const hit = ps.find((p) => {
      const vals = [p?.slug, p?.processSlug, p?.code, p?.id]
        .map((x) => (x == null ? "" : String(x)));
      return vals.includes(key);
    });
    if (hit) return hit;
  }

  const like = args.processLike ? String(args.processLike).toLowerCase() : null;
  if (like) {
    const hit = ps.find((p) => {
      const vals = [p?.slug, p?.processSlug, p?.code, p?.id, p?.name]
        .map((x) => (x == null ? "" : String(x)).toLowerCase());
      return vals.some((v) => v.includes(like));
    });
    if (hit) return hit;
  }

  return null;
}

function migrateProcessTemplates(db, args) {
  const p = findProcess(db, args);
  if (!p) {
    const ps = db.processes || [];
    throw new Error(
      `Process not found. Try --process-index 0..${Math.max(0, ps.length - 1)} or --process-like <text>.`
    );
  }

  const tpl = p?.templates?.c2;
  if (!tpl) throw new Error(`Process ${getProcessIdent(p)} has no templates.c2`);

  const before = Array.isArray(tpl.questions) ? tpl.questions : [];
  const { questions, changed } = migrateQuestions(before);
  if (changed) tpl.questions = questions;

  return { changed, label: getProcessIdent(p) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = readDb();

  let anyChanged = false;

  if (args.processKey || args.processLike || args.processIndex != null) {
    const { changed, label } = migrateProcessTemplates(db, args);
    if (changed) {
      console.log(`✅ Migrated process.templates.c2.questions for ${label}`);
      anyChanged = true;
    } else {
      console.log(`ℹ️ No legacy C2.q9 header/items pattern found in process.templates.c2.questions`);
    }
  }

  if (args.base) {
    const ch = migrateBaseTemplates(db);
    if (ch) {
      console.log(`✅ Migrated db.baseTemplates.c2.questions`);
      anyChanged = true;
    } else {
      console.log(`ℹ️ No legacy C2.q9 header/items pattern found in db.baseTemplates.c2.questions`);
    }
  }

  if (!args.base && !(args.processKey || args.processLike || args.processIndex != null)) {
    console.log("ℹ️ Nothing to do. Use --process / --process-like / --process-index and/or --base");
    return;
  }

  if (!anyChanged) {
    console.log("ℹ️ No changes written.");
    return;
  }

  if (args.dryRun) {
    console.log("ℹ️ Dry run: changes computed but NOT written. Re-run with --write to persist.");
    return;
  }

  writeDb(db);
  console.log("✅ Changes written to server/data/db.json");
}

main();
