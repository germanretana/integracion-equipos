import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/admin.css";
import "../styles/questionnaires.css";
import { adminAuth, adminFetch } from "../services/admin";

const TABS = [
  { key: "PREPARACION", label: "Preparación" },
  { key: "EN_CURSO", label: "En curso" },
  { key: "CERRADO", label: "Cerrados" }
];

export default function AdminProcesses() {
  const navigate = useNavigate();
  const admin = adminAuth.getAdmin();

  const [tab, setTab] = useState("PREPARACION");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processes, setProcesses] = useState([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch("/api/admin/processes");
        if (!alive) return;
        setProcesses(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar los procesos.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  function logout() {
    adminAuth.logout();
    navigate("/admin/login", { replace: true });
  }

  const filtered = useMemo(
    () => processes.filter((p) => p.status === tab),
    [processes, tab]
  );

  return (
    <div className="page">
      <div className="admin-wrap">
        <div className="admin-top">
          <div className="topbar-left">
            <img className="brand-logo brand-logo--lg" src="/brand/integracion-plateado.png" alt="" />
          </div>

          <div className="admin-actions">
            <span className="admin-note">{admin?.email}</span>
            <button className="admin-btn" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="h1" style={{ marginTop: 10 }}>
            Procesos
          </h1>

          <Link to="/admin/processes/new" className="admin-btn">
            + Nuevo proceso
          </Link>
        </div>

        <div className="admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`admin-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? <p className="admin-note">Cargando…</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && filtered.length === 0 ? (
          <p className="admin-note">No hay procesos en este estado.</p>
        ) : null}

        <div className="section">
          <div className="section-body">
            {filtered.map((p) => (
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
                    <p className="row-desc">Slug: {p.processSlug}</p>
                  </div>

                  <div className="row-right">
                    <span className="pill muted">{p.status}</span>
                    <span className="chev">{">"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <p className="footer-help">
          Si tiene alguna duda o consulta, escriba a{" "}
          <a href="mailto:integracion@germanretana.com">integracion@germanretana.com</a>
        </p>
      </div>
    </div>
  );
}
