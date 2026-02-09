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

function qText(q) {
  // soporta seeds con Item/item/text/title/label
  return (
    q?.text ??
    q?.item ??
    q?.Item ??
    q?.title ??
    q?.label ??
    ""
  );
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

function BtnChoice({ active, disabled, onClick, children, title }) {
  return (
    <button
      type="button"
      className="admin-btn"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        opacity: disabled ? 0.6 : 1,
        border: active ? "1px solid rgba(255,255,255,0.40)" : undefined,
        background: active ? "rgba(255,255,255,0.14)" : undefined,
      }}
    >
      {children}
    </button>
  );
}

export default function QuestionnaireRenderer({
  questions = [],
  answers = {},
  onChange,
  peers = [],
  disabled = false,

  // para select_peer (C2)
  currentPeerId = "",
  currentPeerName = "",
}) {
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
            >
              {feminine ? o.labelF : o.labelM}
            </BtnChoice>
          ))}
        </ButtonsRow>
      </DefaultFieldWrap>
    );
  }

  function renderValue04(q) {
    const cur = answers?.[q.id] || {};
    const val = cur && typeof cur === "object" ? cur.value : null;
    const sug = cur && typeof cur === "object" ? String(cur.suggestion || "") : "";

    const valNum = Number.isFinite(val) ? val : null;

    return (
      <DefaultFieldWrap
        title={<Html html={qText(q)} />}
        requiredHint={helpText(q.minEntries, q.maxEntries)}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
              Valor (0..4)
            </div>
            <input
              className="admin-input"
              style={{ width: 160 }}
              disabled={disabled}
              inputMode="numeric"
              value={valNum == null ? "" : String(valNum)}
              placeholder="0 a 4"
              onChange={(e) => {
                const nextVal = e.target.value === "" ? null : clampInt(e.target.value, 0, 4);
                setAnswer(q.id, { value: nextVal, suggestion: sug });
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              0 Insatisfactorio · 1 Regular · 2 Bueno · 3 Muy Bueno · 4 Excelente
            </div>
          </div>

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
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="admin-input"
            style={{ width: 160 }}
            disabled={disabled}
            inputMode="numeric"
            value={curNum == null ? "" : String(curNum)}
            placeholder="0 a 10"
            onChange={(e) => {
              const nextVal = e.target.value === "" ? null : clampInt(e.target.value, 0, 10);
              setAnswer(q.id, nextVal);
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Escala 0..10 (se reporta promedio).
          </div>
        </div>
      </DefaultFieldWrap>
    );
  }

  function renderSelectPeer(q) {
    // Para C2: ya estás en un peerId fijo. Lo mostramos como bloque informativo.
    const name = currentPeerName || "Compañero";
    return (
      <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
          <Html html={qText(q) || "Para:"} />
        </div>
        <div style={{ fontWeight: 900 }}>{name}</div>
      </div>
    );
  }

  function renderPairingRows(q) {
    const rows = Number.isFinite(q.rows) ? q.rows : 3;
    const cur = ensureArrayLen(answers?.[q.id], rows).map((x) => {
      const o = x && typeof x === "object" ? x : {};
      return { leftId: String(o.leftId || ""), rightId: String(o.rightId || "") };
    });

    const options = peers || [];

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

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Nota: lo haremos dinámico y con validaciones en un bloque posterior.
        </div>
      </DefaultFieldWrap>
    );
  }

  function renderQuestion(q) {
    const type = String(q?.type || "").toLowerCase();

    if (type === "header") return renderHeader(q);
    if (type === "text_area") return renderTextArea(q);
    if (type === "input_list") return renderInputList(q);
    if (type === "binary_yes_no") return renderBinaryYesNo(q);
    if (type === "rating_masc_5") return renderRating5(q, false);
    if (type === "rating_fem_5") return renderRating5(q, true);

    // alias: value_0_4 vs valor_0_4
    if (type === "value_0_4" || type === "valor_0_4") return renderValue04(q);

    // evaluation 0..10
    if (type === "evaluation_0_10") return renderEvaluation010(q);

    // C2 q0 (Para:) mientras exista en seeds
    if (type === "select_peer") return renderSelectPeer(q);

    // Pairings (aliases)
    if (type === "pairing_rows" || type === "pairing_of_peers") return renderPairingRows(q);

    return (
      <div style={{ marginTop: 14, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ fontWeight: 800 }}>
          Tipo no soportado: <code>{type || "?"}</code>
        </div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          <Html html={qText(q)} />
        </div>
      </div>
    );
  }

  return <div>{questions.map((q) => <div key={q.id || Math.random()}>{renderQuestion(q)}</div>)}</div>;
}
