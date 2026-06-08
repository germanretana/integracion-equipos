import "dotenv/config";
import bcrypt from "bcryptjs";

import {
  getPool,
  getBaseTemplatesFromPg,
  upsertProcessToPg,
  upsertProcessTemplateToPg,
  insertParticipantToPg,
  deleteProcessFromPg,
  listProcessSlugsFromPg,
  upsertC1ResponseDraftToPg,
  submitC1ResponseInPg,
  upsertC2ResponseDraftToPg,
  submitC2ResponseInPg,
} from "../lib/pg.js";

/**
 * Seed a fully-completed SAMPLE process so we can build/iterate on reports
 * without manually clicking through the UI.
 *
 * It writes straight to PostgreSQL via the app's own pg.js helpers, so the
 * data follows the real schema and FKs. It is idempotent: re-running deletes
 * the previous sample process (cascade) and recreates it from scratch.
 *
 * Run from the `server/` dir:  node scripts/seed-sample-process.js
 */

// ---------------------------------------------------------------------------
// Base data (from the task brief)
// ---------------------------------------------------------------------------

const PROCESS_SLUG = "muestra";
const COMPANY_NAME = "Reportes S.A.";
const PROCESS_NAME = "Muestra";
const SHARED_PASSWORD = "muestra123";

const PARTICIPANTS = [
  { firstName: "Ana", lastName: "Aguilar", email: "a@reportes.com" },
  { firstName: "Braulio", lastName: "Bejarano", email: "b@reportes.com" },
  { firstName: "Claudio", lastName: "Calvo", email: "c@reportes.com" },
  { firstName: "Daniel", lastName: "Delgado", email: "d@reportes.com" },
];

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness (stable across re-runs)
// ---------------------------------------------------------------------------

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seed(...parts) {
  return strHash(parts.map(String).join("|"));
}

// Inclusive integer in [min, max] from a seed.
function rint(s, min, max) {
  return min + (s % (max - min + 1));
}

// Pick one element from arr by seed.
function pick(s, arr) {
  return arr[s % arr.length];
}

// ---------------------------------------------------------------------------
// Text pools (Spanish, since participant-facing content is Spanish)
// ---------------------------------------------------------------------------

const TEXT_POOL = [
  "Considero que tenemos buena disposición pero falta seguimiento a los acuerdos.",
  "La comunicación ha mejorado, aunque todavía evitamos las conversaciones difíciles.",
  "Hay compromiso individual, pero nos cuesta alinearnos como un solo equipo.",
  "Las reuniones son productivas cuando hay agenda clara; cuando no, se dispersan.",
  "Confío en mis colegas, pero necesitamos más transparencia en las decisiones.",
  "El ambiente es respetuoso y eso facilita plantear desacuerdos con franqueza.",
];

const SHORT_POOL = [
  "Cumplimiento de acuerdos",
  "Comunicación más directa",
  "Mejor planificación",
  "Reconocimiento mutuo",
  "Claridad de roles",
  "Confianza y apertura",
  "Resolución de conflictos",
  "Colaboración entre áreas",
  "Seguimiento a proyectos",
  "Escucha activa",
];

const SUGGESTION_POOL = [
  "Podríamos definir responsables claros.",
  "Sugiero revisar este punto en la próxima reunión.",
  "Un plan de acción concreto ayudaría.",
  "",
  "",
];

// ---------------------------------------------------------------------------
// Visibility (mirrors server/lib/questionnaires.js isQuestionVisible)
// ---------------------------------------------------------------------------

function isVisible(q, answers) {
  if (!q?.dependsOn || typeof q.dependsOn !== "object") return true;
  const { id, equals } = q.dependsOn;
  if (!id) return true;
  const val = answers?.[id];
  if (val === "yes") return equals === "yes" || equals === "Sí" || equals === true;
  if (val === "no") return equals === "no" || equals === "No" || equals === false;
  return val === equals;
}

// ---------------------------------------------------------------------------
// Answer synthesis: walk a template's questions and build a valid answers map.
//
// `ns` is a namespace string that makes values vary per participant (and per
// peer, for C2) while staying deterministic. `pairOptions` are the participant
// ids selectable in pairing questions (peers, excluding the author).
// ---------------------------------------------------------------------------

function buildAnswers(questions, ns, pairOptions) {
  const answers = {};

  for (const q of questions) {
    const type = String(q?.type || "").toLowerCase();
    const id = String(q?.id || "");
    if (!type || type === "header") continue;
    if (!isVisible(q, answers)) continue;

    const s = seed(ns, id);

    switch (type) {
      case "rating_masc_5":
      case "rating_fem_5":
        // 0..4, kept in the upper-middle range so averages look realistic.
        answers[id] = rint(s, 1, 4);
        break;

      case "evaluation_0_10":
        answers[id] = rint(s, 5, 10);
        break;

      case "binary_yes_no":
        // c1-5a drives two dependent questions; force a known mix:
        // first 3 participants "yes" (dependents appear), last one "no".
        if (id === "c1-5a") {
          answers[id] = ns.endsWith("|3") ? "no" : "yes";
        } else {
          answers[id] = rint(s, 0, 3) === 0 ? "no" : "yes";
        }
        break;

      case "text_area":
        answers[id] = pick(s, TEXT_POOL);
        break;

      case "input_list": {
        const max = Number.isFinite(q.maxEntries) ? q.maxEntries : 1;
        const min = Number.isFinite(q.minEntries) ? q.minEntries : 1;
        const count = Math.max(min, Math.min(max, max)); // fill to max
        const out = [];
        for (let i = 0; i < count; i++) {
          out.push(pick(seed(ns, id, i), SHORT_POOL));
        }
        answers[id] = out;
        break;
      }

      case "value_0_4_grid": {
        const items = Array.isArray(q.items) ? q.items : [];
        for (let i = 0; i < items.length; i++) {
          const itId = String(items[i].id);
          const si = seed(ns, itId);
          answers[itId] = {
            value: rint(si, 1, 4),
            suggestion: pick(si, SUGGESTION_POOL),
          };
        }
        break;
      }

      case "value_0_4":
        answers[id] = { value: rint(s, 1, 4), suggestion: pick(s, SUGGESTION_POOL) };
        break;

      case "pairing_rows": {
        // At least one valid (distinct, non-duplicate) pair from peers.
        const opts = pairOptions || [];
        if (opts.length >= 2) {
          const a = opts[s % opts.length];
          let b = opts[(s + 1 + (s % (opts.length - 1))) % opts.length];
          if (b === a) b = opts[(opts.indexOf(a) + 1) % opts.length];
          const rows = [{ leftId: a, rightId: b }];
          // ~half the time add a second, distinct pair if enough people.
          if (opts.length >= 3 && s % 2 === 0) {
            const c = opts[(opts.indexOf(b) + 1) % opts.length];
            const d = opts[(opts.indexOf(c) + 1) % opts.length];
            if (c !== d) rows.push({ leftId: c, rightId: d });
          }
          answers[id] = rows;
        }
        break;
      }

      default:
        // Unknown type: leave unanswered rather than write a bad shape.
        break;
    }
  }

  return { answers };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = getPool();

  // 1) Idempotency: wipe any prior sample process (cascade removes its
  //    participants, responses and process_templates).
  const slugs = await listProcessSlugsFromPg();
  if (slugs.includes(PROCESS_SLUG)) {
    console.log(`Existing process "${PROCESS_SLUG}" found — deleting (cascade).`);
    await deleteProcessFromPg(PROCESS_SLUG);
  }

  // 2) Create the process, launched and in progress.
  const now = new Date();
  const startAt = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const endAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  await upsertProcessToPg({
    processSlug: PROCESS_SLUG,
    companyName: COMPANY_NAME,
    processName: PROCESS_NAME,
    status: "EN_CURSO",
    createdAt: now.toISOString(),
    launchedAt: now.toISOString(),
    closedAt: null,
    expectedStartAt: startAt.toISOString().slice(0, 10),
    expectedEndAt: endAt.toISOString().slice(0, 10),
    logoUrl: null,
  });
  console.log(`Process created: ${COMPANY_NAME} / ${PROCESS_NAME} (${PROCESS_SLUG}) [EN_CURSO]`);

  // 3) Copy base questionnaire templates into the process.
  const base = await getBaseTemplatesFromPg();
  if (!base.c1 || !base.c2) {
    throw new Error("Base templates (c1/c2) not found in base_templates. Run db:init / seed templates first.");
  }
  await upsertProcessTemplateToPg(PROCESS_SLUG, "c1", base.c1);
  await upsertProcessTemplateToPg(PROCESS_SLUG, "c2", base.c2);
  console.log("Copied base C1 and C2 templates into process_templates.");

  const c1Questions = Array.isArray(base.c1.questions) ? base.c1.questions : [];
  const c2Questions = Array.isArray(base.c2.questions) ? base.c2.questions : [];

  // 4) Insert participants with a known shared password.
  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
  const baseTs = now.getTime();
  const inserted = [];

  for (let i = 0; i < PARTICIPANTS.length; i++) {
    const p = PARTICIPANTS[i];
    const participant = {
      id: `p-${baseTs}-${i}`,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email.toLowerCase(),
      passwordHash,
    };
    await insertParticipantToPg(PROCESS_SLUG, participant);
    inserted.push(participant);
    console.log(`  participant: ${p.firstName} ${p.lastName} <${participant.email}> (${participant.id})`);
  }

  // 5) Generate + submit responses.
  let c1Count = 0;
  let c2Count = 0;

  for (let i = 0; i < inserted.length; i++) {
    const me = inserted[i];
    const ns = `${PROCESS_SLUG}|${i}`; // namespace ends with the participant index

    // Peers = everyone else; used for C2 targets and C1 pairing options.
    const peerIds = inserted.filter((x) => x.id !== me.id).map((x) => x.id);

    // C1 — one per participant.
    const c1Draft = buildAnswers(c1Questions, `c1|${ns}`, peerIds);
    await upsertC1ResponseDraftToPg(PROCESS_SLUG, me.id, c1Draft);
    await submitC1ResponseInPg(PROCESS_SLUG, me.id); // keeps draft, stamps submitted_at
    c1Count++;

    // C2 — one per peer.
    for (const peerId of peerIds) {
      const c2Draft = buildAnswers(c2Questions, `c2|${ns}|${peerId}`, peerIds);
      await upsertC2ResponseDraftToPg(PROCESS_SLUG, me.id, peerId, c2Draft);
      await submitC2ResponseInPg(PROCESS_SLUG, me.id, peerId);
      c2Count++;
    }
  }

  console.log("");
  console.log("Seed complete:");
  console.log(`  participants : ${inserted.length}`);
  console.log(`  C1 submitted : ${c1Count}`);
  console.log(`  C2 submitted : ${c2Count}`);
  console.log(`  login        : any participant email, password "${SHARED_PASSWORD}"`);
  console.log(`  admin view   : /admin/processes/${PROCESS_SLUG}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error("Seed failed:");
  console.error(err);
  try {
    await getPool().end();
  } catch {}
  process.exitCode = 1;
});
