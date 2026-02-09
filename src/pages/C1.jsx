import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";
import Markdown from "../components/Markdown";
import { auth } from "../services/auth";

function useDebouncedEffect(value, delayMs, effect) {
  React.useEffect(() => {
    const t = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, effect]);
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const y = Math.trunc(x);
  if (y < min || y > max) return null;
  return y;
}

function isVisible(q, answers) {
  if (!q?.dependsOn) return true;
  const dep = q.dependsOn;
  const v = answers?.[dep.id];
  return v === dep.equals;
}

function countFilledStrings(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.filter((x) => String(x || "").trim()).length;
}

function validateQuestions(questions, answers) {
  const errors = {};
  for (const q of questions) {
    if (!q || q.type === "header") continue;
    if (!isVisible(q, answers)) continue;

    const min = q.minEntries ?? 0;

    const v = answers?.[q.id];

    if (q.type === "binary_yes_no") {
      if (min > 0 && !(v === "Sí" || v === "No")) errors[q.id] = "Requerido";
    }

    if (q.type === "rating_masc_5" || q.type === "rating_fem_5") {
      if (min > 0 && !String(v || "").trim()) errors[q.id] = "Requerido";
    }

    if (q.type === "text_area") {
      if (min > 0 && !String(v || "").trim()) errors[q.id] = "Requerido";
    }

    if (q.type === "input_list") {
      const filled = countFilledStrings(v);
      if (min > 0 && filled < min) errors[q.id] = `Mínimo ${min}`;
    }

    if (q.type === "value_0_4") {
      const vv = v && typeof v === "object" ? v.value : null;
      const ok = clampInt(vv, 0, 4) != null;
      if (min > 0 && !ok) errors[q.id] = "Requerido (0–4)";
    }

    if (q.type === "pairing_of_peers") {
      // opcional por defecto. si viene parcialmente, marcar error.
      if (v && typeof v === "object") {
        const leftOk = String(v.leftId || "").trim();
        const rightOk = String(v.rightId || "").trim();
        if ((leftOk && !rightOk) || (!leftOk && rightOk)) errors[q.id] = "Complete ambos";
        if (leftOk && rightOk && leftOk === rightOk) errors[q.id] = "No puede ser la misma persona";
      }
    }
  }

  return errors;
}

function Options({ value, options, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            className="admin-btn"
            onClick={() => onChange(opt)}
            style={{
              background: active ? "rgba(255,255,255,0.16)" : undefined,
              borderColor: active ? "rgba(255,255,255,0.30)" : undefined,
              fontWeight: active ? 900 : 700,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function InputList({ value, min, max, onChange, placeholder }) {
  const arr = Array.isArray(value) ? value.slice() : [];
  const rows = Math.max(min || 0, Math.min(Math.max(arr.length, 1), max || 10));

  while (arr.length < rows) arr.push("");

  function setAt(i, next) {
    const copy = arr.slice();
    copy[i] = next;
    onChange(copy);
  }

  function addRow() {
    if (arr.length >= (max || 10)) return;
    onChange(arr.concat([""]));
  }

  function removeRow(i) {
    const copy = arr.slice();
    copy.splice(i, 1);
    onChange(copy.length ? copy : [""]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {arr.slice(0, max || arr.length).map((x, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="admin-input"
            value={x}
            onChange={(e) => setAt(i, e.target.value)}
            placeholder={placeholder || `Respuesta ${i + 1}`}
          />
          {arr.length > 1 && (
            <button
              type="button"
              className="admin-btn"
              onClick={() => removeRow(i)}
              title="Quitar"
            >
              −
            </button>
          )}
        </div>
      ))}

      {(max == null || arr.length < max) && (
        <div>
          <button type="button" className="admin-btn" onClick={addRow}>
            + Agregar
          </button>
        </div>
      )}
    </div>
  );
}

export default function C1() {
  const navigate = useNavigate();
  const { processSlug } = useParams();

  const session = auth.getSession();
  const companyName = session?.process?.companyName || "";

  const [instructions, setInstructions] = React.useState("");
  const [questions, setQuestions] = React.useState([]);

  const [loading, setLoading] = React.useState(true);

  const [answers, setAnswers] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);
  const [submittedAt, setSubmittedAt] = React.useState(null);

  const [peers, setPeers] = React.useState([]); // para pairing
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [showError, setShowError] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState({});
  const firstErrorRef = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [tpl, entry, qs] = await Promise.all([
          auth.fetch(`/api/app/${processSlug}/templates/c1`),
          auth.fetch(`/api/app/${processSlug}/c1`),
          auth.fetch(`/api/app/${processSlug}/questionnaires`),
        ]);
        if (!alive) return;

        setInstructions(tpl?.instructionsMd || "");
        setQuestions(Array.isArray(tpl?.questions) ? tpl.questions : []);

        setAnswers(entry?.draft?.answers && typeof entry.draft.answers === "object" ? entry.draft.answers : {});
        setSavedAt(entry?.savedAt || null);
        setSubmittedAt(entry?.submittedAt || null);

        // peers para pairing: qs.c2 trae lista de "otros"
        const peerList = (qs?.c2 || []).map((x) => {
          const id = String(x.to || "").split("/c2/").pop();
          return { id, name: x.title || "Compañero" };
        });
        setPeers(peerList);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudo cargar el cuestionario.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => (alive = false);
  }, [processSlug]);

  const doSave = React.useCallback(async () => {
    if (submittedAt) return;
    setSaving(true);
    setError("");
    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c1`, {
        method: "PUT",
        body: JSON.stringify({ draft: { answers } }),
      });
      setSavedAt(entry?.savedAt || null);
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }, [processSlug, answers, submittedAt]);

  useDebouncedEffect(JSON.stringify(answers), 650, doSave);

  async function onSubmit() {
    setError("");

    const qs = questions.slice().sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
    const errs = validateQuestions(qs, answers);
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setShowError(true);
      // scroll a la primera pregunta con error
      setTimeout(() => {
        firstErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        firstErrorRef.current?.focus?.();
      }, 0);
      return;
    }

    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c1/submit`, { method: "POST" });
      setSubmittedAt(entry?.submittedAt || new Date().toISOString());
    } catch (e) {
      setError(e?.message || "No se pudo enviar.");
    }
  }

  function setAnswer(id, val) {
    setAnswers((prev) => ({ ...prev, [id]: val }));
    setShowError(false);
  }

  const ordered = questions
    .slice()
    .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));

  function registerFirstErrorRef(id) {
    return (el) => {
      if (!el) return;
      if (!showError) return;
      if (fieldErrors[id] && !firstErrorRef.current) firstErrorRef.current = el;
    };
  }

  return (
    <div className="page">
      <div className="page-inner">
        <button className="admin-btn" onClick={() => navigate(`/app/${processSlug}/questionnaires`)}>
          ← Volver
        </button>

        <h1 className="h1">Retroalimentación Equipo {companyName}</h1>

        {error ? <div className="error">{error}</div> : null}

        {!loading && instructions ? (
          <div className="section">
            <div className="section-body">
              <Markdown text={instructions} />
            </div>
          </div>
        ) : null}

        {!loading && ordered.length === 0 ? (
          <div className="section">
            <div className="section-body">
              <p className="sub">No hay preguntas configuradas para C1.</p>
            </div>
          </div>
        ) : null}

        {!loading && ordered.length > 0 ? (
          <div className="section">
            <div className="section-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {ordered.map((q) => {
                if (!q) return null;
                if (!isVisible(q, answers)) return null;

                const err = fieldErrors[q.id];
                const isReq = (q.minEntries ?? 0) > 0;

                // HEADER
                if (q.type === "header") {
                  return (
                    <div key={q.id} style={{ marginTop: 10 }}>
                      <h2 className="h2" style={{ margin: 0 }}>{q.item}</h2>
                    </div>
                  );
                }

                // Common wrapper
                return (
                  <div key={q.id} style={{ paddingTop: 2 }}>
                    {q.item ? (
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>
                        {q.item} {isReq ? <span style={{ opacity: 0.7 }}>*</span> : null}
                      </div>
                    ) : null}

                    {q.explanation ? (
                      <div className="sub" style={{ marginTop: -2, marginBottom: 8, opacity: 0.85 }}>
                        {q.explanation}
                      </div>
                    ) : null}

                    {/* rating masc/fem */}
                    {(q.type === "rating_masc_5" || q.type === "rating_fem_5") && (
                      <div ref={err ? registerFirstErrorRef(q.id) : null}>
                        <Options
                          value={answers[q.id] || ""}
                          options={q?.meta?.labels || []}
                          onChange={(v) => setAnswer(q.id, v)}
                        />
                      </div>
                    )}

                    {/* binary */}
                    {q.type === "binary_yes_no" && (
                      <div ref={err ? registerFirstErrorRef(q.id) : null}>
                        <Options value={answers[q.id] || ""} options={["Sí", "No"]} onChange={(v) => setAnswer(q.id, v)} />
                      </div>
                    )}

                    {/* text area */}
                    {q.type === "text_area" && (
                      <textarea
                        ref={err ? registerFirstErrorRef(q.id) : null}
                        className={showError && err ? "field-error" : ""}
                        placeholder="Escriba aquí…"
                        value={answers[q.id] || ""}
                        disabled={!!submittedAt}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    )}

                    {/* input list */}
                    {q.type === "input_list" && (
                      <div ref={err ? registerFirstErrorRef(q.id) : null}>
                        <InputList
                          value={answers[q.id]}
                          min={q.minEntries ?? 0}
                          max={q.maxEntries ?? 10}
                          onChange={(v) => setAnswer(q.id, v)}
                        />
                      </div>
                    )}

                    {/* value 0-4 + suggestion */}
                    {q.type === "value_0_4" && (
                      <div ref={err ? registerFirstErrorRef(q.id) : null}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 13, opacity: 0.85 }}>Valor (0–4):</label>
                          <select
                            className="admin-input"
                            style={{ width: 120 }}
                            value={
                              (answers[q.id] && typeof answers[q.id] === "object" ? answers[q.id].value : "") ?? ""
                            }
                            disabled={!!submittedAt}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : clampInt(e.target.value, 0, 4);
                              setAnswer(q.id, { ...(answers[q.id] || {}), value: v });
                            }}
                          >
                            <option value="">—</option>
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                          </select>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: 13, opacity: 0.85 }}>{q.explanation || "Sugerencias para mejorar:"}</label>
                          <textarea
                            style={{ marginTop: 6 }}
                            value={(answers[q.id] && typeof answers[q.id] === "object" ? answers[q.id].suggestion : "") || ""}
                            disabled={!!submittedAt}
                            onChange={(e) => setAnswer(q.id, { ...(answers[q.id] || {}), suggestion: e.target.value })}
                            placeholder="Opcional…"
                          />
                        </div>
                      </div>
                    )}

                    {/* pairing */}
                    {q.type === "pairing_of_peers" && (
                      <div ref={err ? registerFirstErrorRef(q.id) : null}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            className="admin-input"
                            style={{ width: 220 }}
                            value={(answers[q.id]?.leftId || "")}
                            disabled={!!submittedAt}
                            onChange={(e) => setAnswer(q.id, { ...(answers[q.id] || {}), leftId: e.target.value })}
                          >
                            <option value="">{q?.meta?.leftLabel || "Persona"}</option>
                            {peers.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>

                          <span style={{ opacity: 0.8, fontWeight: 800 }}>con</span>

                          <select
                            className="admin-input"
                            style={{ width: 220 }}
                            value={(answers[q.id]?.rightId || "")}
                            disabled={!!submittedAt}
                            onChange={(e) => setAnswer(q.id, { ...(answers[q.id] || {}), rightId: e.target.value })}
                          >
                            <option value="">{q?.meta?.rightLabel || "Con"}</option>
                            {peers.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {showError && err ? (
                      <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,120,120,0.95)" }}>
                        {err}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <div className="form-actions" style={{ marginTop: 6 }}>
                <span className="form-note">
                  {submittedAt
                    ? "Este cuestionario ya fue enviado y no se puede editar."
                    : saving
                    ? "Guardando…"
                    : savedAt
                    ? "Guardado."
                    : "—"}
                </span>

                <button className="admin-btn" type="button" onClick={onSubmit} disabled={!!submittedAt}>
                  Enviar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
