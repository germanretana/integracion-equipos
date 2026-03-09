import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

function formatExpectedStart(value) {
  if (!value) return "Sin fecha prevista";
  try {
    return new Intl.DateTimeFormat("es-CR", {
      dateStyle: "medium",
      timeZone: "America/Costa_Rica",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function sortRankForProcess(p) {
  const raw =
    p?.expectedStartAt ||
    p?.expectedStartDate ||
    null;

  // EN_PREPARACION without date counts as future and should appear first.
  if (!raw && p?.status === "EN_PREPARACION") {
    return Number.NEGATIVE_INFINITY;
  }

  if (!raw) {
    return Number.POSITIVE_INFINITY;
  }

  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) {
    return Number.POSITIVE_INFINITY;
  }

  return ts;
}

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
        setItems(Array.isArray(data) ? data : []);
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

  const sortedItems = React.useMemo(() => {
    return [...items].sort((a, b) => {
      const aRank = sortRankForProcess(a);
      const bRank = sortRankForProcess(b);

      if (aRank !== bRank) return aRank - bRank;

      const aName = `${a?.companyName || ""} ${a?.processName || ""}`.trim();
      const bName = `${b?.companyName || ""} ${b?.processName || ""}`.trim();
      return aName.localeCompare(bName, "es");
    });
  }, [items]);

  return (
    <div className="page">
      <div className="page-inner">
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
            <Link to="/admin/processes/new" className="btn">
              + Nuevo proceso
            </Link>
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

        {!loading && sortedItems.length === 0 && (
          <p className="sub">No hay procesos creados.</p>
        )}

        {!loading && sortedItems.length > 0 && (
          <div className="section">
            <div className="section-body">
              {sortedItems.map((p) => {
                const expectedStart =
                  p.expectedStartAt || p.expectedStartDate || null;

                return (
                  <Link
                    key={p.processSlug}
                    to={`/admin/processes/${p.processSlug}`}
                    className="row-link"
                  >
                    <div className="row">
                      <div
                        className="row-left"
                        style={{ display: "flex", alignItems: "center", gap: 14 }}
                      >
                        {p.logoUrl ? (
                          <img
                            src={`${API_BASE}${p.logoUrl}`}
                            alt="Logo"
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              objectFit: "contain",
                              background: "#fff",
                              border: "1px solid rgba(0,0,0,0.08)",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.08)",
                              flexShrink: 0,
                            }}
                          />
                        )}

                        <div style={{ minWidth: 0 }}>
                          <p
                            className="row-title"
                            style={{
                              fontSize: 18,
                              fontWeight: 800,
                              margin: 0,
                              lineHeight: 1.2,
                            }}
                          >
                            {p.companyName} — {p.processName}
                          </p>

                          <p
                            style={{
                              margin: "6px 0 0 0",
                              fontSize: 12,
                              opacity: 0.75,
                            }}
                          >
                            Estado: {p.status}
                          </p>

                          <p
                            style={{
                              margin: "4px 0 0 0",
                              fontSize: 12,
                              opacity: 0.72,
                            }}
                          >
                            Inicio previsto: {formatExpectedStart(expectedStart)}
                          </p>
                        </div>
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
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
