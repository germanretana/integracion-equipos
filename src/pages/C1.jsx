import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";
import Markdown from "../components/Markdown";
import { auth } from "../services/auth";
import DynamicQuestionnaire, { validateQuestionnaire } from "../components/DynamicQuestionnaire";

function useDebouncedEffect(value, delayMs, effect) {
  React.useEffect(() => {
    const t = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, effect]);
}

export default function C1() {
  const navigate = useNavigate();
  const { processSlug } = useParams();

  const session = auth.getSession();
  const companyName = session?.process?.companyName || "";

  const [tpl, setTpl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const [answers, setAnswers] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);
  const [submittedAt, setSubmittedAt] = React.useState(null);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  // Para pairing_rows (C1 q10)
  const [peerOptions, setPeerOptions] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [tplRes, entryRes, qsRes] = await Promise.all([
          auth.fetch(`/api/app/${processSlug}/templates/c1`),
          auth.fetch(`/api/app/${processSlug}/c1`),
          auth.fetch(`/api/app/${processSlug}/questionnaires`),
        ]);

        if (!alive) return;

        setTpl(tplRes || null);

        const draft = entryRes?.draft || {};
        setAnswers(draft?.answers && typeof draft.answers === "object" ? draft.answers : {});
        setSavedAt(entryRes?.savedAt || null);
        setSubmittedAt(entryRes?.submittedAt || null);

        // peer options from questionnaires.c2
        const peers = Array.isArray(qsRes?.c2) ? qsRes.c2 : [];
        const opts = peers.map((p) => {
          const to = String(p?.to || "");
          const peerId = to.split("/c2/")[1] || "";
          return { id: peerId, name: p?.title || peerId };
        }).filter((x) => x.id);

        setPeerOptions(opts);
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
    if (!tpl?.questions?.length) return;

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
  }, [processSlug, answers, submittedAt, tpl]);

  useDebouncedEffect(JSON.stringify(answers), 700, doSave);

  async function onSubmit() {
    setError("");

    const questions = tpl?.questions || [];
    const v = validateQuestionnaire(questions, answers);

    if (!v.ok) {
      setShowErrors(true);
      // Scroll a la primera con error
      const firstId = Object.keys(v.errors)[0];
      if (firstId) {
        const el = document.querySelector(`[data-qid="${firstId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c1/submit`, { method: "POST" });
      setSubmittedAt(entry?.submittedAt || new Date().toISOString());
    } catch (e) {
      setError(e?.message || "No se pudo enviar.");
    }
  }

  const instructions = tpl?.instructionsMd || "";
  const questions = tpl?.questions || [];

  return (
    <div className="page">
      <div className="page-inner">
        <button
          className="admin-btn"
          onClick={() => navigate(`/app/${processSlug}/questionnaires`)}
        >
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

        <div className="section">
          <div className="section-body">
            {!loading && questions.length === 0 ? (
              <p className="sub">No hay preguntas configuradas.</p>
            ) : (
              <div>
                {/* Wrapper para permitir scroll al error */}
                <div>
                  {questions.map((q) => (
                    <div key={q.id} data-qid={q.id}>
                      {/* el renderer interno maneja showIf; esto solo crea anchors */}
                    </div>
                  ))}
                </div>

                <DynamicQuestionnaire
                  questions={questions}
                  answers={answers}
                  setAnswers={setAnswers}
                  disabled={!!submittedAt}
                  peerOptions={peerOptions}
                />

                {showErrors ? (
                  <div style={{ marginTop: 14, fontSize: 13, color: "#b91c1c" }}>
                    Revise los campos marcados como requeridos antes de enviar.
                  </div>
                ) : null}
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 18 }}>
              <span className="form-note">
                {submittedAt
                  ? "Este cuestionario ya fue enviado y no se puede editar."
                  : saving
                    ? "Guardando…"
                    : savedAt
                      ? "Guardado."
                      : "—"}
              </span>

              <button
                className="admin-btn"
                type="button"
                onClick={onSubmit}
                disabled={!!submittedAt || loading || questions.length === 0}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
