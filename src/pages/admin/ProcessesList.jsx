import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos" },
  { value: "EN_PREPARACION", label: "En preparación" },
  { value: "EN_CURSO", label: "En curso" },
  { value: "CERRADO", label: "Cerrado" },
];

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
  const raw = p?.expectedStartAt || p?.expectedStartDate || null;

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

function searchableText(p) {
  return [
    p?.companyName || "",
    p?.processName || "",
    p?.processSlug || "",
    p?.status || "",
  ]
    .join(" ")
    .toLowerCase();
}

export default function ProcessesList() {
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");

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

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();

    return sortedItems.filter((p) => {
      const statusOk =
        statusFilter === "ALL" ? true : String(p?.status || "") === statusFilter;

      const searchOk = !q ? true : searchableText(p).includes(q);

      return statusOk && searchOk;
    });
  }, [sortedItems, search, statusFilter]);

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

        <div className="section" style={{ marginTop: 16 }}>
          <div className="section-body">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <label className="admin-field-label">Buscar proceso</label>
                <input
                  className="admin-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por empresa, nombre, código o estado"
                />
              </div>

              <div>
                <div className="admin-field-label" style={{ marginBottom: 8 }}>
                  Filtrar por estado
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = statusFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className="btn"
                        onClick={() => setStatusFilter(opt.value)}
                        style={{
                          opacity: active ? 1 : 0.78,
                          borderColor: active
                            ? "rgba(255,255,255,0.22)"
                            : "rgba(255,255,255,0.12)",
                          background: active
                            ? "rgba(255,255,255,0.10)"
                            : "rgba(255,255,255,0.06)",
                          fontWeight: active ? 900 : 800,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  opacity: 0.72,
                }}
              >
                Mostrando <strong>{filteredItems.length}</strong> de{" "}
                <strong>{items.length}</strong> procesos.
              </div>
            </div>
          </div>
        </div>

        {loading && <p className="sub">Cargando procesos…</p>}
        {error && <div className="error">{error}</div>}

        {!loading && filteredItems.length === 0 && (
          <p className="sub">
            {items.length === 0
              ? "No hay procesos creados."
              : "No hay procesos que coincidan con los filtros."}
          </p>
        )}

        {!loading && filteredItems.length > 0 && (
          <div className="section">
            <div className="section-body">
              {filteredItems.map((p) => {
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
