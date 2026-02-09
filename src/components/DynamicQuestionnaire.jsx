import React from "react";

/**
 * DynamicQuestionnaire
 * Canon types soportados:
 *  - header
 *  - select_peer (solo lectura; legacy C2.q0)
 *  - input (multi entradas)
 *  - textarea
 *  - binary
 *  - rating_m, rating_f
 *  - value_0_4
 *  - eval_0_10
 *  - pairing_rows
 *
 * Alias soportados (normalizados):
 *  - rating_masc_5 -> rating_m
 *  - rating_fem_5  -> rating_f
 *  - binary_yes_no -> binary
 *  - text_area     -> textarea
 *  - input_list    -> input
 */

const DEFAULT_RATING_M = [
  "Insatisfactorio",
  "Regular",
  "Bueno",
  "Muy Bueno",
  "Excelente",
];

const DEFAULT_RATING_F = [
  "Insatisfactoria",
  "Regular",
  "Buena",
  "Muy Buena",
  "Excelente",
];

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function safeHtml(html) {
  return { __html: String(html || "") };
}

function normalizeType(typeRaw) {
  const t = String(typeRaw || "").toLowerCase().trim();
  if (t === "rating_masc_5") return "rating_m";
  if (t === "rating_fem_5") return "rating_f";
  if (t === "binary_yes_no") return "binary";
  if (t === "text_area") return "textarea";
  if (t === "input_list") return "input";
  if (t === "pairing_of_peers") return "pairing_rows";
  return t;
}

function normalizeQuestion(q) {
  const type = normalizeType(q?.type);

  // Copiamos campos y armonizamos nombres
  const out = { ...(q || {}), type };

  // Asegurar min/max entries para input/textarea/binary/ratings/value/eval
  if (out.minEntries == null && out.min_entries != null) out.minEntries = out.min_entries;
  if (out.maxEntries == null && out.max_entries != null) out.maxEntries = out.max_entries;

  // Defaults para ratings si no viene options
  if ((type === "rating_m" || type === "rating_f") && (!Array.isArray(out.options) || out.options.length === 0)) {
    out.options = type === "rating_f" ? DEFAULT_RATING_F : DEFAULT_RATING_M;
  }

  return out;
}

function getShownQuestions(questions, answers) {
  const out = [];
  for (const raw of questions || []) {
    const q = normalizeQuestion(raw);
    if (!q) continue;

    if (q.showIf && q.showIf.id) {
      const v = answers?.[q.showIf.id];
      const expected = q.showIf.equals;
      if (v !== expected) continue;
    }
    out.push(q);
  }
  return out;
}

function ensureDefaultForQuestion(q, prevAnswers) {
  const id = q.id;
  const cur = prevAnswers?.[id];

  // No response types
  if (q.type === "header" || q.type === "select_peer") return prevAnswers;

  if (q.type === "input") {
    const max = Number(q.maxEntries ?? 1) || 1;
    if (Array.isArray(cur) && cur.length === max) return prevAnswers;
    const nextArr = Array.isArray(cur) ? cur.slice(0, max) : [];
    while (nextArr.length < max) nextArr.push("");
    return { ...prevAnswers, [id]: nextArr };
  }

  if (q.type === "textarea") {
    if (typeof cur === "string") return prevAnswers;
    return { ...prevAnswers, [id]: "" };
  }

  if (q.type === "binary") {
    if (cur === "Sí" || cur === "No") return prevAnswers;
    return { ...prevAnswers, [id]: "" };
  }

  if (q.type === "rating_m" || q.type === "rating_f") {
    if (typeof cur === "number" || cur === null) return prevAnswers;
    return { ...prevAnswers, [id]: null };
  }

  if (q.type === "value_0_4") {
    if (cur && typeof cur === "object") {
      const vOk = cur.value == null || (typeof cur.value === "number" && Number.isFinite(cur.value));
      const sOk = cur.suggestion == null || typeof cur.suggestion === "string";
      if (vOk && sOk) return prevAnswers;
    }
    return { ...prevAnswers, [id]: { value: null, suggestion: "" } };
  }

  if (q.type === "eval_0_10") {
    if (typeof cur === "number" || cur === null) return prevAnswers;
    return { ...prevAnswers, [id]: null };
  }

  if (q.type === "pairing_rows") {
    const rows = Number(q.rows ?? 3) || 3;
    if (Array.isArray(cur) && cur.length === rows) return prevAnswers;
    const next = Array.isArray(cur) ? cur.slice(0, rows) : [];
    while (next.length < rows) next.push({ leftId: "", rightId: "" });
    return { ...prevAnswers, [id]: next };
  }

  return prevAnswers;
}

function countNonEmptyStrings(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.filter((x) => String(x || "").trim()).length;
}

function validateAnswers(questions, answers) {
  const shown = getShownQuestions(questions, answers);
  const errors = {};

  for (const q of shown) {
    const id = q.id;
    if (!id) continue;

    if (q.type === "header" || q.type === "select_peer") continue;

    if (q.type === "input") {
      const min = Number(q.minEntries ?? 0) || 0;
      const max = Number(q.maxEntries ?? 1) || 1;
      const arr = answers?.[id];
      const filled = countNonEmptyStrings(arr);
      if (filled < min) errors[id] = `Debe completar al menos ${min} de ${max}.`;
    }

    if (q.type === "textarea") {
      const min = Number(q.minEntries ?? 0) || 0;
      const txt = String(answers?.[id] || "").trim();
      if (min >= 1 && !txt) errors[id] = "Campo requerido.";
    }

    if (q.type === "binary") {
      const min = Number(q.minEntries ?? 0) || 0;
      const v = answers?.[id];
      if (min >= 1 && v !== "Sí" && v !== "No") errors[id] = "Seleccione Sí o No.";
    }

    if (q.type === "rating_m" || q.type === "rating_f") {
      const min = Number(q.minEntries ?? 0) || 0;
      const idx = answers?.[id];
      if (min >= 1 && typeof idx !== "number") errors[id] = "Seleccione una opción.";
    }

    if (q.type === "value_0_4") {
      const min = Number(q.minEntries ?? 0) || 0;
      const obj = answers?.[id];
      const v = obj?.value;
      if (min >= 1 && !(typeof v === "number" && v >= 0 && v <= 4)) {
        errors[id] = "Ingrese un valor de 0 a 4.";
      }
    }

    if (q.type === "eval_0_10") {
      const min = Number(q.minEntries ?? 0) || 0;
      const v = answers?.[id];
      if (min >= 1 && !(typeof v === "number" && v >= 0 && v <= 10)) {
        errors[id] = "Ingrese un valor de 0 a 10.";
      }
    }

    if (q.type === "pairing_rows") {
      const min = Number(q.minEntries ?? 0) || 0;
      const rows = Array.isArray(answers?.[id]) ? answers[id] : [];
      const complete = rows.filter((r) => r?.leftId && r?.rightId).length;
      if (min >= 1 && complete < min) errors[id] = `Debe completar al menos ${min} relación(es).`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, shown };
}

function FieldWrap({ labelHtml, help, error, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      {labelHtml ? (
        <div style={{ fontWeight: 800, marginBottom: 8 }} dangerouslySetInnerHTML={safeHtml(labelHtml)} />
      ) : null}

      {help ? (
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>{help}</div>
      ) : null}

      {children}

      {error ? (
        <div style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>{error}</div>
      ) : null}
    </div>
  );
}

export default function DynamicQuestionnaire({
  questions = [],
  answers,
  setAnswers,
  disabled = false,
  peerOptions = [],
  peerName = "",
}) {
  React.useEffect(() => {
    if (!questions?.length) return;
    setAnswers((prev) => {
      let next = prev || {};
      for (const raw of questions) next = ensureDefaultForQuestion(normalizeQuestion(raw), next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const { errors } = validateAnswers(questions, answers || {});
  function setAnswer(id, value) {
    setAnswers((prev) => ({ ...(prev || {}), [id]: value }));
  }

  const shown = getShownQuestions(questions, answers || {});

  return (
    <div>
      {shown.map((q) => {
        if (q.type === "header") {
          const header = q.item || "";
          return (
            <div key={q.id} style={{ marginTop: 18 }}>
              <div
                style={{ fontWeight: 900, fontSize: 16 }}
                dangerouslySetInnerHTML={safeHtml(header.replace("<peer>", peerName))}
              />
            </div>
          );
        }

        if (q.type === "select_peer") {
          return (
            <FieldWrap
              key={q.id}
              labelHtml={q.item || "Para:"}
              help="Este campo será eliminado (C2 ya está asociado a un compañero)."
            >
              <div className="pill pill-ok" style={{ display: "inline-flex" }}>
                {peerName || "—"}
              </div>
            </FieldWrap>
          );
        }

        if (q.type === "input") {
          const id = q.id;
          const max = Number(q.maxEntries ?? 1) || 1;
          const min = Number(q.minEntries ?? 0) || 0;
          const arr = Array.isArray(answers?.[id]) ? answers[id] : Array.from({ length: max }, () => "");

          return (
            <FieldWrap
              key={id}
              labelHtml={q.item}
              help={min > 0 ? `Requerido: mínimo ${min} de ${max}.` : `Opcional: hasta ${max}.`}
              error={errors[id]}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {arr.map((val, idx) => (
                  <input
                    key={idx}
                    className="admin-input"
                    disabled={disabled}
                    value={val}
                    placeholder={`${idx + 1}.`}
                    onChange={(e) => {
                      const next = arr.slice();
                      next[idx] = e.target.value;
                      setAnswer(id, next);
                    }}
                  />
                ))}
              </div>
            </FieldWrap>
          );
        }

        if (q.type === "textarea") {
          const id = q.id;
          const txt = typeof answers?.[id] === "string" ? answers[id] : "";
          return (
            <FieldWrap key={id} labelHtml={q.item} error={errors[id]}>
              <textarea
                className="admin-textarea"
                disabled={disabled}
                value={txt}
                onChange={(e) => setAnswer(id, e.target.value)}
                placeholder="Escriba aquí…"
              />
            </FieldWrap>
          );
        }

        if (q.type === "binary") {
          const id = q.id;
          const v = answers?.[id] || "";
          return (
            <FieldWrap key={id} labelHtml={q.item} error={errors[id]}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["Sí", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => setAnswer(id, opt)}
                    style={{
                      border: v === opt ? "1px solid rgba(3,169,244,0.95)" : undefined,
                      background: v === opt ? "rgba(3,169,244,0.16)" : undefined,
                      fontWeight: v === opt ? 900 : 700,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </FieldWrap>
          );
        }

        if (q.type === "rating_m" || q.type === "rating_f") {
          const id = q.id;
          const opts = Array.isArray(q.options) && q.options.length ? q.options : (q.type === "rating_f" ? DEFAULT_RATING_F : DEFAULT_RATING_M);
          const idx = typeof answers?.[id] === "number" ? answers[id] : null;

          return (
            <FieldWrap key={id} labelHtml={q.item} error={errors[id]}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {opts.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => setAnswer(id, i)}
                    style={{
                      border: idx === i ? "1px solid rgba(3,169,244,0.95)" : undefined,
                      background: idx === i ? "rgba(3,169,244,0.16)" : undefined,
                      fontWeight: idx === i ? 900 : 700,
                    }}
                    title={opt}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </FieldWrap>
          );
        }

        if (q.type === "value_0_4") {
          const id = q.id;
          const obj = answers?.[id] && typeof answers[id] === "object" ? answers[id] : { value: null, suggestion: "" };
          const v = obj.value;
          const sug = obj.suggestion || "";

          return (
            <FieldWrap key={id} labelHtml={q.item} error={errors[id]}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="admin-input"
                  style={{ width: 120 }}
                  disabled={disabled}
                  inputMode="numeric"
                  value={v == null ? "" : String(v)}
                  placeholder="0–4"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return setAnswer(id, { ...obj, value: null });
                    const num = clamp(raw, 0, 4);
                    setAnswer(id, { ...obj, value: num });
                  }}
                />
                <input
                  className="admin-input"
                  style={{ flex: 1, minWidth: 260 }}
                  disabled={disabled}
                  value={sug}
                  placeholder={q.explanation || "Sugerencias para mejorar (opcional)"}
                  onChange={(e) => setAnswer(id, { ...obj, suggestion: e.target.value })}
                />
              </div>
            </FieldWrap>
          );
        }

        if (q.type === "eval_0_10") {
          const id = q.id;
          const v = typeof answers?.[id] === "number" ? answers[id] : null;

          return (
            <FieldWrap key={id} labelHtml={q.item} error={errors[id]}>
              <input
                className="admin-input"
                style={{ width: 160 }}
                disabled={disabled}
                inputMode="numeric"
                value={v == null ? "" : String(v)}
                placeholder="0–10"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return setAnswer(id, null);
                  const num = clamp(raw, 0, 10);
                  setAnswer(id, num);
                }}
              />
            </FieldWrap>
          );
        }

        if (q.type === "pairing_rows") {
          const id = q.id;
          const rows = Number(q.rows ?? 3) || 3;
          const value = Array.isArray(answers?.[id]) ? answers[id] : Array.from({ length: rows }, () => ({ leftId: "", rightId: "" }));

          return (
            <FieldWrap key={id} labelHtml={q.item} error={errors[id]}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {value.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      className="admin-input"
                      style={{ minWidth: 220 }}
                      disabled={disabled}
                      value={row.leftId || ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[idx] = { ...next[idx], leftId: e.target.value };
                        setAnswer(id, next);
                      }}
                    >
                      <option value="">Persona…</option>
                      {peerOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    <span style={{ opacity: 0.8 }}>con</span>

                    <select
                      className="admin-input"
                      style={{ minWidth: 220 }}
                      disabled={disabled}
                      value={row.rightId || ""}
                      onChange={(e) => {
                        const next = value.slice();
                        next[idx] = { ...next[idx], rightId: e.target.value };
                        setAnswer(id, next);
                      }}
                    >
                      <option value="">Compañero…</option>
                      {peerOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </FieldWrap>
          );
        }

        return (
          <div key={q.id} style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
            Tipo no soportado: <code>{q.type}</code>
          </div>
        );
      })}
    </div>
  );
}

export function validateQuestionnaire(questions, answers) {
  return validateAnswers(questions, answers);
}
