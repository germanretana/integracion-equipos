/**
 * Report aggregation — PURE functions, no React, no DB.
 *
 * Turns a questionnaire template + a set of submitted response answer-maps into
 * an ordered list of "report blocks" that a renderer (online preview today,
 * Word export later) can draw without re-deriving anything.
 *
 * Question types are the canonical names used by the templates and the template
 * editor: header, input_list, text_area, binary_yes_no, rating_masc_5,
 * rating_fem_5, value_0_4_grid, evaluation_0_10, pairing_rows.
 *
 * Aggregation rules:
 *  - rating_*_5      -> vertical bar chart of category frequencies
 *  - input_list      -> consolidated, alphabetically-sorted bullets
 *  - binary_yes_no   -> horizontal bar chart Sí/No
 *  - text_area       -> consolidated bullets, one per respondent
 *  - value_0_4_grid  -> per-item averages, optional suggestion bullets
 *  - pairing_rows    -> excluded from C1; surfaced in each C2 report
 *  - evaluation_0_10 -> single big average
 *  - a text_area grouped with a categorical question -> bullets subgrouped by
 *    that category's value
 */

import { RATING_LABELS, YES_LABEL, NO_LABEL } from "./scale.js";

// ---------------------------------------------------------------------------
// Report colors (solid colors, chosen to read well on a white background so the
// same charts export cleanly to Word). Labels come from the shared scale.
// RATING_SCALE is ordered descending (Excelente first) so charts read left ->
// right from best to worst.
// ---------------------------------------------------------------------------

const RATING_COLORS = {
  4: "#16a34a",
  3: "#84cc16",
  2: "#eab308",
  1: "#f97316",
  0: "#dc2626",
};

export const RATING_SCALE = RATING_LABELS.map((r) => ({
  ...r,
  color: RATING_COLORS[r.value],
})).sort((a, b) => b.value - a.value);

export const YES_COLOR = "#16a34a";
export const NO_COLOR = "#dc2626";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function typeOf(q) {
  return String(q?.type || "").trim();
}

function qText(q) {
  return q?.item ?? q?.text ?? q?.Item ?? q?.title ?? q?.label ?? "";
}

function isFilled(s) {
  return String(s ?? "").trim().length > 0;
}

function sortEs(arr) {
  return arr.slice().sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }));
}

// Split a free-text answer into paragraphs (kept as line breaks within one
// bullet). Blank lines are dropped.
function toParagraphs(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function avg2(nums) {
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Number((sum / nums.length).toFixed(2));
}

// ---------------------------------------------------------------------------
// Per-type aggregators. Each receives the question and the array of answer-maps.
// ---------------------------------------------------------------------------

function aggregateRating(q, responses, feminine) {
  const counts = new Map(RATING_SCALE.map((r) => [r.value, 0]));
  let total = 0;
  for (const ans of responses) {
    const v = ans?.[q.id];
    if (Number.isFinite(v) && counts.has(v)) {
      counts.set(v, counts.get(v) + 1);
      total += 1;
    }
  }
  // Left -> right: Excelente (4) ... Insatisfactorio (0)
  const categories = RATING_SCALE.map((r) => ({
    value: r.value,
    label: feminine ? r.labelF : r.labelM,
    color: r.color,
    count: counts.get(r.value) || 0,
  }));
  return { categories, total };
}

function aggregateBinary(q, responses) {
  let yes = 0;
  let no = 0;
  for (const ans of responses) {
    const v = ans?.[q.id];
    if (v === "yes") yes += 1;
    else if (v === "no") no += 1;
  }
  const total = yes + no;
  return {
    rows: [
      { label: YES_LABEL, count: yes, color: YES_COLOR },
      { label: NO_LABEL, count: no, color: NO_COLOR },
    ],
    total,
  };
}

function aggregateInputList(q, responses) {
  const out = [];
  for (const ans of responses) {
    const v = ans?.[q.id];
    if (Array.isArray(v)) {
      for (const item of v) if (isFilled(item)) out.push(String(item).trim());
    }
  }
  return { items: sortEs(out) };
}

function aggregateTextArea(q, responses) {
  // One bullet per respondent; each bullet may have multiple paragraphs.
  const bullets = [];
  for (const ans of responses) {
    const paragraphs = toParagraphs(ans?.[q.id]);
    if (paragraphs.length) bullets.push(paragraphs);
  }
  // Sort alphabetically by the joined text.
  bullets.sort((a, b) =>
    a.join(" ").localeCompare(b.join(" "), "es", { sensitivity: "base" }),
  );
  return { items: bullets };
}

function aggregateGrid(q, responses) {
  const items = Array.isArray(q.items) ? q.items : [];
  const meta = q?.meta && typeof q.meta === "object" ? q.meta : {};
  const columns = Array.isArray(meta.columns) ? meta.columns : ["label", "value"];
  const hasSuggestion = columns.includes("suggestion");

  const rows = items.map((it) => {
    const id = String(it.id);
    const values = [];
    const suggestions = [];
    for (const ans of responses) {
      const cell = ans?.[id];
      if (cell && typeof cell === "object") {
        if (Number.isFinite(cell.value)) values.push(cell.value);
        if (isFilled(cell.suggestion)) suggestions.push(String(cell.suggestion).trim());
      }
    }
    return {
      text: it.text || it.item || "",
      avg: avg2(values),
      count: values.length,
      suggestions: hasSuggestion ? sortEs(suggestions) : [],
    };
  });

  return { hasSuggestion, items: rows };
}

function aggregateEvaluation(q, responses) {
  const nums = [];
  for (const ans of responses) {
    const v = ans?.[q.id];
    if (Number.isFinite(v)) nums.push(v);
  }
  return { avg: avg2(nums), count: nums.length };
}

// Subgroup text_area answers by the value a respondent gave to a categorical
// (rating_*_5 or binary_yes_no) question in the same group.
function aggregateGroupedText(textQ, catQ, responses) {
  const catType = typeOf(catQ);
  const feminine = catType === "rating_fem_5";

  let buckets;
  if (catType === "binary_yes_no") {
    buckets = [
      { key: "yes", label: YES_LABEL, color: YES_COLOR },
      { key: "no", label: NO_LABEL, color: NO_COLOR },
    ];
  } else {
    buckets = RATING_SCALE.map((r) => ({
      key: r.value,
      label: feminine ? r.labelF : r.labelM,
      color: r.color,
    }));
  }

  const byKey = new Map(buckets.map((b) => [String(b.key), []]));
  for (const ans of responses) {
    const catVal = ans?.[catQ.id];
    const key =
      catType === "binary_yes_no" ? catVal : Number.isFinite(catVal) ? catVal : null;
    const paragraphs = toParagraphs(ans?.[textQ.id]);
    if (key == null || !byKey.has(String(key)) || !paragraphs.length) continue;
    byKey.get(String(key)).push(paragraphs);
  }

  const groups = buckets
    .map((b) => {
      const entries = byKey.get(String(b.key)) || [];
      entries.sort((x, y) =>
        x.join(" ").localeCompare(y.join(" "), "es", { sensitivity: "base" }),
      );
      return { ...b, entries };
    })
    .filter((g) => g.entries.length > 0);

  return { groups };
}

// ---------------------------------------------------------------------------
// Pairing — for a focal participant's C2 report.
// Counts how often the focal person was paired with each other peer across all
// C1 pairing answers (A-B is the same as B-A). Sorted most-mentioned first.
// ---------------------------------------------------------------------------

export function aggregatePairingForFocal(c1Answers, pairingQuestionId, focalId, nameById) {
  const counts = new Map();
  for (const ans of c1Answers) {
    const rows = ans?.[pairingQuestionId];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const left = String(row?.leftId || "");
      const right = String(row?.rightId || "");
      if (!left || !right || left === right) continue;
      let partner = null;
      if (left === String(focalId)) partner = right;
      else if (right === String(focalId)) partner = left;
      if (!partner) continue;
      counts.set(partner, (counts.get(partner) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, name: nameById(id), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

// ---------------------------------------------------------------------------
// Main: build ordered report blocks for a questionnaire.
//
//   questions : template.questions
//   responses : array of answer-maps (one per submitted respondent)
//
// Returns an ordered array of blocks; each has { id, groupId, kind, ... }.
// pairing_rows questions are skipped here (handled separately for C2).
// ---------------------------------------------------------------------------

export function buildReportBlocks(questions, responses) {
  const qs = (Array.isArray(questions) ? questions : []).map((q, idx) => ({
    ...q,
    id: String(q?.id || q?.key || `${idx}`),
    _groupId: String(q?.groupId || "").trim(),
    _type: typeOf(q),
  }));

  // For each group, find the first categorical question — used to subgroup any
  // text_area sibling.
  const catByGroup = new Map();
  for (const q of qs) {
    if (!q._groupId) continue;
    if (q._type === "rating_masc_5" || q._type === "rating_fem_5" || q._type === "binary_yes_no") {
      if (!catByGroup.has(q._groupId)) catByGroup.set(q._groupId, q);
    }
  }
  // text_area ids that are "consumed" into a grouped categorical block.
  const consumedTextIds = new Set();
  for (const q of qs) {
    if (q._type !== "text_area" || !q._groupId) continue;
    if (catByGroup.has(q._groupId)) consumedTextIds.add(q.id);
  }

  function groupedTextSibling(catQ) {
    if (!catQ._groupId) return null;
    return (
      qs.find(
        (x) =>
          x._type === "text_area" &&
          x._groupId === catQ._groupId &&
          consumedTextIds.has(x.id),
      ) || null
    );
  }

  const blocks = [];

  for (const q of qs) {
    const base = { id: q.id, groupId: q._groupId || null, questionText: qText(q) };

    switch (q._type) {
      case "header":
        blocks.push({ ...base, kind: "header" });
        break;

      case "rating_masc_5":
      case "rating_fem_5": {
        const feminine = q._type === "rating_fem_5";
        const chart = aggregateRating(q, responses, feminine);
        const textQ = groupedTextSibling(q);
        if (textQ) {
          blocks.push({
            ...base,
            kind: "categorical_text",
            categoricalKind: "rating",
            chart,
            text: { questionText: qText(textQ), ...aggregateGroupedText(textQ, q, responses) },
          });
        } else {
          blocks.push({ ...base, kind: "rating_chart", ...chart });
        }
        break;
      }

      case "binary_yes_no": {
        const chart = aggregateBinary(q, responses);
        const textQ = groupedTextSibling(q);
        if (textQ) {
          blocks.push({
            ...base,
            kind: "categorical_text",
            categoricalKind: "binary",
            chart,
            text: { questionText: qText(textQ), ...aggregateGroupedText(textQ, q, responses) },
          });
        } else {
          blocks.push({ ...base, kind: "binary_chart", ...chart });
        }
        break;
      }

      case "text_area":
        if (consumedTextIds.has(q.id)) break; // rendered inside its categorical block
        blocks.push({ ...base, kind: "text_list", ...aggregateTextArea(q, responses) });
        break;

      case "input_list":
        blocks.push({ ...base, kind: "bullet_list", ...aggregateInputList(q, responses) });
        break;

      case "value_0_4_grid":
        blocks.push({ ...base, kind: "grid", ...aggregateGrid(q, responses) });
        break;

      case "evaluation_0_10":
        blocks.push({ ...base, kind: "big_average", ...aggregateEvaluation(q, responses) });
        break;

      case "pairing_rows":
        // Excluded from C1 report; surfaced separately in C2.
        break;

      default:
        // Unknown / unsupported type: skip silently.
        break;
    }
  }

  return blocks;
}
