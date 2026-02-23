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
  const t = String(typeRaw || "")
    .toLowerCase()
    .trim();

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

  if (t === "value_0_4_grid") return "value_0_4_grid";

  return t;
}

function helpText(minEntries) {
  const min = Number.isFinite(minEntries) ? minEntries : null;

  // Si no hay mínimo requerido, no mostramos hint.
  if (min == null || min <= 0) return "";

  if (min === 1) return "Requerida: 1";
  return `Requeridas: ${min}`;
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
        ...(active ? { border: "1px solid rgba(255,255,255,0.50)" } : null),
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
  const p = palette[value] || {
    bg: "rgba(255,255,255,0.14)",
    bd: "rgba(255,255,255,0.40)",
  };
  return { background: p.bg, border: `1px solid ${p.bd}` };
}

export default function QuestionnaireRenderer({
  questions = [],
  answers = {},
  onChange,
  peers = [],
  disabled = false,

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
            style={val === "yes" ? ratingActiveStyle(4) : undefined}
          >
            Sí
          </BtnChoice>

          <BtnChoice
            disabled={disabled}
            active={val === "no"}
            onClick={() => setAnswer(q.id, "no")}
            style={val === "no" ? ratingActiveStyle(0) : undefined}
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
              style={
                curNum === o.value ? ratingActiveStyle(o.value) : undefined
              }
            >
              {feminine ? o.labelF : o.labelM}
            </BtnChoice>
          ))}
        </ButtonsRow>
      </DefaultFieldWrap>
    );
  }

  // Generic value_0_4 grid (declarative block)
  function renderValue04Grid(q) {
    const items = Array.isArray(q.items) ? q.items : [];
    const meta = q?.meta && typeof q.meta === "object" ? q.meta : {};
    const columns = Array.isArray(meta.columns)
      ? meta.columns
      : ["label", "value", "suggestion"];

    const hasSuggestion = columns.includes("suggestion");
    const layout =
      String(meta.layout || "").toLowerCase() ||
      (hasSuggestion ? "stack" : "cards");

    function autoGrow(el) {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }

    return (
      <div className="q-grid-wrap">
        {qText(q) ? (
          <div className="q-grid-header">
            <Html html={qText(q)} />
          </div>
        ) : null}

        <div
          className={
            "q-grid " + (layout === "cards" ? "q-grid--cards" : "q-grid--stack")
          }
        >
          {items.map((it) => {
            const id = String(it.id);
            const curRaw = answers?.[id];
            const cur = curRaw && typeof curRaw === "object" ? curRaw : {};
            const valNum = Number.isFinite(cur.value) ? cur.value : null;
            const sug = String(cur.suggestion || "");
            const missing = missingSet.has(id);

            return (
              <div
                key={id}
                className={
                  "q-grid-row " +
                  (hasSuggestion ? "q-grid-row--3" : "q-grid-row--2") +
                  (missing ? " q-grid-row--missing" : "")
                }
                data-qid={id}
              >
                <div className="q-grid-label">
                  <Html html={it.text || it.item || ""} />
                </div>

                <div className="q-grid-control">
                  <input
                    className="admin-input"
                    disabled={disabled}
                    inputMode="numeric"
                    value={valNum == null ? "" : String(valNum)}
                    placeholder="0 a 4"
                    onChange={(e) => {
                      const nextVal =
                        e.target.value === ""
                          ? null
                          : clampInt(e.target.value, 0, 4);
                      setAnswer(
                        id,
                        hasSuggestion
                          ? { value: nextVal, suggestion: sug }
                          : { value: nextVal },
                      );
                    }}
                  />
                </div>

                {hasSuggestion ? (
                  <div className="q-grid-suggestion">
                    <textarea
                      disabled={disabled}
                      value={sug}
                      rows={1}
                      placeholder="Sugerencias para mejorar (opcional)"
                      onInput={(e) => autoGrow(e.currentTarget)}
                      onChange={(e) =>
                        setAnswer(id, {
                          value: valNum,
                          suggestion: e.target.value,
                        })
                      }
                      ref={(el) => {
                        if (el) autoGrow(el);
                      }}
                    />
                  </div>
                ) : null}

                {missing ? (
                  <div
                    className="q-grid-help"
                    style={{ color: "#ff668f", opacity: 1 }}
                  >
                    Falta completar esta pregunta
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
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
    const sug =
      cur && typeof cur === "object" ? String(cur.suggestion || "") : "";

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
                0 Insatisfactorio · 1 Regular · 2 Bueno · 3 Muy Bueno · 4
                Excelente
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
      return {
        leftId: String(o.leftId || ""),
        rightId: String(o.rightId || ""),
      };
    });

    const options = (peers || []).filter(
      (p) => String(p?.id || "") !== String(currentParticipantId || ""),
    );

    // ===== DUPLICATE + SELF-PAIR DETECTION (order-independent) =====
    function normalizePair(a, b) {
      if (!a || !b) return null;
      const aa = String(a);
      const bb = String(b);
      // self-pair => invalid (we'll flag separately; don't include in duplicate keys)
      if (aa && bb && aa === bb) return "__SELF__";
      return [aa, bb].sort().join("__");
    }

    const pairKeys = cur
      .map((r) => normalizePair(r.leftId, r.rightId))
      .filter((k) => k && k !== "__SELF__");

    const duplicates = new Set(
      pairKeys.filter((key, idx) => pairKeys.indexOf(key) !== idx),
    );
    // =============================================================

    return (
      <DefaultFieldWrap
        title={qText(q) ? <Html html={qText(q)} /> : null}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cur.map((row, idx) => {
            const left = String(row.leftId || "");
            const right = String(row.rightId || "");

            const pairKey = normalizePair(left, right);
            const isSelfPair = left && right && left === right;
            const isDuplicate =
              !isSelfPair && pairKey && duplicates.has(pairKey);

            const showWarning = isSelfPair || isDuplicate;

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderRadius: 10,
                  padding: showWarning ? 6 : 0,
                  border: showWarning
                    ? "1px solid rgba(255,102,143,0.85)"
                    : "1px solid transparent",
                  background: showWarning
                    ? "rgba(255,102,143,0.10)"
                    : "transparent",
                }}
              >
                <select
                  className="admin-input"
                  disabled={disabled}
                  style={{
                    width: 260,
                    color: left ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.45)",
                  }}
                  value={left}
                  onChange={(e) => {
                    const next = cur.slice();
                    next[idx] = { ...next[idx], leftId: e.target.value };
                    setAnswer(q.id, next);
                  }}
                >
                  <option value="">Persona…</option>
                  {options.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      // No permitir A-A desde UI
                      disabled={right && String(p.id) === String(right)}
                    >
                      {p.name}
                    </option>
                  ))}
                </select>

                <span style={{ opacity: 0.75 }}>con</span>

                <select
                  className="admin-input"
                  disabled={disabled}
                  style={{
                    width: 260,
                    color: right ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.45)",
                  }}
                  value={right}
                  onChange={(e) => {
                    const next = cur.slice();
                    next[idx] = { ...next[idx], rightId: e.target.value };
                    setAnswer(q.id, next);
                  }}
                >
                  <option value="">Persona…</option>
                  {options.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      // No permitir A-A desde UI
                      disabled={left && String(p.id) === String(left)}
                    >
                      {p.name}
                    </option>
                  ))}
                </select>

                {isSelfPair ? (
                  <div
                    style={{ fontSize: 12, color: "#ff668f", width: "100%" }}
                  >
                    No se permite seleccionar la misma persona con sí misma.
                  </div>
                ) : isDuplicate ? (
                  <div
                    style={{ fontSize: 12, color: "#ff668f", width: "100%" }}
                  >
                    Este par ya fue seleccionado (el orden no importa).
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }} />
      </DefaultFieldWrap>
    );
  }

  function shouldRenderQuestion(q, answers) {
    if (!q?.dependsOn || typeof q.dependsOn !== "object") return true;

    const { id, equals } = q.dependsOn;
    if (!id) return true;

    const val = answers?.[id];

    // normalizamos yes/no
    if (val === "yes") {
      return equals === "yes" || equals === "Sí" || equals === true;
    }

    if (val === "no") {
      return equals === "no" || equals === "No" || equals === false;
    }

    return val === equals;
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
    if (type === "value_0_4_grid") return renderValue04Grid(q);
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

  return (
    <div>
      {(questions || [])
        .filter((q) => shouldRenderQuestion(q, answers))
        .map((q, idx) => {
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
