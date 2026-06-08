import React from "react";
import { Link, useParams } from "react-router-dom";
import "../../styles/questionnaires.css";
import "../../styles/report.css";
import ParticipantBrandBar from "../../components/ParticipantBrandBar";
import ReportView, { PairingBlock } from "../../components/report/ReportView";
import { auth } from "../../services/auth";
import { buildReportBlocks, aggregatePairingForFocal } from "../../lib/reportAggregation";

/**
 * Online preview of a C2 report (one per participant). Aggregates the feedback
 * the N-1 peers submitted ABOUT this focal participant, then appends the
 * pairing suggestions derived from the C1 questionnaires.
 */

// Replace the <peer> placeholder in question text with the focal name.
function replacePeerToken(blocks, name) {
  const sub = (s) => String(s || "").split("<peer>").join(name);
  return blocks.map((b) => {
    const nb = { ...b, questionText: sub(b.questionText) };
    if (b.text) nb.text = { ...b.text, questionText: sub(b.text.questionText) };
    return nb;
  });
}

export default function C2ReportPreview() {
  const { processSlug, participantId } = useParams();

  const [bundle, setBundle] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await auth.fetch(`/api/admin/processes/${processSlug}/reports`);
        if (!alive) return;
        setBundle(data);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudo cargar el reporte.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => (alive = false);
  }, [processSlug]);

  const participants = bundle?.participants || [];
  const nameById = React.useCallback(
    (id) => participants.find((p) => String(p.id) === String(id))?.name || String(id),
    [participants],
  );
  const focalName = nameById(participantId);

  const questions = bundle?.templates?.c2?.questions || [];
  const responses = React.useMemo(
    () =>
      (bundle?.c2Responses || [])
        .filter((r) => String(r.peerId) === String(participantId))
        .map((r) => r.answers),
    [bundle, participantId],
  );

  const blocks = React.useMemo(
    () => replacePeerToken(buildReportBlocks(questions, responses), focalName),
    [questions, responses, focalName],
  );

  // Pairing suggestions come from the C1 pairing question, across all C1s.
  const partners = React.useMemo(() => {
    const c1Questions = bundle?.templates?.c1?.questions || [];
    const pairingQ = c1Questions.find((q) => String(q?.type || "").trim() === "pairing_rows");
    if (!pairingQ) return [];
    const c1Answers = (bundle?.c1Responses || []).map((r) => r.answers);
    return aggregatePairingForFocal(c1Answers, String(pairingQ.id), participantId, nameById);
  }, [bundle, participantId, nameById]);

  const respCount = responses.length;

  return (
    <div className="page">
      <div className="page-inner">
        <div className="p-topbar">
          <div className="p-topbar-left">
            <Link className="admin-btn" to={`/admin/processes/${processSlug}`}>
              ← Volver
            </Link>
          </div>
          <div className="p-topbar-center">
            Reporte C2 de: <strong>{focalName}</strong>
          </div>
          <div className="p-topbar-right" />
        </div>

        {bundle ? <ParticipantBrandBar process={bundle.process} /> : null}

        <h1 className="h1">Retroalimentación para {focalName}</h1>

        {loading ? <p className="sub">Cargando…</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && !error ? (
          <>
            <p className="sub">
              Reporte individual · {respCount} compañero(s) dieron retroalimentación.
            </p>
            {questions.length === 0 ? (
              <div className="section">
                <div className="section-body">
                  <p className="sub">No hay preguntas configuradas en la plantilla C2.</p>
                </div>
              </div>
            ) : (
              <ReportView blocks={blocks}>
                <PairingBlock partners={partners} />
              </ReportView>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
