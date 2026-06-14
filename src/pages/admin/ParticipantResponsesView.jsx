import React from "react";
import { Link, useParams } from "react-router-dom";
import "../../styles/questionnaires.css";
import Markdown from "../../components/Markdown";
import QuestionnaireRenderer from "../../components/QuestionnaireRenderer";
import { auth } from "../../services/auth";

function formatCR(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Costa_Rica",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Read-only admin view of a participant's questionnaire responses.
 * Reuses QuestionnaireRenderer with disabled=true, so the admin sees the
 * same layout the participant sees but cannot edit anything.
 *
 * `kind` is passed from the route ("c1" | "c2").
 */
export default function ParticipantResponsesView({ kind }) {
  const { processSlug, participantId, peerId } = useParams();

  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const url =
          kind === "c1"
            ? `/api/admin/processes/${processSlug}/participants/${participantId}/c1`
            : `/api/admin/processes/${processSlug}/participants/${participantId}/c2/${peerId}`;
        const payload = await auth.fetch(url);
        if (!alive) return;
        setData(payload);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudo cargar la respuesta.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [kind, processSlug, participantId, peerId]);

  const tpl = data?.template || null;
  const entry = data?.entry || null;
  const answers =
    entry?.draft?.answers && typeof entry.draft.answers === "object"
      ? entry.draft.answers
      : {};
  const questions = Array.isArray(tpl?.questions) ? tpl.questions : [];
  const instructions = tpl?.instructionsMd || "";

  const participantName = data?.participant?.name || "—";
  const peerName = data?.peer?.name || "";
  const peers = Array.isArray(data?.peers) ? data.peers : [];

  const heading =
    kind === "c1"
      ? `C1 — ${participantName}`
      : `C2 — ${participantName} → ${peerName}`;

  const statusText = entry?.submittedAt
    ? `Enviado: ${formatCR(entry.submittedAt)}`
    : entry?.savedAt
      ? `Borrador guardado: ${formatCR(entry.savedAt)}`
      : "Sin respuestas";

  return (
    <div className="page">
      <div className="page-inner">
        <div className="p-topbar">
          <div className="p-topbar-left">
            <Link
              className="admin-btn"
              to={`/admin/processes/${processSlug}?participant=${participantId}`}
            >
              ← Volver
            </Link>
          </div>

          <div className="p-topbar-center">
            Respuestas de: <strong>{participantName}</strong>
          </div>

          <div className="p-topbar-right">
            <span className="sub" style={{ margin: 0 }}>
              {statusText}
            </span>
          </div>
        </div>

        <h1 className="h1">{heading}</h1>

        {loading ? <p className="sub">Cargando…</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && !error ? (
          <>
            {instructions ? (
              <div className="section">
                <div className="section-body">
                  <Markdown text={instructions} />
                </div>
              </div>
            ) : null}

            {questions.length === 0 ? (
              <div className="section">
                <div className="section-body">
                  <p className="sub">No hay preguntas configuradas.</p>
                </div>
              </div>
            ) : (
              <div className="section">
                <div className="section-body">
                  <QuestionnaireRenderer
                    questions={questions}
                    answers={answers}
                    disabled={true}
                    peers={peers}
                    currentParticipantId={participantId}
                    currentPeerName={peerName}
                  />
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
