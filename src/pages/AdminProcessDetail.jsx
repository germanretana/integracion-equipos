import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/admin.css";
import "../styles/questionnaires.css";
import { adminFetch } from "../services/admin";

export default function AdminProcessDetail() {
  const { processSlug } = useParams();
  const [process, setProcess] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await adminFetch(`/api/admin/processes/${processSlug}`);
        setProcess(data);
      } catch (e) {
        setError(e?.message || "No se pudo cargar el proceso.");
      }
    }
    load();
  }, [processSlug]);

  if (error) {
    return (
      <div className="page">
        <div className="admin-wrap">
          <div className="error">{error}</div>
          <Link className="admin-btn" to="/admin/processes" style={{ marginTop: 12, display: "inline-block" }}>
            Volver a procesos
          </Link>
        </div>
      </div>
    );
  }

  if (!process) {
    return (
      <div className="page">
        <div className="admin-wrap">
          <p className="admin-note">Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="admin-wrap">
        <div className="admin-top">
          <Link className="admin-btn" to="/admin/processes">
            ← Procesos
          </Link>
        </div>

        <h1 className="h1">
          {process.companyName} — {process.processName}
        </h1>

        <p className="sub">
          Estado: <b>{process.status}</b> · Slug: <b>{process.processSlug}</b>
        </p>

        <div className="section">
          <div className="section-body">
            <div className="admin-row" style={{ justifyContent: "space-between" }}>
              <span className="admin-note">Configuración del proceso</span>
              <Link className="admin-btn" to={`/admin/processes/${processSlug}/templates`}>
                Editar cuestionarios (C1 / C2)
              </Link>
            </div>

            <ul className="row-desc" style={{ marginTop: 12 }}>
              <li>Gestionar participantes (próximo)</li>
              <li>Ver progreso (próximo)</li>
              <li>Lanzar / cerrar proceso (próximo)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
