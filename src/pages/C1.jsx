import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";
import Markdown from "../components/Markdown";
import { auth } from "../services/auth";

export default function C1() {
  const navigate = useNavigate();
  const { processSlug } = useParams();

  const session = auth.getSession();
  const companyName = session?.process?.companyName || "";

  const [instructions, setInstructions] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const tpl = await auth.fetch(`/api/app/${processSlug}/templates/c1`);
        if (!alive) return;
        setInstructions(tpl?.instructionsMd || "");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => (alive = false);
  }, [processSlug]);

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
          Retroalimentación Equipo {companyName}
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
            <textarea placeholder="Escriba aquí sus comentarios…" />
          </div>
        </div>
      </div>
    </div>
  );
}
