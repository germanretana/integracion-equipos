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

export default function C1() {
  const navigate = useNavigate();
  const { processSlug } = useParams();

  const session = auth.getSession();
  const participantName = session?.participant?.name || "—";
  const companyName = session?.process?.companyName || "";
  const myId = session?.participant?.id || "";

  const [tpl, setTpl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const [answers, setAnswers] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);
  const [submittedAt, setSubmittedAt] = React.useState(null);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [peers, setPeers] = React.useState([]);

  // submit validation feedback
  const [missingIds, setMissingIds] = React.useState([]);

  // UX: confirmación post-submit
  const [justSubmitted, setJustSubmitted] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [tplRes, entryRes, qs] = await Promise.all([
          auth.fetch(`/api/app/${processSlug}/templates/c1`),
          auth.fetch(`/api/app/${processSlug}/c1`),
          auth.fetch(`/api/app/${processSlug}/questionnaires`),
        ]);

        if (!alive) return;

        setTpl(tplRes || null);

        const draft = entryRes?.draft || {};
        setAnswers(
          draft?.answers && typeof draft.answers === "object"
            ? draft.answers
            : {},
        );
        setSavedAt(entryRes?.savedAt || null);
        setSubmittedAt(entryRes?.submittedAt || null);

        const peerList = (qs?.c2 || []).map((x) => {
          const id = String(x.to || "")
            .split("/")
            .pop();
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
    if (!tpl?.questions || tpl.questions.length === 0) return;

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
  }, [processSlug, answers, submittedAt, tpl?.questions]);

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

    // ===== Validate pairing_rows before submit (duplicates + self-pair) =====
    const pairingQuestions = (tpl?.questions || []).filter((q) => {
      const t = String(q?.type || "")
        .toLowerCase()
        .trim();
      return t === "pairing_rows" || t === "pairing_of_peers";
    });

    function normalizePair(a, b) {
      if (!a || !b) return null; // incompleto => no bloqueamos aquí (required lo maneja backend/template)
      const aa = String(a);
      const bb = String(b);
      if (aa === bb) return "__SELF__";
      return [aa, bb].sort().join("__");
    }

    for (const q of pairingQuestions) {
      const qid = String(q?.id || "");
      if (!qid) continue;

      const rows = Array.isArray(answers?.[qid]) ? answers[qid] : [];

      const keys = rows
        .map((r) => normalizePair(r?.leftId, r?.rightId))
        .filter(Boolean);

      if (keys.includes("__SELF__")) {
        setError(
          "Hay una sugerencia inválida: no se permite una persona con sí misma.",
        );
        return;
      }

      const onlyPairs = keys.filter((k) => k !== "__SELF__");
      const seen = new Set();
      let hasDup = false;
      for (const k of onlyPairs) {
        if (seen.has(k)) {
          hasDup = true;
          break;
        }
        seen.add(k);
      }
      if (hasDup) {
        setError(
          "Hay pares duplicados en las sugerencias (persona A con B cuenta igual que B con A). Corríjalos antes de enviar.",
        );
        return;
      }
    }
    // =====================================================================

    try {
      const entry = await auth.fetch(`/api/app/${processSlug}/c1/submit`, {
        method: "POST",
      });
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
        <div className="p-topbar">
          <div className="p-topbar-left">
            <button
              className="admin-btn"
              onClick={() => navigate(`/app/${processSlug}/questionnaires`)}
              type="button"
            >
              ← Volver
            </button>
          </div>

          <div className="p-topbar-center">
            Participante: <strong>{participantName}</strong>
          </div>

          <div className="p-topbar-right">
            <button className="admin-btn" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        <h1 className="h1">Retroalimentación Equipo {companyName}</h1>

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
                  setMissingIds([]); // al editar, limpiamos resaltado de submit previo
                  setAnswers(next);
                }}
                peers={peers}
                disabled={!!submittedAt}
                currentParticipantId={myId}
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
