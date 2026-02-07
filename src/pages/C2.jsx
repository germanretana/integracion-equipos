import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? n : parseInt(String(n), 10);
  if (!Number.isFinite(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function titleFromSlug(slug) {
  if (!slug) return "Compañero";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveJson(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

export default function C2() {
  const { peer } = useParams();
  const navigate = useNavigate();
  const fieldRefs = useRef({});

  const peerName = useMemo(() => titleFromSlug(peer), [peer]);
  const storageKey = useMemo(() => `itss_integracion_c2_${peer}_v1`, [peer]);

  const questions = useMemo(
    () => [
      {
        id: "c2_q1_rating",
        type: "rating",
        title: "Colaboración con el equipo",
        meta: "0 = Malo, 4 = Excelente",
        required: true,
      },
      {
        id: "c2_q2_rating",
        type: "rating",
        title: "Comunicación",
        meta: "0 = Malo, 4 = Excelente",
        required: true,
      },
      {
        id: "c2_q3_single",
        type: "single",
        title: "Nivel de confianza",
        meta: "Seleccione una opción",
        required: true,
        options: ["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"],
      },
      {
        id: "c2_q4_text",
        type: "text",
        title: "Fortalezas principales",
        meta: "Texto libre",
        required: true,
      },
      {
        id: "c2_q5_text",
        type: "text",
        title: "Oportunidades de mejora",
        meta: "Texto libre",
        required: true,
      },
    ],
    []
  );

  const [draft, setDraft] = useState(() => {
    const saved = loadJson(storageKey);
    return {
      answers: saved?.answers || {},
      submittedAt: saved?.submittedAt || null,
    };
  });

  const submitted = Boolean(draft.submittedAt);

  useEffect(() => {
    saveJson(storageKey, { ...draft, lastSavedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.answers, draft.submittedAt, storageKey]);

  function setAnswer(id, value) {
    if (submitted) return;
    setDraft((prev) => ({
      ...prev,
      answers: { ...prev.answers, [id]: value },
    }));
  }

  function isAnswered(q) {
    const v = draft.answers[q.id];
    if (q.type === "rating") return v !== null && v !== undefined && v !== "";
    if (q.type === "single") return typeof v === "string" && v.trim().length > 0;
    if (q.type === "text") return typeof v === "string" && v.trim().length > 0;
    return false;
  }

  const requiredCount = useMemo(() => questions.filter((q) => q.required).length, [questions]);

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
  const [missingIds, setMissingIds] = useState(new Set());

  function scrollToFirstMissing(ids) {
    if (!ids || ids.length === 0) return;
    const first = ids[0];
    const el = fieldRefs.current[first];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function onSubmit() {
    if (submitted) return;

    const missing = questions.filter((q) => q.required && !isAnswered(q)).map((q) => q.id);

    if (missing.length > 0) {
      setError("Por favor complete los campos resaltados antes de enviar.");
      setMissingIds(new Set(missing));
      scrollToFirstMissing(missing);
      return;
    }

    setError("");
    setMissingIds(new Set());
    setDraft((prev) => ({ ...prev, submittedAt: new Date().toISOString() }));
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
              className="brand-logo brand-logo--lg"
              src="/brand/integracion-plateado.png"
              alt="Integración de Equipos Gerenciales"
            />
          </div>

          <div className="nav">
            <NavLink to="/app/questionnaires" end className={() => "active"}>
              Cuestionarios
            </NavLink>
          </div>
        </div>

        <h1 className="h1">Retroalimentación a compañeros (C2)</h1>
        <p className="sub">
          Para: <b>{peerName}</b> · Progreso: <b>{progressPct}%</b>
          {submitted ? (
            <>
              {" "}
              · <b>Enviado</b>
            </>
          ) : null}
        </p>

        {error ? <div className="error">{error}</div> : null}

        <div className="section">
          <h2 className="section-title">Formulario</h2>
          <div className="section-body">
            <div className="form-grid">
              {questions.map((q) => {
                const missing = missingIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    className={`form-card ${missing ? "missing" : ""}`}
                    ref={(el) => {
                      fieldRefs.current[q.id] = el;
                    }}
                  >
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

                    {q.type === "text" ? (
                      <textarea
                        className={`textarea ${missing ? "missing" : ""}`}
                        value={draft.answers[q.id] || ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder="Escriba aquí…"
                        disabled={submitted}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

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
