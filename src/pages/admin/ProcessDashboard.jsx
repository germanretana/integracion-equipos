import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

function c1Label(status) {
  if (status === "done") return "Completado";
  if (status === "progress") return "En progreso";
  return "Pendiente";
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function formatCR(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Costa_Rica",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function c2ToneFromRatio(ratio) {
  const r = clamp01(ratio);
  if (r >= 1) return "done";
  if (r > 0) return "progress";
  return "todo";
}

function ProgressBar({ value, tone }) {
  const v = clamp01(value);
  const pct = Math.round(v * 100);

  return (
    <div
      style={{
        height: 10,
        borderRadius: 999,
        background: "rgba(0,0,0,0.08)",
        overflow: "hidden",
        minWidth: 140,
      }}
      aria-label={`Progreso ${pct}%`}
      title={`Progreso ${pct}%`}
    >
      <div
        className={`status-bar-fill status-${tone}`}
        style={{
          width: `${pct}%`,
          height: "100%",
        }}
      />
    </div>
  );
}

export default function ProcessDashboard() {
  const { processSlug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await auth.fetch(
        `/api/admin/processes/${processSlug}/dashboard`
      );
      setData(payload);
    } catch (e) {
      setError(e?.message || "No se pudo cargar el proceso.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const payload = await auth.fetch(
          `/api/admin/processes/${processSlug}/dashboard`
        );
        if (!alive) return;
        setData(payload);
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
    if (!data?.process) return;

    setSaving(true);
    setError("");
    try {
      await auth.fetch(`/api/admin/processes/${processSlug}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
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

  const proc = data?.process || null;
  const rows = data?.participants || [];

  const participantsCount = rows.length;
  const expectedC2Total =
    participantsCount > 0 ? Math.max(0, participantsCount - 1) : 0;

  const status = proc?.status || "";
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

        {!loading && proc && (
          <>
            {/* Header */}
            <div className="section" style={{ marginBottom: 16 }}>
              <div className="section-body">
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  {proc.logoUrl ? (
                    <img
                      src={proc.logoUrl}
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
                      {proc.companyName} — {proc.processName}
                    </h1>
                    <p className="sub" style={{ marginTop: 0 }}>
                      Estado: <strong>{proc.status}</strong>
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

            {/* Participants table */}
            <div className="section">
              <div className="section-body">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <p className="sub" style={{ marginTop: 0 }}>
                    Participantes: <strong>{participantsCount}</strong>
                  </p>

                  {participantsCount > 1 && (
                    <p className="sub" style={{ marginTop: 0, opacity: 0.85 }}>
                      C2 esperado por participante:{" "}
                      <strong>{expectedC2Total}</strong>
                    </p>
                  )}
                </div>

                {rows.length === 0 ? (
                  <p className="sub">No hay participantes en este proceso.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 820,
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                            }}
                          >
                            Participante
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 160,
                            }}
                          >
                            C1
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 260,
                            }}
                          >
                            C2 (de {expectedC2Total})
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 260,
                            }}
                          >
                            Acciones
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map((r) => {
                          const total = expectedC2Total;
                          const completed = r?.c2?.completed ?? 0;
                          const ratio = total > 0 ? completed / total : 0;

                          const c1Tone =
                            r.c1 === "done"
                              ? "done"
                              : r.c1 === "progress"
                              ? "progress"
                              : "todo";

                          const c2Tone = c2ToneFromRatio(ratio);

                          return (
                            <tr key={r.id}>
                              <td
                                style={{
                                  padding: "10px 8px",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{r.name}</div>
                                <div style={{ fontSize: 13, opacity: 0.8 }}>
                                  {r.email}
                                </div>
                              </td>

                              <td
                                style={{
                                  padding: "10px 8px",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}
                              >
                                <span
                                  className={`status-pill status-${c1Tone}`}
                                  title={`C1: ${c1Label(r.c1)}`}
                                >
                                  {c1Label(r.c1)}
                                </span>
                              </td>

                              <td
                                style={{
                                  padding: "10px 8px",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                  }}
                                >
                                  <ProgressBar value={ratio} tone={c2Tone} />
                                  <span
                                    className={`status-pill status-${c2Tone}`}
                                    title={`C2: ${completed}/${total}`}
                                  >
                                    {completed}/{total}
                                  </span>
                                </div>
                              </td>

                              <td
                                style={{
                                  padding: "10px 8px",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "nowrap",
                                  }}
                                >
                                  <button
                                    className="btn"
                                    disabled
                                    title="Pendiente (BLOQUE futuro)"
                                  >
                                    Recordatorio
                                  </button>
                                  <button
                                    className="btn"
                                    disabled
                                    title="Pendiente (BLOQUE futuro)"
                                  >
                                    Reset acceso
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Technical footer */}
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(0,0,0,0.06)",
                    fontSize: 12,
                    opacity: 0.65,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    Código de proceso: <code>{proc.processSlug}</code>
                  </div>
                  <div>
                    Lanzado: {formatCR(proc.launchedAt)} · Cerrado:{" "}
                    {formatCR(proc.closedAt)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
