import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

export default function ProcessesList() {
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [items, setItems] = React.useState([]);

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  React.useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await auth.fetch("/api/admin/processes-summary");
        if (!alive) return;
        setItems(data || []);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar los procesos.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, []);

  return (
    <div className="page">
      <div className="page-inner">
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h1 className="h1" style={{ margin: 0 }}>
            Procesos
          </h1>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link to="/admin/master-templates" className="btn">
              Plantillas Maestras
            </Link>
            <button className="btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        {loading && <p className="sub">Cargando procesos…</p>}
        {error && <div className="error">{error}</div>}

        {!loading && items.length === 0 && (
          <p className="sub">No hay procesos creados.</p>
        )}

        {!loading && items.length > 0 && (
          <div className="section">
            <div className="section-body">
              {items.map((p) => (
                <Link
                  key={p.processSlug}
                  to={`/admin/processes/${p.processSlug}`}
                  className="row-link"
                >
                  <div className="row">
                    <div className="row-left">
                      <p className="row-title">
                        {p.companyName} — {p.processName}
                      </p>
                      <p className="row-desc">Estado: {p.status}</p>
                    </div>

                    <div className="row-right">
                      <span className="pill">
                        C1 {p.progress.c1Completed}/{p.progress.c1Total}
                      </span>
                      <span className="pill">
                        C2 {p.progress.c2Completed}/{p.progress.c2Total}
                      </span>
                      <span className="chev">{">"}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
