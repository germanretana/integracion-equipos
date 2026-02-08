import React from "react";
import { Link } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

export default function ProcessesList() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [items, setItems] = React.useState([]);

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
        <h1 className="h1">Procesos</h1>

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
                      <p className="row-desc">
                        Estado: {p.status}
                      </p>
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
