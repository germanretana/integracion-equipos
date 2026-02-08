import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";
import Markdown from "../components/Markdown";
import { auth } from "../services/auth";

export default function C2() {
  const navigate = useNavigate();
  const { processSlug, peerId } = useParams();

  const [instructions, setInstructions] = React.useState("");
  const [peerName, setPeerName] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [tpl, qs] = await Promise.all([
          auth.fetch(`/api/app/${processSlug}/templates/c2`),
          auth.fetch(`/api/app/${processSlug}/questionnaires`)
        ]);

        if (!alive) return;

        setInstructions(tpl?.instructionsMd || "");

        const peer = qs?.c2?.find(
          (p) => p.to.endsWith(`/c2/${peerId}`)
        );
        setPeerName(peer?.title || "Compañero");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [processSlug, peerId]);

  return (
    <div className="page">
      <div className="page-inner">
        <button
          className="admin-btn"
          onClick={() => navigate(`/app/${processSlug}/questionnaires`)}
        >
          ← Volver
        </button>

        {/* Header dinámico */}
        <h1 className="h1">
          Retroalimentación para {peerName}
        </h1>

        {!loading && instructions && (
          <div className="section">
            <div className="section-body">
              <Markdown text={instructions} />
            </div>
          </div>
        )}

        <div className="section">
          <div className="section-body">
            <textarea placeholder="Escriba aquí su retroalimentación…" />
          </div>
        </div>
      </div>
    </div>
  );
}
