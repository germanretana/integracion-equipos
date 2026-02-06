import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "../styles/questionnaires.css";

const STORAGE_KEY = "itss_integracion_c1_v1";

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? n : parseInt(String(n), 10);
  if (!Number.isFinite(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function C1() {
  const navigate = useNavigate();

  const questions = useMemo(
    () => [
      {
        id: "c1_q1_rating",
        type: "rating",
        title: "Claridad de objetivos del equipo gerencial",
        meta: "0 = Malo, 4 = Excelente",
        required: true,
      },
      {
        id: "c1_q2_single",
        type: "single",
        title: "Efectividad de la comunicación interna del equipo",
        meta: "Seleccione una opción",
        required: true,
        options: ["Muy baja", "Baja", "Media", "Alta", "Muy alta"],
      },
      {
        id: "c1_q3_multi",
        type: "multi",
        title: "Fortalezas principales del equipo gerencial",
        meta: "Puede seleccionar varias",
        required: true,
        options: ["Estrategia", "Ejecución", "Comunicación", "Colaboración", "Toma de decisiones"],
      },
      {
        id: "c1_q4_text",
        type: "text",
        title: "¿Qué debería mantener el equipo gerencial?",
        meta: "Texto libre",
        required: true,
      },
      {
        id: "c1_q5_text",
        type: "text",
        title: "¿Qué debería mejorar el equipo gerencial?",
        meta: "Texto libre",
        required: true,
      },
    ],
    []
  );

  const [draft, setDraft] = useState(() => {
    const saved = loadState();
    return {
      answers: saved?.answers || {},
      submittedAt: saved?.submittedAt || null,
      lastSavedAt: saved?.lastSavedAt || null,
    };
  });

  const submitted = Boolean(draft.submittedAt);

  // Progressive save: persist on every change
  useEffect(() => {
    const next = { ...draft, lastSavedAt: new Date().toISOString() };
    // Write-through to localStorage (simple and robust for mock mode)
    saveState(next);
    // Avoid updating state in an effect loop; we only persist, not setDraft here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.answers, draft.submittedAt]);

  function setAnswer(id, value) {
    if (submitted) return;
    setDraft((prev) => ({
      ...prev,
      answers: { ...prev.answers, [id]: value },
    }));
  }

  function toggleMulti(id, option) {
    if (submitted) return;
    const cur = Array.isArray(draft.answers[id]) ? draft.answers[id] : [];
    const next = cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option];
    setAnswer(id, next);
  }

  function isAnswered(q) {
    const v = draft.answers[q.id];
    if (q.type === "rating") return v !== null && v !== undefined && v !== "";
    if (q.type === "single") return typeof v === "string" && v.trim().length > 0;
    if (q.type === "multi") return Array.isArray(v) && v.length > 0;
    if (q.type === "text") return typeof v === "string" && v.trim().length > 0;
    return false;
  }

  const requiredCount = useMemo(
    () => questions.filter((q) => q.required).length,
    [questions]
  );

  const answeredRequired = useMemo(() => {
    return questions.filter((q) => q.required && isAnswered(q)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.answers, questions]);

  const progressPct = useMemo(() => {
    if (requiredCount === 0) return 0;
    return Math.round((answeredRequired / requiredCount) * 100);
  }, [answeredRequired, requiredCount]);

  const canSubmit = answeredRequired === requiredCount && !submitted;

  const [error, setError] = useState("");

  function onSubmit() {
    if (submitted) return;

    const missing = questions.filter((q) => q.required && !isAnswered(q));
    if (missing.length > 0) {
      setError("Por favor complete todas las preguntas requeridas antes de enviar.");
      return;
    }

    setError("");
    const submittedAt = new Date().toISOString();
    setDraft((prev) => ({ ...prev, submittedAt }));
  }

  function onBack() {
    navigate("/app/questionnaires", { replace: false });
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="topbar">
          <div className="topbar-left">
            <img
              className="brand-logo"
              src="/brand/integracion-plateado.png"
              alt="Integración de Equipos Gerenciales"
            />
          </div>

          <div className="nav">
            <NavLink
              to="/app/questionnaires"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Cuestionarios
            </NavLink>
          </div>
        </div>

        <h1 className="h1">Retroalimentación del equipo (C1)</h1>
        <p className="sub">
          Cuestionario general sobre el equipo gerencial. Progreso: <b>{progressPct}%</b>
          {submitted ? (
            <>
              {" "}
              · <b>Enviado</b>
            </>
          ) : null}
        </p>

        <div className="section">
          <h2 className="section-title">Formulario</h2>
          <div className="section-body">
            <div className="form-grid">
              {questions.map((q) => (
                <div key={q.id} className="form-card">
                  <div className="field-top">
                    <div>
                      <p className="field-title">{q.title}</p>
                      <p className="field-meta">{q.meta}</p>
                    </div>
                    {q.required ? <span className="badge-req">Requerido</span> : null}
                  </div>

                  {q.type === "rating" ? (
                    <div className="rating">
                      {[0, 1, 2, 3, 4].map((n) => {
                        const cur = clampInt(draft.answers[q.id], 0, 4);
                        const active = cur === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            className={`rate-btn ${active ? "active" : ""}`}
                            onClick={() => setAnswer(q.id, n)}
                            disabled={submitted}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {q.type === "single" ? (
                    <div className="options">
                      {q.options.map((opt) => {
                        const checked = draft.answers[q.id] === opt;
                        return (
                          <label key={opt} className="opt">
                            <input
                              type="radio"
                              name={q.id}
                              value={opt}
                              checked={checked}
                              onChange={() => setAnswer(q.id, opt)}
                              disabled={submitted}
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {q.type === "multi" ? (
                    <div className="options">
                      {q.options.map((opt) => {
                        const cur = Array.isArray(draft.answers[q.id]) ? draft.answers[q.id] : [];
                        const checked = cur.includes(opt);
                        return (
                          <label key={opt} className="opt">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMulti(q.id, opt)}
                              disabled={submitted}
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {q.type === "text" ? (
                    <textarea
                      className="textarea"
                      value={draft.answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Escriba aquí…"
                      disabled={submitted}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="actions">
              <button type="button" className="btn" onClick={onBack}>
                Volver
              </button>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <p className="inline-note" style={{ margin: 0 }}>
                  Guardado automático (mock)
                </p>
                <button type="button" className="btn primary" onClick={onSubmit} disabled={!canSubmit}>
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="footer-help">
          Si tiene alguna duda o consulta, escriba a{" "}
          <a href="mailto:integracion@germanretana.com">integracion@germanretana.com</a>
        </p>
      </div>
    </div>
  );
}
