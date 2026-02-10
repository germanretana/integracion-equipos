import React from "react";

/**
 * Renderer genérico basado en templates.questions.
 * answers shape recomendado:
 * - rating_*: number (0..4)
 * - binary_yes_no: "yes" | "no"
 * - text_area: string
 * - input_list: string[] (largo = maxEntries)
 * - value_0_4 / valor_0_4: { value: number|null, suggestion: string }
 * - evaluation_0_10: number (0..10)
 * - pairing_rows: Array<{ leftId: string, rightId: string }>
 */

const SCALE_5 = [
  { value: 0, labelM: "Insatisfactorio", labelF: "Insatisfactoria" },
  { value: 1, labelM: "Regular", labelF: "Regular" },
  { value: 2, labelM: "Bueno", labelF: "Buena" },
  { value: 3, labelM: "Muy Bueno", labelF: "Muy Buena" },
  { value: 4, labelM: "Excelente", labelF: "Excelente" },
];

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const y = Math.trunc(x);
  if (y < min) return min;
  if (y > max) return max;
  return y;
}

function ensureArrayLen(arr, len) {
  const out = Array.isArray(arr) ? arr.slice() : [];
  while (out.length < len) out.push("");
  return out.slice(0, len);
}

function isFilledString(s) {
  return String(s || "").trim().length > 0;
}

function normalizeType(typeRaw) {
  const t = String(typeRaw || "").toLowerCase().trim();

  // Canon types expected by this renderer:
  // header, input_list, text_area, binary_yes_no, rating_masc_5, rating_fem_5,
  // value_0_4, evaluation_0_10, pairing_rows
  //
  // IMPORTANT: select_peer is deprecated and MUST NOT render.

  // Legacy / aliases:
  if (t === "pairing_of_peers") return "pairing_rows";
  if (t === "valor_0_4") return "value_0_4";
  if (t === "eval_0_10") return "evaluation_0_10";

  // Some alternate spellings (defensive)
  if (t === "textarea") return "text_area";
  if (t === "binary") return "binary_yes_no";
  if (t === "input") return "input_list";

  // Deprecated:
  if (t === "select_peer") return "__skip__";

  return t;
}

function helpText(minEntries, maxEntries) {
  if (minEntries == null && maxEntries == null) return "";
  if (minEntries === maxEntries && Number.isFinite(minEntries)) {
    if (minEntries === 1) return "Requerido.";
    return `Requerido: ${minEntries}.`;
  }
  if (Number.isFinite(minEntries) && Number.isFinite(maxEntries)) {
    return `Requerido: ${minEntries}. Máximo: ${maxEntries}.`;
  }
  if (Number.isFinite(minEntries)) return `Requerido: ${minEntries}.`;
  if (Number.isFinite(maxEntries)) return `Máximo: ${maxEntries}.`;
  return "";
}

/**
 * Temporary fallback for existing seeds/templates:
 * C2.q9 is currently detected by ID patterns. We will later migrate this to meta.block/meta.layout.
 */
function isC2Q9Id(id) {
  const x = String(id || "");
  return /^c2-9[_-]\d{2}$/i.test(x) || /^c2\.q9\.\d{2}$/i.test(x);
}

function isC2Q9HeaderId(id) {
  const x = String(id || "");
  return /^c2-9$/i.test(x) || /^c2\.q9$/i.test(x);
}

function qText(q) {
  return q?.text ?? q?.item ?? q?.Item ?? q?.title ?? q?.label ?? "";
}

function Html({ html }) {
  if (!html) return null;
  return <span dangerouslySetInnerHTML={{ __html: String(html) }} />;
}

function DefaultFieldWrap({ title, requiredHint, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      {title ? (
        <div style={{ fontWeight: 800, marginBottom: 8, lineHeight: 1.35 }}>
          {title}{" "}
          {requiredHint ? (
            <span style={{ fontWeight: 600, opacity: 0.7, fontSize: 12 }}>
              ({requiredHint})
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function ButtonsRow({ children }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
  );
}

function BtnChoice({ active, disabled, onClick, children, title, style }) {
  return (
    <button
      type="button"
      className="admin-btn"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        opacity: disabled ? 0.6 : 1,
        ...(active
          ? {
              border: "1px solid rgba(255,255,255,0.50)",
            }
          : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function MissingWrap({ qid, missing, children }) {
  if (children == null) return null;

  return (
    <div
      data-qid={qid}
      style={{
        borderRadius: 14,
        padding: missing ? 10 : 0,
        border: missing
          ? "1px solid rgba(255,102,143,0.85)"
          : "1px solid transparent",
        background: missing ? "rgba(255,102,143,0.10)" : "transparent",
      }}
    >
      {missing ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            marginBottom: 6,
            color: "#ff668f",
          }}
        >
          Falta completar esta pregunta
        </div>
      ) : null}
      {children}
    </div>
  );
}

function ratingActiveStyle(value) {
  // Rojo -> naranja -> ámbar -> verde -> verde fuerte
  const palette = {
    0: { bg: "rgba(255, 80, 80, 0.26)", bd: "rgba(255, 80, 80, 0.55)" },
    1: { bg: "rgba(255, 150, 60, 0.24)", bd: "rgba(255, 150, 60, 0.52)" },
    2: { bg: "rgba(255, 200, 60, 0.22)", bd: "rgba(255, 200, 60, 0.50)" },
    3: { bg: "rgba(120, 220, 120, 0.22)", bd: "rgba(120, 220, 120, 0.50)" },
    4: { bg: "rgba(0, 230, 160, 0.24)", bd: "rgba(0, 230, 160, 0.55)" },
  };
  const p = palette[value] || { bg: "rgba(255,255,255,0.14)", bd: "rgba(255,255,255,0.40)" };
  return {
    background: p.bg,
    border: `1px solid ${p.bd}`,
  };
}

export default function QuestionnaireRenderer({
  questions = [],
  answers = {},
  onChange,
  peers = [],
  disabled = false,

  // (legacy) kept for compatibility with callers, but select_peer must not render
  currentPeerId = "",
  currentPeerName = "",

  // para excluirme de listas (C1 pairings)
  currentParticipantId = "",

  // ids faltantes (desde submit)
  missingIds = [],
}) {
  const missingSet = React.useMemo(
    () => new Set((missingIds || []).map((x) => String(x))),
    [missingIds],
  );

  function setAnswer(qid, value) {
    onChange?.({ ...answers, [qid]: value });
  }

  function renderHeader(q) {
    const text = qText(q);
    return (
      <div style={{ marginTop: 16 }}>
        {text ? (
          <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.95 }}>
            <Html html={text} />
          </div>
        ) : null}
      </div>
    );
  }

  function renderTextArea(q) {
    const val = String(answers?.[q.id] || "");
    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <textarea
          value={val}
          disabled={disabled}
          placeholder={q.placeholder || "Escriba aquí…"}
          onChange={(e) => setAnswer(q.id, e.target.value)}
        />
      </DefaultFieldWrap>
    );
  }

  function renderInputList(q) {
    const max = Number.isFinite(q.maxEntries) ? q.maxEntries : 1;
    const min = Number.isFinite(q.minEntries) ? q.minEntries : 0;

    const arr = ensureArrayLen(answers?.[q.id], max);
    const missingCount = Math.max(
      0,
      min - arr.filter((x) => isFilledString(x)).length,
    );

    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(min, max)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {arr.map((v, idx) => (
            <input
              key={idx}
              className="admin-input"
              disabled={disabled}
              value={v}
              placeholder={q.itemPlaceholder || `Respuesta ${idx + 1}`}
              onChange={(e) => {
                const next = arr.slice();
                next[idx] = e.target.value;
                setAnswer(q.id, next);
              }}
            />
          ))}
        </div>

        {!disabled && missingCount > 0 ? (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
            Faltan {missingCount} respuesta(s) requerida(s).
          </div>
        ) : null}
      </DefaultFieldWrap>
    );
  }

  function renderBinaryYesNo(q) {
    const val = answers?.[q.id] || "";
    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <ButtonsRow>
          <BtnChoice
            disabled={disabled}
            active={val === "yes"}
            onClick={() => setAnswer(q.id, "yes")}
          >
            Sí
          </BtnChoice>
          <BtnChoice
            disabled={disabled}
            active={val === "no"}
            onClick={() => setAnswer(q.id, "no")}
          >
            No
          </BtnChoice>
        </ButtonsRow>
      </DefaultFieldWrap>
    );
  }

  function renderRating5(q, feminine) {
    const cur = answers?.[q.id];
    const curNum = Number.isFinite(cur) ? cur : null;

    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <ButtonsRow>
          {SCALE_5.map((o) => (
            <BtnChoice
              key={o.value}
              disabled={disabled}
              active={curNum === o.value}
              onClick={() => setAnswer(q.id, o.value)}
              title={`Valor: ${o.value}`}
              style={curNum === o.value ? ratingActiveStyle(o.value) : undefined}
            >
              {feminine ? o.labelF : o.labelM}
            </BtnChoice>
          ))}
        </ButtonsRow>
      </DefaultFieldWrap>
    );
  }

  function renderValue04Compact(q) {
    const curRaw = answers?.[q.id];
    const cur = curRaw && typeof curRaw === "object" ? curRaw : {};
    const val = cur && typeof cur === "object" ? cur.value : null;
    const valNum = Number.isFinite(val) ? val : null;

    return (
      <div className="c2q9-item" data-qid={q.id}>
        <p className="c2q9-label">
          <Html html={qText(q)} />
        </p>

        <div className="c2q9-inputRow">
          <input
            className="admin-input"
            disabled={disabled}
            inputMode="numeric"
            value={valNum == null ? "" : String(valNum)}
            placeholder="0 a 4"
            onChange={(e) => {
              const nextVal =
                e.target.value === "" ? null : clampInt(e.target.value, 0, 4);
              // C2.q9: sin suggestion
              setAnswer(q.id, { value: nextVal });
            }}
          />
          {/* Nota "0–4" removida por UX (backlog #1/#2) */}
        </div>

        {missingSet.has(String(q.id)) ? (
          <div className="c2q9-help" style={{ color: "#ff668f", opacity: 1 }}>
            Falta completar esta pregunta
          </div>
        ) : null}
      </div>
    );
  }

  function renderValue04(q) {
    const meta = q?.meta && typeof q.meta === "object" ? q.meta : {};
    const noSuggestion = meta.noSuggestion === true;
    const hideLegend = meta.hideLegend === true;

    const curRaw = answers?.[q.id];
    const cur = curRaw && typeof curRaw === "object" ? curRaw : {};
    const val = cur && typeof cur === "object" ? cur.value : null;
    const sug = cur && typeof cur === "object" ? String(cur.suggestion || "") : "";

    const valNum = Number.isFinite(val) ? val : null;

    function setValue(nextVal) {
      if (noSuggestion) return setAnswer(q.id, { value: nextVal });
      return setAnswer(q.id, { value: nextVal, suggestion: sug });
    }

    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
              Valor
            </div>
            <input
              className="admin-input"
              style={{ width: 160 }}
              disabled={disabled}
              inputMode="numeric"
              value={valNum == null ? "" : String(valNum)}
              placeholder="0 a 4"
              onChange={(e) => {
                const nextVal =
                  e.target.value === "" ? null : clampInt(e.target.value, 0, 4);
                setValue(nextVal);
              }}
            />
            {!hideLegend ? (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                0 Insatisfactorio · 1 Regular · 2 Bueno · 3 Muy Bueno · 4 Excelente
              </div>
            ) : null}
          </div>

          {!noSuggestion ? (
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                {q.explanationLabel || "Sugerencias para mejorar (opcional)"}
              </div>
              <textarea
                disabled={disabled}
                value={sug}
                placeholder="Sugerencias…"
                onChange={(e) =>
                  setAnswer(q.id, { value: valNum, suggestion: e.target.value })
                }
              />
            </div>
          ) : null}
        </div>
      </DefaultFieldWrap>
    );
  }

  function renderEvaluation010(q) {
    const cur = answers?.[q.id];
    const curNum = Number.isFinite(cur) ? cur : null;

    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            className="admin-input"
            style={{ width: 160 }}
            disabled={disabled}
            inputMode="numeric"
            value={curNum == null ? "" : String(curNum)}
            placeholder="0 a 10"
            onChange={(e) => {
              const nextVal =
                e.target.value === "" ? null : clampInt(e.target.value, 0, 10);
              setAnswer(q.id, nextVal);
            }}
          />
          {/* Ayuda redundante removida (backlog #3). Si luego queremos, la reintroducimos vía meta. */}
        </div>
      </DefaultFieldWrap>
    );
  }

  function renderPairingRows(q) {
    const rows = Number.isFinite(q.rows) ? q.rows : 3;
    const cur = ensureArrayLen(answers?.[q.id], rows).map((x) => {
      const o = x && typeof x === "object" ? x : {};
      return { leftId: String(o.leftId || ""), rightId: String(o.rightId || "") };
    });

    const options = (peers || []).filter(
      (p) => String(p?.id || "") !== String(currentParticipantId || ""),
    );

    return (
      <DefaultFieldWrap
        title={qText(q) ? <Html html={qText(q)} /> : null}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cur.map((row, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <select
                className="admin-input"
                disabled={disabled}
                style={{ width: 260 }}
                value={row.leftId}
                onChange={(e) => {
                  const next = cur.slice();
                  next[idx] = { ...next[idx], leftId: e.target.value };
                  setAnswer(q.id, next);
                }}
              >
                <option value="">Persona…</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <span style={{ opacity: 0.75 }}>con</span>

              <select
                className="admin-input"
                disabled={disabled}
                style={{ width: 260 }}
                value={row.rightId}
                onChange={(e) => {
                  const next = cur.slice();
                  next[idx] = { ...next[idx], rightId: e.target.value };
                  setAnswer(q.id, next);
                }}
              >
                <option value="">Con…</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }} />
      </DefaultFieldWrap>
    );
  }

  function renderQuestion(q) {
    const type = normalizeType(q?.type);

    if (type === "__skip__") return null;

    if (type === "header") return renderHeader(q);
    if (type === "text_area") return renderTextArea(q);
    if (type === "input_list") return renderInputList(q);
    if (type === "binary_yes_no") return renderBinaryYesNo(q);
    if (type === "rating_masc_5") return renderRating5(q, false);
    if (type === "rating_fem_5") return renderRating5(q, true);
    if (type === "value_0_4" || type === "valor_0_4") return renderValue04(q);
    if (type === "evaluation_0_10") return renderEvaluation010(q);
    if (type === "pairing_rows" || type === "pairing_of_peers")
      return renderPairingRows(q);

    return (
      <div
        style={{
          marginTop: 14,
          padding: 10,
          borderRadius: 12,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ fontWeight: 800 }}>
          Tipo no soportado: <code>{type || "?"}</code>
        </div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          <Html html={qText(q)} />
        </div>
      </div>
    );
  }

  // === Special layout: C2 q9 value_0_4 in 2 columns (TEMP fallback by ID) ===
  const hasC2Q9 = React.useMemo(() => {
    return (questions || []).some(
      (q) => isC2Q9HeaderId(q?.id) || isC2Q9Id(q?.id),
    );
  }, [questions]);

  const rendered = React.useMemo(() => {
    if (!hasC2Q9) return null;

    const out = [];
    const qs = questions || [];
    let i = 0;

    while (i < qs.length) {
      const q = qs[i];
      const id = String(q?.id || q?.key || `${i}`);
      const type = normalizeType(q?.type);

      // Detect header for c2-9
      if (isC2Q9HeaderId(id) && type === "header") {
        out.push(
          <MissingWrap key={id} qid={id} missing={false}>
            {renderHeader({ ...q, id })}
          </MissingWrap>,
        );

        // collect subsequent c2-9 items
        const items = [];
        i += 1;
        while (i < qs.length) {
          const q2 = qs[i];
          const id2 = String(q2?.id || q2?.key || `${i}`);
          if (!isC2Q9Id(id2)) break;
          items.push({ ...q2, id: id2 });
          i += 1;
        }

        if (items.length) {
          out.push(
            <div key="c2q9-grid" className="c2q9-grid">
              {items.map((it) => renderValue04Compact(it))}
            </div>,
          );
        }
        continue;
      }

      const child = renderQuestion({ ...q, id });
      out.push(
        <MissingWrap key={id} qid={id} missing={missingSet.has(id)}>
          {child}
        </MissingWrap>,
      );
      i += 1;
    }

    return out;
  }, [hasC2Q9, questions, missingSet, disabled, answers]);

  return (
    <div>
      {rendered
        ? rendered
        : (questions || []).map((q, idx) => {
            const id = String(q?.id || q?.key || `${idx}`);
            const missing = missingSet.has(id);
            const child = renderQuestion({ ...q, id });
            return (
              <MissingWrap key={id} qid={id} missing={missing}>
                {child}
              </MissingWrap>
            );
          })}
    </div>
  );
}
