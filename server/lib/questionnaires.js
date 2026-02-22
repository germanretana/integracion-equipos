/**
 * Cuestionarios: helpers puros para:
 * - draft meaningful
 * - completion desde template
 * - status todo/progress/done
 *
 * Importante: este archivo NO toca DB ni Express.
 */

function getQuestionsFromTemplate(template) {
  const qs = template?.questions;
  return Array.isArray(qs) ? qs : [];
}

function qId(q, idx) {
  return String(q?.id || q?.key || `${idx}`);
}

function qType(q) {
  return String(q?.type || "").toLowerCase();
}

function isFilledString(x) {
  return String(x || "").trim().length > 0;
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const y = Math.trunc(x);
  if (y < min || y > max) return null;
  return y;
}

function isAnswerableQuestion(q) {
  const t = qType(q);
  if (!t) return false;
  if (t === "header") return false;
  return true;
}

function normalizePairKey(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  return x < y ? `${x}::${y}` : `${y}::${x}`;
}

/**
 * Valida pairing_rows/pairing_of_peers.
 *
 * Reglas:
 * - Si minEntries <= 0 (default), el bloque es OPCIONAL:
 *    - si el usuario no llena nada => OK (answered=true)
 *    - si llena algo => se valida cada par completo y reglas de negocio
 * - Si minEntries > 0:
 *    - requiere al menos minEntries pares completos y válidos
 *
 * Validez de un par:
 * - leftId y rightId no vacíos
 * - leftId !== rightId  (no A-A)
 * - no duplicados ignorando orden (A-B == B-A)
 */
function validatePairingAnswer(q, ans) {
  const rows = Number.isFinite(q.rows) ? q.rows : 3;
  const min = Number.isFinite(q.minEntries) ? q.minEntries : 0;

  const arrRaw = Array.isArray(ans) ? ans.slice(0, rows) : [];

  // Normalizamos filas
  const arr = arrRaw.map((x) => {
    const o = x && typeof x === "object" ? x : {};
    return {
      leftId: String(o.leftId || "").trim(),
      rightId: String(o.rightId || "").trim(),
    };
  });

  // ¿El usuario intentó llenar algo?
  const anyTouched = arr.some((r) => isFilledString(r.leftId) || isFilledString(r.rightId));

  // Si es opcional y está vacío => OK
  if (min <= 0 && !anyTouched) {
    return { ok: true, completeValidCount: 0, anyTouched: false, reason: null };
  }

  const seen = new Set();
  let completeValidCount = 0;

  for (const r of arr) {
    const leftFilled = isFilledString(r.leftId);
    const rightFilled = isFilledString(r.rightId);

    // Si el usuario tocó el bloque, una fila medio llena es inválida
    if ((leftFilled && !rightFilled) || (!leftFilled && rightFilled)) {
      return { ok: false, completeValidCount, anyTouched: true, reason: "incomplete_row" };
    }

    // Fila vacía -> la ignoramos (en opcional) / no suma (en requerido)
    if (!leftFilled && !rightFilled) continue;

    // A-A inválido
    if (String(r.leftId) === String(r.rightId)) {
      return { ok: false, completeValidCount, anyTouched: true, reason: "self_pair" };
    }

    // Duplicado (A-B == B-A)
    const key = normalizePairKey(r.leftId, r.rightId);
    if (seen.has(key)) {
      return { ok: false, completeValidCount, anyTouched: true, reason: "duplicate_pair" };
    }
    seen.add(key);

    completeValidCount += 1;
  }

  // Si es requerido, pedimos mínimo de pares completos válidos
  if (min > 0 && completeValidCount < min) {
    return { ok: false, completeValidCount, anyTouched: true, reason: "min_not_met" };
  }

  return { ok: true, completeValidCount, anyTouched: true, reason: null };
}

function isQuestionAnswered(q, ans) {
  const t = qType(q);

  if (t === "text_area") return isFilledString(ans);

  if (t === "binary_yes_no") return ans === "yes" || ans === "no";

  if (t === "rating_masc_5" || t === "rating_fem_5") {
    return Number.isFinite(ans) && clampInt(ans, 0, 4) !== null;
  }

  if (t === "evaluation_0_10") {
    return Number.isFinite(ans) && clampInt(ans, 0, 10) !== null;
  }

  if (t === "value_0_4" || t === "valor_0_4") {
    if (!ans || typeof ans !== "object") return false;
    return Number.isFinite(ans.value) && clampInt(ans.value, 0, 4) !== null;
  }

  if (t === "input_list") {
    const max = Number.isFinite(q.maxEntries) ? q.maxEntries : 1;
    const min = Number.isFinite(q.minEntries) ? q.minEntries : 1;
    const arr = Array.isArray(ans) ? ans.slice(0, max) : [];
    const filled = arr.filter(isFilledString).length;
    return filled >= min;
  }

  if (t === "pairing_rows" || t === "pairing_of_peers") {
    const v = validatePairingAnswer(q, ans);
    return v.ok;
  }

  // fallback: string/number truthy-ish
  if (typeof ans === "string") return isFilledString(ans);
  if (typeof ans === "number") return Number.isFinite(ans);
  if (Array.isArray(ans)) return ans.some((x) => isFilledString(x));
  if (ans && typeof ans === "object") {
    if (typeof ans.value === "number" && Number.isFinite(ans.value)) return true;
    if (typeof ans.value === "string" && isFilledString(ans.value)) return true;
    if (typeof ans.suggestion === "string" && isFilledString(ans.suggestion)) return true;
    if (typeof ans.leftId === "string" && isFilledString(ans.leftId)) return true;
    if (typeof ans.rightId === "string" && isFilledString(ans.rightId)) return true;
  }
  return false;
}

export function computeCompletionFromTemplate(template, draft) {
  const questions = getQuestionsFromTemplate(template).filter(isAnswerableQuestion);
  const answers = draft?.answers && typeof draft.answers === "object" ? draft.answers : {};

  // Compute total number of questions
  let total = 0;
  for (const q of questions) {
    if (qType(q) === "value_0_4_grid") {
      total += Array.isArray(q.items) ? q.items.length : 0;
    } else {
      total += 1;
    }
  }
  if (total === 0) return { total: 0, answered: 0, percent: 0, missingIds: [], invalidIds: [] };

  let answered = 0;
  const missingIds = [];
  const invalidIds = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const t = qType(q);

    // value_0_4_grid: expand items
    if (t === "value_0_4_grid") {
      const items = Array.isArray(q.items) ? q.items : [];
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const id = String(it.id);
        const a = answers[id];
        if (isQuestionAnswered({ type: "value_0_4" }, a)) {
          answered += 1;
        } else {
          missingIds.push(id);
        }
      }
      continue;
    }

    const id = qId(q, i);
    const a = answers[id];

    // pairing_rows: si es opcional y vacío, cuenta como answered
    if (t === "pairing_rows" || t === "pairing_of_peers") {
      const v = validatePairingAnswer(q, a);

      if (v.ok) {
        answered += 1;
      } else {
        // distinguimos inválido vs faltante (para mensaje de submit)
        invalidIds.push(id);
        missingIds.push(id);
      }
      continue;
    }

    if (isQuestionAnswered(q, a)) answered += 1;
    else missingIds.push(id);
  }

  const percent = Math.max(0, Math.min(100, Math.round((answered / total) * 100)));
  return { total, answered, percent, missingIds, invalidIds };
}

export function hasMeaningfulDraft(draft) {
  if (!draft) return false;
  const txt = String(draft?.freeText || "").trim();
  if (txt) return true;

  const answers = draft?.answers;
  if (!answers || typeof answers !== "object") return false;

  return Object.values(answers).some((v) => {
    if (v == null) return false;
    if (typeof v === "string") return isFilledString(v);
    if (typeof v === "number") return Number.isFinite(v);
    if (Array.isArray(v)) return v.some((x) => isFilledString(x));
    if (typeof v === "object") {
      if (typeof v.value === "number" && Number.isFinite(v.value)) return true;
      if (typeof v.suggestion === "string" && isFilledString(v.suggestion)) return true;
      if (typeof v.leftId === "string" && isFilledString(v.leftId)) return true;
      if (typeof v.rightId === "string" && isFilledString(v.rightId)) return true;
    }
    return false;
  });
}

export function calcStatusFromEntryAndTemplate(entry, template) {
  if (!entry) return { status: "todo", percent: 0 };
  if (entry.submittedAt) return { status: "done", percent: 100 };
  if (!hasMeaningfulDraft(entry.draft)) return { status: "todo", percent: 0 };

  const comp = computeCompletionFromTemplate(template, entry.draft);
  return { status: "progress", percent: comp.percent };
}
