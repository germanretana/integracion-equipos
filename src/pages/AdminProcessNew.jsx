import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/admin.css";
import "../styles/questionnaires.css";
import { adminFetch } from "../services/admin";

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function AdminProcessNew() {
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [processName, setProcessName] = useState("");
  const [processSlug, setProcessSlug] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function onCompanyChange(v) {
    setCompanyName(v);
    if (!processSlug && processName) {
      setProcessSlug(slugify(`${v}-${processName}`));
    }
  }

  function onProcessChange(v) {
    setProcessName(v);
    if (!processSlug && companyName) {
      setProcessSlug(slugify(`${companyName}-${v}`));
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!companyName || !processName || !processSlug) {
      setError("Complete todos los campos.");
      return;
    }

    setLoading(true);
    try {
      await adminFetch("/api/admin/processes", {
        method: "POST",
        body: { companyName, processName, processSlug }
      });
      navigate("/admin/processes", { replace: true });
    } catch (e) {
      setError(e?.message || "No se pudo crear el proceso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="admin-wrap">
        <h1 className="h1">Nuevo proceso</h1>

        <form onSubmit={onSubmit} className="admin-card">
          <div className="admin-card-body">
            <div className="admin-label">Nombre de la empresa</div>
            <input
              className="admin-input"
              value={companyName}
              onChange={(e) => onCompanyChange(e.target.value)}
            />

            <div className="admin-label">Nombre del proceso</div>
            <input
              className="admin-input"
              value={processName}
              onChange={(e) => onProcessChange(e.target.value)}
            />

            <div className="admin-label">Slug del proceso (URL)</div>
            <input
              className="admin-input"
              value={processSlug}
              onChange={(e) => setProcessSlug(slugify(e.target.value))}
            />

            {error ? <div className="error">{error}</div> : null}

            <div className="admin-row" style={{ justifyContent: "space-between", marginTop: 14 }}>
              <button
                type="button"
                className="admin-btn"
                onClick={() => navigate("/admin/processes")}
              >
                Cancelar
              </button>

              <button type="submit" className="admin-btn" disabled={loading}>
                {loading ? "Creando…" : "Crear proceso"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
