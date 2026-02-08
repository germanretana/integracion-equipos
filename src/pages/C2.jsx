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

export default function C2() {
  const navigate = useNavigate();
  const { processSlug, peerId } = useParams();

  const [instructions, setInstructions] = React.useState("");
  const [peerName, setPeerName] = React.useState("Compañero");
  const [loading, setLoading] = React.useState(true);

  const [freeText, setFreeText] = React.useState("");
  const [savedAt, setSavedAt] = React.useState(null);
  const [submittedAt, setSubmittedAt] = React.useState(null);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [showError, setShowError] = React.useState(false);
  const textRef = React.useRef(null);

  React.useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [tpl, qs, entry] = await Promise.all([
          auth.fetch(`/api/app/${processSlug}/templates/c2`),
          auth.fetch(`/api/app/${processSlug}/questionnaires`),
          auth.fetch(`/api/app/${processSlug}/c2/${peerId}`)
        ]);

        if (!alive) return;

        setInstructions(tpl?.instructionsMd || "");

        const peer = qs?.c2?.find((p) => p.to.endsWith(`/c2/${peerId}`));
        setPeerName(peer?.title || "Compañero");

        setFreeText(entry?.draft?.freeText || "");
        setSavedAt(entry?.savedAt || null);
        setSubmittedAt(entry?.submittedAt || null);
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
    setSaving(true);
    setError("");
    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c2/${peerId}`, {
        method: "PUT",
        body: JSON.stringify({ draft: { freeText } })
      });
      setSavedAt(entry?.savedAt || null);
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }, [processSlug, peerId, freeText, submittedAt]);

  useDebouncedEffect(freeText, 600, doSave);

  async function onSubmit() {
    setError("");

    const missing = String(freeText || "").trim().length === 0;
    if (missing) {
      setShowError(true);
      textRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textRef.current?.focus();
      return;
    }

    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c2/${peerId}/submit`, {
        method: "POST"
      });
      setSubmittedAt(entry?.submittedAt || new Date().toISOString());
    } catch (e) {
      setError(e?.message || "No se pudo enviar.");
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <button className="admin-btn" onClick={() => navigate(`/app/${processSlug}/questionnaires`)}>
          ← Volver
        </button>

        <h1 className="h1">Retroalimentación para {peerName}</h1>

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
            <textarea
              ref={textRef}
              className={showError && String(freeText || "").trim() === "" ? "field-error" : ""}
              placeholder="Escriba aquí su retroalimentación…"
              value={freeText}
              disabled={!!submittedAt}
              onChange={(e) => {
                setFreeText(e.target.value);
                setShowError(false);
              }}
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

              <button className="admin-btn" type="button" onClick={onSubmit} disabled={!!submittedAt}>
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
