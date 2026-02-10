import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";
import Markdown from "../components/Markdown";
import QuestionnaireRenderer from "../components/QuestionnaireRenderer";
import { auth } from "../services/auth";

function useDebouncedEffect(value, delayMs, effect) {
  React.useEffect(() => {
    const t = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, effect]);
}

export default function C2() {
  const navigate = useNavigate();
  const { processSlug, peerId } = useParams();

  const [tpl, setTpl] = React.useState(null);
  const [peerName, setPeerName] = React.useState("Compañero");
  const [loading, setLoading] = React.useState(true);

  const [answers, setAnswers] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);
  const [submittedAt, setSubmittedAt] = React.useState(null);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [missingIds, setMissingIds] = React.useState([]);

  // UX: confirmación post-submit
  const [justSubmitted, setJustSubmitted] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [tplRes, qs, entryRes] = await Promise.all([
          auth.fetch(`/api/app/${processSlug}/templates/c2`),
          auth.fetch(`/api/app/${processSlug}/questionnaires`),
          auth.fetch(`/api/app/${processSlug}/c2/${peerId}`),
        ]);

        if (!alive) return;

        setTpl(tplRes || null);

        const peer = (qs?.c2 || []).find((p) =>
          String(p.to || "").endsWith(`/c2/${peerId}`),
        );
        setPeerName(peer?.title || "Compañero");

        const draft = entryRes?.draft || {};
        setAnswers(
          draft?.answers && typeof draft.answers === "object" ? draft.answers : {},
        );
        setSavedAt(entryRes?.savedAt || null);
        setSubmittedAt(entryRes?.submittedAt || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudo cargar el cuestionario.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [processSlug, peerId]);

  const doSave = React.useCallback(async () => {
    if (submittedAt) return;
    if (!tpl?.questions || tpl.questions.length === 0) return;

    setSaving(true);
    setError("");
    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c2/${peerId}`, {
        method: "PUT",
        body: JSON.stringify({ draft: { answers } }),
      });
      setSavedAt(entry?.savedAt || null);
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }, [processSlug, peerId, answers, submittedAt, tpl?.questions]);

  useDebouncedEffect(answers, 600, doSave);

  function scrollToFirstMissing(ids) {
    const first = (ids || [])[0];
    if (!first) return;
    setTimeout(() => {
      const el = document.querySelector(
        `[data-qid="${CSS.escape(String(first))}"]`,
      );
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  async function onSubmit() {
    setError("");
    setMissingIds([]);
    try {
      const entry = await auth.fetch(
        `/api/app/${processSlug}/c2/${peerId}/submit`,
        { method: "POST" },
      );
      setSubmittedAt(entry?.submittedAt || new Date().toISOString());

      // UX: confirmación + redirect
      setJustSubmitted(true);
      setTimeout(() => {
        navigate(`/app/${processSlug}/questionnaires`, { replace: true });
      }, 900);
    } catch (e) {
      const ids = e?.data?.missingIds;
      if (Array.isArray(ids) && ids.length > 0) {
        setMissingIds(ids);
        scrollToFirstMissing(ids);
      }
      setError(e?.message || "No se pudo enviar.");
    }
  }

  function onLogout() {
    auth.logoutParticipant();
    navigate("/", { replace: true });
  }

  const instructions = tpl?.instructionsMd || "";
  const questions = Array.isArray(tpl?.questions) ? tpl.questions : [];

  return (
    <div className="page">
      <div className="page-inner">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <button
            className="admin-btn"
            onClick={() => navigate(`/app/${processSlug}/questionnaires`)}
            type="button"
          >
            ← Volver
          </button>

          <button className="admin-btn" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>

        <h1 className="h1">Retroalimentación para {peerName}</h1>

        {justSubmitted ? (
          <div className="section">
            <div className="section-body">
              <div className="pill pill-ok" style={{ display: "inline-flex" }}>
                ¡Enviado! Redirigiendo a la lista…
              </div>
            </div>
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}

        {!loading && instructions ? (
          <div className="section">
            <div className="section-body">
              <Markdown text={instructions} />
            </div>
          </div>
        ) : null}

        {!loading && questions.length === 0 ? (
          <div className="section">
            <div className="section-body">
              <p className="sub">No hay preguntas configuradas.</p>
            </div>
          </div>
        ) : null}

        {!loading && questions.length > 0 ? (
          <div className="section">
            <div className="section-body">
              <QuestionnaireRenderer
                questions={questions}
                answers={answers}
                onChange={(next) => {
                  setMissingIds([]);
                  setAnswers(next);
                }}
                disabled={!!submittedAt}
                currentPeerId={peerId}
                currentPeerName={peerName}
                missingIds={missingIds}
              />

              <div className="form-actions">
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
                  disabled={!!submittedAt}
                >
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
