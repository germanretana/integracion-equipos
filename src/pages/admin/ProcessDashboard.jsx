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

function eventLabel(evt) {
  const t = String(evt?.type || "");
  if (t === "ADMIN_REMINDER_REQUESTED") return "Recordatorio (mock)";
  if (t === "ADMIN_ACCESS_RESET") return "Reset acceso (mock)";
  return t || "Evento";
}

function eventPillStyle(evt) {
  const t = String(evt?.type || "");

  // Pensado para fondo oscuro (admin): colores más saturados + texto claro.
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    fontSize: 12,
    fontWeight: 800,
    color: "rgba(255,255,255,0.92)",
    background: "rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  // Reset acceso: teal/verde
  if (t === "ADMIN_ACCESS_RESET") {
    return {
      ...base,
      background: "rgba(53, 190, 177, 0.32)",
      border: "1px solid rgba(53, 190, 177, 0.55)",
      color: "rgba(255,255,255,0.95)",
    };
  }

  // Recordatorio: naranja
  if (t === "ADMIN_REMINDER_REQUESTED") {
    return {
      ...base,
      background: "rgba(255, 152, 0, 0.30)",
      border: "1px solid rgba(255, 152, 0, 0.55)",
      color: "rgba(255,255,255,0.95)",
    };
  }

  return base;
}

export default function ProcessDashboard() {
  const { processSlug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState(null);

  // --- Progress (deep view)
  const [progressLoading, setProgressLoading] = React.useState(false);
  const [progressError, setProgressError] = React.useState("");
  const [progressData, setProgressData] = React.useState(null); // { participants: [...] }
  const [openParticipantId, setOpenParticipantId] = React.useState(""); // expand/collapse

  const [rowBusy, setRowBusy] = React.useState({});
  const [flash, setFlash] = React.useState("");
  const [resetModal, setResetModal] = React.useState(null); // { name, email, tempPassword, ts }
  const [showDebugPassword, setShowDebugPassword] = React.useState(false);

  // Logs
  const [logsLoading, setLogsLoading] = React.useState(false);
  const [logsError, setLogsError] = React.useState("");
  const [logs, setLogs] = React.useState([]);
  const [logParticipantId, setLogParticipantId] = React.useState(""); // "" = todos

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await auth.fetch(
        `/api/admin/processes/${processSlug}/dashboard`,
      );
      setData(payload);
    } catch (e) {
      setError(e?.message || "No se pudo cargar el proceso.");
    } finally {
      setLoading(false);
    }
  }

  async function loadProgress() {
    setProgressLoading(true);
    setProgressError("");
    try {
      const payload = await auth.fetch(
        `/api/admin/processes/${processSlug}/progress`,
      );
      setProgressData(payload);
    } catch (e) {
      setProgressError(e?.message || "No se pudo cargar el progreso.");
    } finally {
      setProgressLoading(false);
    }
  }

  async function loadLogs(participantIdOverride) {
    const pid = participantIdOverride ?? logParticipantId;

    setLogsLoading(true);
    setLogsError("");
    try {
      const qs = new URLSearchParams();
      qs.set("processSlug", processSlug);
      if (pid) qs.set("participantId", pid);
      qs.set("limit", "200");

      const items = await auth.fetch(`/api/admin/events?${qs.toString()}`);
      setLogs(Array.isArray(items) ? items : []);
    } catch (e) {
      setLogsError(e?.message || "No se pudieron cargar los logs.");
    } finally {
      setLogsLoading(false);
    }
  }

  React.useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const payload = await auth.fetch(
          `/api/admin/processes/${processSlug}/dashboard`,
        );
        if (!alive) return;
        setData(payload);
        // Load deep progress view in parallel (non-blocking)
        loadProgress();
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

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  // cuando ya hay proceso cargado, traemos logs iniciales
  React.useEffect(() => {
    if (!data?.process?.processSlug) return;
    loadLogs("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.process?.processSlug]);

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
      setFlash("Estado actualizado.");
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

  async function remindParticipant(p) {
    setError("");
    setRowBusy((x) => ({ ...x, [p.id]: "remind" }));
    try {
      await auth.fetch(
        `/api/admin/processes/${processSlug}/participants/${p.id}/remind`,
        { method: "POST" },
      );
      setFlash(`Recordatorio registrado para ${p.name}.`);
      loadLogs(); // refrescar logs
    } catch (e) {
      setError(e?.message || "No se pudo registrar el recordatorio.");
    } finally {
      setRowBusy((x) => ({ ...x, [p.id]: "" }));
    }
  }

  async function resetAccess(p) {
    const ok = window.confirm(
      `¿Resetear acceso de ${p.name}?\n\nSe generará una nueva contraseña y se enviará notificación por correo.`,
    );
    if (!ok) return;

    setError("");
    setRowBusy((x) => ({ ...x, [p.id]: "reset" }));
    try {
      const resp = await auth.fetch(
        `/api/admin/processes/${processSlug}/participants/${p.id}/reset-access`,
        { method: "POST" },
      );
      setResetModal({
        name: p.name,
        email: p.email,
        tempPassword: resp?.tempPassword || "",
        ts: resp?.ts || null,
      });
      setShowDebugPassword(false);
      setFlash(`Acceso reseteado para ${p.name}.`);
      loadLogs(); // refrescar logs
    } catch (e) {
      setError(e?.message || "No se pudo resetear el acceso.");
    } finally {
      setRowBusy((x) => ({ ...x, [p.id]: "" }));
    }
  }

  async function reopenQuestionnaire({ participantId, kind, peerId, label }) {
    const ok = window.confirm(
      `¿Reabrir (des-enviar) ${label}?\n\nEsto quitará el estado "enviado" y permitirá editar de nuevo.`,
    );
    if (!ok) return;

    setError("");
    const key = `${participantId}__reopen__${kind}__${peerId || ""}`;
    setRowBusy((x) => ({ ...x, [key]: "reopen" }));

    try {
      await auth.fetch(
        `/api/admin/processes/${processSlug}/participants/${participantId}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({
            kind,
            peerId: kind === "c2" ? peerId : undefined,
          }),
        },
      );

      setFlash(`Reabierto: ${label}.`);
      await load(); // refresh main dashboard
      await loadProgress(); // refresh deep progress
      loadLogs(); // audit trail
    } catch (e) {
      setError(e?.message || "No se pudo reabrir el cuestionario.");
    } finally {
      setRowBusy((x) => ({ ...x, [key]: "" }));
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      setFlash("Copiado al portapapeles.");
    } catch {
      setFlash("No se pudo copiar (permiso del navegador).");
    }
  }

  const proc = data?.process || null;
  const rows = data?.participants || [];

  const participantsCount = rows.length;
  const expectedC2Total =
    participantsCount > 0 ? Math.max(0, participantsCount - 1) : 0;

  const status = proc?.status || "";
  const canLaunch = status === "PREPARACION" && !saving;
  const canClose = status === "EN_CURSO" && !saving;
  const processClosed = status === "CERRADO";

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
        {flash && !error && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(0,0,0,0.04)",
              fontSize: 13,
            }}
          >
            {flash}
          </div>
        )}

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
                      {processClosed ? " (acciones bloqueadas)" : ""}
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
                        minWidth: 860,
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
                              width: 300,
                            }}
                          >
                            Acciones
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map((p) => {
                          const total = expectedC2Total;
                          const completed = p?.c2?.completed ?? 0;
                          const ratio = total > 0 ? completed / total : 0;

                          const c1Tone =
                            p.c1 === "done"
                              ? "done"
                              : p.c1 === "progress"
                                ? "progress"
                                : "todo";

                          const c2Tone = c2ToneFromRatio(ratio);

                          const busy = rowBusy[p.id] || "";
                          const disableActions = processClosed || !!busy;

                          return (
                            <React.Fragment key={p.id}>
                              <tr>
                                <td
                                  style={{
                                    padding: "10px 8px",
                                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                                  }}
                                >
                                  <div style={{ fontWeight: 600 }}>
                                    {p.name}
                                  </div>
                                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                                    {p.email}
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
                                    title={`C1: ${c1Label(p.c1)}`}
                                  >
                                    {c1Label(p.c1)}
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
                                    {/* View Progress button */}
                                    <button
                                      className="btn"
                                      disabled={processClosed}
                                      onClick={() => {
                                        const next =
                                          openParticipantId === p.id
                                            ? ""
                                            : p.id;
                                        setOpenParticipantId(next);
                                        if (next) loadProgress();
                                      }}
                                      title="Ver detalle por cuestionario (C1 y C2 por peer)"
                                    >
                                      {openParticipantId === p.id
                                        ? "Ocultar progreso"
                                        : "Ver progreso"}
                                    </button>
                                    {/* Send reminder button */}
                                    <button
                                      className="btn"
                                      disabled={disableActions}
                                      onClick={() => remindParticipant(p)}
                                      title={
                                        processClosed
                                          ? "Proceso cerrado"
                                          : "Registrar recordatorio (mock)"
                                      }
                                    >
                                      {busy === "remind"
                                        ? "Enviando…"
                                        : "Recordatorio"}
                                    </button>
                                    {/* Reset Password button */}
                                    <button
                                      className="btn"
                                      disabled={disableActions}
                                      onClick={() => resetAccess(p)}
                                      title={
                                        processClosed
                                          ? "Proceso cerrado"
                                          : "Reset de acceso (mock)"
                                      }
                                    >
                                      {busy === "reset"
                                        ? "Reseteando…"
                                        : "Reset acceso"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {/* Expanded progress view */}
                              {openParticipantId === p.id && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    style={{
                                      padding: "12px 8px",
                                      borderBottom:
                                        "1px solid rgba(255,255,255,0.10)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        border:
                                          "1px solid rgba(255,255,255,0.14)",
                                        borderRadius: 14,
                                        padding: 14,
                                        background: "rgba(255,255,255,0.06)",
                                        color: "rgba(255,255,255,0.92)",
                                      }}
                                    >
                                      {progressLoading && (
                                        <div
                                          className="sub"
                                          style={{
                                            color: "rgba(255,255,255,0.78)",
                                          }}
                                        >
                                          Cargando progreso…
                                        </div>
                                      )}

                                      {progressError && (
                                        <div
                                          className="error"
                                          style={{
                                            borderColor:
                                              "rgba(255,102,143,0.45)",
                                            background:
                                              "rgba(255,102,143,0.12)",
                                            color: "rgba(255,255,255,0.92)",
                                          }}
                                        >
                                          {progressError}
                                        </div>
                                      )}

                                      {!progressLoading && !progressError && (
                                        <ProgressPanel
                                          participantId={p.id}
                                          progressData={progressData}
                                          processSlug={processSlug}
                                          processClosed={processClosed}
                                          onReloadAll={async () => {
                                            await load();
                                            await loadProgress();
                                            await loadLogs();
                                          }}
                                          setFlash={setFlash}
                                          setError={setError}
                                          setRowBusy={setRowBusy}
                                          rowBusy={rowBusy}
                                        />
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}{" "}
                            </React.Fragment>
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

            {/* Logs */}
            <div className="section" style={{ marginTop: 16 }}>
              <div className="section-body">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2 className="h2" style={{ margin: 0 }}>
                      Logs
                    </h2>
                    <p className="sub" style={{ marginTop: 6 }}>
                      Eventos de administración (mock).
                    </p>
                  </div>

                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <label style={{ fontSize: 13, opacity: 0.85 }}>
                      Participante{" "}
                      <select
                        value={logParticipantId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLogParticipantId(v);
                          loadLogs(v);
                        }}
                        style={{
                          marginLeft: 6,
                          padding: "7px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.10)",
                          background: "#fff",
                        }}
                      >
                        <option value="">Todos</option>
                        {rows.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="btn"
                      onClick={() => loadLogs()}
                      disabled={logsLoading}
                      title="Recargar logs"
                    >
                      {logsLoading ? "Cargando…" : "Actualizar"}
                    </button>
                  </div>
                </div>

                {logsError && (
                  <div className="error" style={{ marginTop: 10 }}>
                    {logsError}
                  </div>
                )}

                {!logsLoading && !logsError && logs.length === 0 && (
                  <p className="sub">Aún no hay eventos registrados.</p>
                )}

                {(logsLoading || logs.length > 0) && (
                  <div
                    style={{
                      overflowX: "auto",
                      maxHeight: 320,
                      overflowY: "auto",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 860,
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 170,
                            }}
                          >
                            Fecha (CR)
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                              width: 220,
                            }}
                          >
                            Evento
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 8px",
                              borderBottom: "1px solid rgba(0,0,0,0.08)",
                            }}
                          >
                            Detalle
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(logsLoading ? Array.from({ length: 3 }) : logs).map(
                          (evt, idx) => {
                            if (logsLoading) {
                              return (
                                <tr key={`sk-${idx}`}>
                                  <td
                                    style={{
                                      padding: "10px 8px",
                                      borderBottom:
                                        "1px solid rgba(0,0,0,0.06)",
                                      opacity: 0.6,
                                    }}
                                  >
                                    …
                                  </td>
                                  <td
                                    style={{
                                      padding: "10px 8px",
                                      borderBottom:
                                        "1px solid rgba(0,0,0,0.06)",
                                      opacity: 0.6,
                                    }}
                                  >
                                    …
                                  </td>
                                  <td
                                    style={{
                                      padding: "10px 8px",
                                      borderBottom:
                                        "1px solid rgba(0,0,0,0.06)",
                                      opacity: 0.6,
                                    }}
                                  >
                                    …
                                  </td>
                                </tr>
                              );
                            }

                            const pid = String(evt?.participantId || "");
                            const p = rows.find((x) => x.id === pid) || null;

                            const who =
                              evt?.participantName ||
                              p?.name ||
                              evt?.participantEmail ||
                              "—";

                            const detailParts = [];
                            if (who && who !== "—") detailParts.push(who);
                            if (evt?.participantEmail)
                              detailParts.push(`<${evt.participantEmail}>`);
                            if (evt?.adminEmail)
                              detailParts.push(`(admin: ${evt.adminEmail})`);

                            return (
                              <tr key={evt?.id || `${evt?.ts}-${idx}`}>
                                <td
                                  style={{
                                    padding: "10px 8px",
                                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                                    fontSize: 13,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {formatCR(evt?.ts)}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 8px",
                                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                                  }}
                                >
                                  <span style={eventPillStyle(evt)}>
                                    {eventLabel(evt)}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: "10px 8px",
                                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                                    fontSize: 13,
                                    opacity: 0.9,
                                  }}
                                >
                                  {detailParts.join(" ")}
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Reset modal */}
            {resetModal && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.70)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                  zIndex: 50,
                }}
                onClick={() => setResetModal(null)}
              >
                <div
                  style={{
                    width: "min(640px, 100%)",
                    borderRadius: 16,
                    background: "#ffffff",
                    color: "#111827",
                    border: "1px solid rgba(0,0,0,0.12)",
                    boxShadow:
                      "0 20px 60px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.10)",
                    overflow: "hidden",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      padding: 16,
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 800 }}>
                      Acceso reseteado
                    </div>
                    <div
                      style={{ marginTop: 4, fontSize: 13, color: "#4b5563" }}
                    >
                      {resetModal.name} — {resetModal.email}
                    </div>
                  </div>

                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                      Se registró el envío de un correo al participante con su
                      nueva clave <strong>(mock)</strong>.
                      <br />
                      El admin no necesita reenviar la contraseña manualmente.
                    </div>

                    {resetModal.ts && (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 13,
                          color: "#4b5563",
                        }}
                      >
                        Timestamp: {formatCR(resetModal.ts)}
                      </div>
                    )}

                    {/* Debug toggle */}
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          color: "#374151",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={showDebugPassword}
                          onChange={(e) =>
                            setShowDebugPassword(e.target.checked)
                          }
                        />
                        Ver clave (debug local)
                      </label>

                      {showDebugPassword && (
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,0.10)",
                            background: "#f9fafb",
                          }}
                        >
                          <code style={{ fontSize: 16, fontWeight: 800 }}>
                            {resetModal.tempPassword}
                          </code>
                          <button
                            className="btn"
                            onClick={() =>
                              copyToClipboard(resetModal.tempPassword)
                            }
                          >
                            Copiar
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        className="btn"
                        onClick={() => setResetModal(null)}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProgressPanel({
  participantId,
  progressData,
  processSlug,
  processClosed,
  onReloadAll,
  setFlash,
  setError,
  setRowBusy,
  rowBusy,
}) {
  const p = (progressData?.participants || []).find(
    (x) => String(x?.id) === String(participantId),
  );

  if (!p)
    return (
      <div className="sub">
        No hay datos de progreso para este participante.
      </div>
    );

  async function reopen(kind, peerId) {
    if (processClosed) return;

    const label = kind === "c1" ? "C1" : `C2 (${peerId})`;
    const ok = window.confirm(
      `¿Reabrir ${label} para este participante?\n\nEsto elimina submittedAt y lo deja editable.`,
    );
    if (!ok) return;

    setError("");
    setRowBusy((x) => ({
      ...x,
      [`reopen:${participantId}:${kind}:${peerId || ""}`]: "1",
    }));
    try {
      await auth.fetch(
        `/api/admin/processes/${processSlug}/participants/${participantId}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({
            kind,
            ...(kind === "c2" ? { peerId } : null),
          }),
        },
      );
      setFlash("Cuestionario reabierto.");
      await onReloadAll?.();
    } catch (e) {
      setError(e?.message || "No se pudo reabrir.");
    } finally {
      setRowBusy((x) => {
        const next = { ...x };
        delete next[`reopen:${participantId}:${kind}:${peerId || ""}`];
        return next;
      });
    }
  }

  function pill(status) {
    const tone =
      status === "done" ? "done" : status === "progress" ? "progress" : "todo";
    const label =
      status === "done"
        ? "Completado"
        : status === "progress"
          ? "En progreso"
          : "Pendiente";
    return <span className={`status-pill status-${tone}`}>{label}</span>;
  }

  const qs = Array.isArray(p.questionnaires) ? p.questionnaires : [];

  const c1 = qs.find((q) => q.kind === "c1") || null;
  const c2s = qs.filter((q) => q.kind === "c2");

  const participantsIndex = React.useMemo(() => {
    const m = new Map();
    for (const pp of progressData?.participants || []) {
      m.set(String(pp?.id || ""), String(pp?.name || pp?.id || ""));
    }
    return m;
  }, [progressData]);

  function peerName(peerId) {
    return participantsIndex.get(String(peerId || "")) || String(peerId || "");
  }

  const cardStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.14)",
    color: "rgba(255,255,255,0.92)",
  };

  const cardLeftStyle = {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  const cardTitleStyle = {
    fontWeight: 650,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 260,
  };

  const pillRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const percentStyle = {
    fontSize: 13,
    color: "rgba(255,255,255,0.78)",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <div style={{ fontWeight: 800 }}>Progreso de: {p.name}</div>
        <button className="btn" onClick={onReloadAll} disabled={false}>
          Actualizar
        </button>
      </div>

      {/* Cards list */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gap: 10,
        }}
      >
        {/* C1 as a card (same visual as C2 cards) */}
        {c1 && (
          <div style={cardStyle}>
            <div style={cardLeftStyle}>
              <div style={cardTitleStyle}>C1</div>

              <div style={pillRowStyle}>
                {pill(c1.status)}
                <div style={percentStyle}>
                  {Number.isFinite(c1.percent) ? `${c1.percent}%` : ""}
                </div>
              </div>
            </div>

            <button
              className="btn"
              disabled={processClosed || rowBusy[`reopen:${participantId}:c1:`]}
              onClick={() => reopen("c1")}
              title={processClosed ? "Proceso cerrado" : "Reabrir (unsubmit)"}
            >
              Reabrir
            </button>
          </div>
        )}

        {/* C2 cards */}
        {c2s.length === 0 ? (
          <div className="sub" style={{ color: "rgba(255,255,255,0.78)" }}>
            No hay C2 esperados para este participante.
          </div>
        ) : (
          c2s.map((q) => {
            const peerLabel = q.peerId ? peerName(q.peerId) : "—";
            const title = `C2 → ${peerLabel}`;

            return (
              <div key={`${q.kind}:${q.peerId || ""}`} style={cardStyle}>
                <div style={cardLeftStyle}>
                  <div style={cardTitleStyle} title={title}>
                    {title}
                  </div>

                  <div style={pillRowStyle}>
                    {pill(q.status)}
                    <div style={percentStyle}>
                      {Number.isFinite(q.percent) ? `${q.percent}%` : ""}
                    </div>
                  </div>
                </div>

                <button
                  className="btn"
                  disabled={
                    processClosed ||
                    rowBusy[`reopen:${participantId}:c2:${q.peerId || ""}`]
                  }
                  onClick={() => reopen("c2", q.peerId)}
                  title={
                    processClosed ? "Proceso cerrado" : "Reabrir (unsubmit)"
                  }
                >
                  Reabrir
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
