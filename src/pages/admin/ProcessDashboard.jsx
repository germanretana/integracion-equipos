import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

export default function ProcessDashboard() {
  const { processSlug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [item, setItem] = React.useState(null);

  React.useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const data = await auth.fetch(`/api/admin/processes/${processSlug}`);
        if (!alive) return;
        setItem(data);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudo cargar el proceso.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => (alive = false);
  }, [processSlug]);

  async function setStatus(nextStatus) {
    if (!item) return;
    setSaving(true);
    setError("");
    try {
      const updated = await auth.fetch(
        `/api/admin/processes/${processSlug}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      setItem(updated);
    } catch (e) {
      setError(e?.message || "No se pudo actualizar el estado.");
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  const status = item?.status || "";
  const canLaunch = status === "PREPARACION" && !saving;
  const canClose = status === "EN_CURSO" && !saving;

  return (
    <div className="page">
      <div className="page-inner">
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Link to="/admin/processes" className="btn">
            {"<"} Volver
          </Link>

          <button className="btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {loading && <p className="sub">Cargando proceso…</p>}
        {error && <div className="error">{error}</div>}

        {!loading && item && (
          <>
            <div className="section" style={{ marginBottom: 16 }}>
              <div className="section-body">
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  {item.logoUrl ? (
                    <img
                      src={item.logoUrl}
                      alt="Logo"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        objectFit: "contain",
                        background: "#fff",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: "rgba(0,0,0,0.06)",
                      }}
                    />
                  )}

                  <div style={{ flex: 1 }}>
                    <h1 className="h1" style={{ marginBottom: 2 }}>
                      {item.companyName} — {item.processName}
                    </h1>
                    <p className="sub" style={{ marginTop: 0 }}>
                      processSlug: <code>{item.processSlug}</code> · Estado:{" "}
                      <strong>{item.status}</strong>
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      disabled={!canLaunch}
                      onClick={() => setStatus("EN_CURSO")}
                    >
                      {saving && canLaunch ? "Guardando…" : "Poner en marcha"}
                    </button>
                    <button
                      className="btn"
                      disabled={!canClose}
                      onClick={() => setStatus("CERRADO")}
                    >
                      {saving && canClose ? "Guardando…" : "Cerrar proceso"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="section">
              <div className="section-body">
                <p className="sub" style={{ margin: 0 }}>
                  Dashboard del proceso (BLOQUE 1).
                  <br />
                  Próximo bloque: participantes + métricas.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
