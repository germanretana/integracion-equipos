import React from "react";
import { Link, useParams } from "react-router-dom";
import "../../styles/questionnaires.css";
import "../../styles/report.css";
import ParticipantBrandBar from "../../components/ParticipantBrandBar";
import ReportView from "../../components/report/ReportView";
import { auth } from "../../services/auth";
import { buildReportBlocks } from "../../lib/reportAggregation";
import { sortGridItemsByAvg } from "../../lib/reportRender";

/**
 * Online preview of the C1 report (one per process). Aggregates every
 * submitted C1 response and renders it on the white "paper" surface that the
 * Word export will mirror. Reuses the participant brand header.
 */
export default function C1ReportPreview() {
  const { processSlug } = useParams();

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

  const questions = bundle?.templates?.c1?.questions || [];
  const responses = React.useMemo(
    () => (bundle?.c1Responses || []).map((r) => r.answers),
    [bundle],
  );
  const blocks = React.useMemo(
    () => sortGridItemsByAvg(buildReportBlocks(questions, responses)),
    [questions, responses],
  );

  const companyName = bundle?.process?.companyName || "";
  const respCount = responses.length;
  const partCount = bundle?.participants?.length || 0;

  return (
    <div className="page">
      <div className="page-inner">
        <div className="p-topbar">
          <div className="p-topbar-left">
            <Link className="admin-btn" to={`/admin/processes/${processSlug}`}>
              ← Volver
            </Link>
          </div>
          <div className="p-topbar-center">Reporte C1 (equipo)</div>
          <div className="p-topbar-right" />
        </div>

        {bundle ? <ParticipantBrandBar process={bundle.process} /> : null}

        <h1 className="h1">Retroalimentación Equipo {companyName}</h1>

        {loading ? <p className="sub">Cargando…</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && !error ? (
          <>
            <p className="sub">
              Reporte consolidado · {respCount} de {partCount} participantes
              respondieron.
            </p>
            {questions.length === 0 ? (
              <div className="section">
                <div className="section-body">
                  <p className="sub">No hay preguntas configuradas en la plantilla C1.</p>
                </div>
              </div>
            ) : (
              <ReportView blocks={blocks} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
