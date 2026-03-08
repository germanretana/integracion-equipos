import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../../services/auth";
import TemplateEditor from "../../components/admin/TemplateEditor";
import "../../styles/admin.css";

function Tab({ active, children, onClick }) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      style={{
        opacity: active ? 1 : 0.75,
        borderColor: active
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.12)",
        background: active
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.06)",
        fontWeight: active ? 900 : 800,
      }}
    >
      {children}
    </button>
  );
}

export default function ProcessEditor({ mode = "edit" }) {
  const navigate = useNavigate();
  const { processSlug } = useParams();

  const [activeTab, setActiveTab] = React.useState("general");
  const [process, setProcess] = React.useState(null);
  const [form, setForm] = React.useState(
    mode === "create"
      ? {
          companyName: "",
          processName: "",
          processSlug: "",
          expectedStartAt: "",
          expectedEndAt: "",
          logoUrl: "",
        }
      : null,
  );
  const debounceRef = React.useRef(null);
  const [loading, setLoading] = React.useState(mode !== "create");
  const [error, setError] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  async function handleLaunchProcess() {
    if (!process || process.status !== "EN_PREPARACION") return;

    const ok = window.confirm(
      "¿Desea lanzar el proceso?\n\nLuego de lanzarlo, ya no podrá modificar la configuración general ni las plantillas de este proceso.",
    );
    if (!ok) return;

    try {
      const updated = await auth.fetch(
        `/api/admin/processes/${process.processSlug}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "EN_CURSO" }),
        },
      );

      navigate("/admin/processes", { replace: true });
      setTimeout(() => {
        navigate(`/admin/processes/${updated.processSlug}`, { replace: true });
      }, 0);
    } catch (e) {
      window.alert(e?.message || "No se pudo lanzar el proceso.");
    }
  }

  async function handleCreateProcess() {
    if (!form) return;

    const companyName = String(form.companyName || "").trim();
    const processName = String(form.processName || "").trim();

    if (!companyName || !processName) {
      window.alert("Debe completar Empresa y Nombre del proceso.");
      return;
    }

    setCreating(true);
    try {
      const created = await auth.fetch("/api/admin/processes", {
        method: "POST",
        body: JSON.stringify({
          companyName,
          processName,
        }),
      });

      // If user had typed optional values in create screen, persist them immediately
      const patchPayload = {
        expectedStartAt: form.expectedStartAt || null,
        expectedEndAt: form.expectedEndAt || null,
      };

      if (String(form.processSlug || "").trim()) {
        patchPayload.newSlug = String(form.processSlug).trim();
      }

      const hasOptionalChanges =
        !!patchPayload.expectedStartAt ||
        !!patchPayload.expectedEndAt ||
        !!patchPayload.newSlug;

      let finalProcess = created;

      if (hasOptionalChanges) {
        finalProcess = await auth.fetch(
          `/api/admin/processes/${created.processSlug}`,
          {
            method: "PATCH",
            body: JSON.stringify(patchPayload),
          },
        );
      }

      navigate(`/admin/processes/${finalProcess.processSlug}`, {
        replace: true,
      });
    } catch (e) {
      window.alert(e?.message || "No se pudo crear el proceso.");
    } finally {
      setCreating(false);
    }
  }

  React.useEffect(() => {
    if (mode === "create") return;

    async function load() {
      try {
        const data = await auth.fetch(`/api/admin/processes/${processSlug}`);
        setProcess(data);
      } catch (e) {
        setError(e?.message || "No se pudo cargar el proceso.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [mode, processSlug]);

  React.useEffect(() => {
    if (mode === "create") return;
    if (!process) return;

    setForm({
      companyName: process.companyName || "",
      processName: process.processName || "",
      processSlug: process.processSlug || "",
      expectedStartAt: process.expectedStartAt || "",
      expectedEndAt: process.expectedEndAt || "",
      logoUrl: process.logoUrl || "",
    });
  }, [mode, process]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-inner">
          <p className="sub">Cargando proceso…</p>
        </div>
      </div>
    );
  }

  if (mode !== "create" && (error || !process)) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="error">{error || "Proceso no encontrado."}</div>
        </div>
      </div>
    );
  }

  function scheduleSave(nextForm) {
    if (mode === "create") return;
    if (!process || process.status !== "EN_PREPARACION") return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const payload = {
          companyName: nextForm.companyName,
          processName: nextForm.processName,
          expectedStartAt: nextForm.expectedStartAt || null,
          expectedEndAt: nextForm.expectedEndAt || null,
        };

        if (nextForm.processSlug !== process.processSlug) {
          payload.newSlug = nextForm.processSlug;
        }

        const updated = await auth.fetch(
          `/api/admin/processes/${process.processSlug}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );

        setProcess(updated);

        // If slug changed, redirect
        if (updated.processSlug !== process.processSlug) {
          navigate(`/admin/processes/${updated.processSlug}`, {
            replace: true,
          });
        }
      } catch (e) {
        console.error("Autosave error:", e);
      }
    }, 800);
  }

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

        {/* Process title */}
        <h1 className="h1" style={{ marginBottom: 8 }}>
          {mode === "create"
            ? "Nuevo proceso"
            : `${process.companyName} — ${process.processName}`}
        </h1>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <Tab
            active={activeTab === "general"}
            onClick={() => setActiveTab("general")}
          >
            General
          </Tab>

          {mode !== "create" && (
            <>
              <Tab
                active={activeTab === "participants"}
                onClick={() => setActiveTab("participants")}
              >
                Participantes
              </Tab>
              <Tab
                active={activeTab === "c1q"}
                onClick={() => setActiveTab("c1q")}
              >
                Preguntas C1
              </Tab>
              <Tab
                active={activeTab === "c2q"}
                onClick={() => setActiveTab("c2q")}
              >
                Preguntas C2
              </Tab>
              <Tab
                active={activeTab === "c1r"}
                onClick={() => setActiveTab("c1r")}
              >
                Reporte C1
              </Tab>
              <Tab
                active={activeTab === "c2r"}
                onClick={() => setActiveTab("c2r")}
              >
                Reporte C2
              </Tab>
            </>
          )}
        </div>

        {/* Tab content */}

        {activeTab === "general" && form && (
          <div className="section">
            <div className="section-body">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                {/* Empresa */}
                <div>
                  <div className="admin-field-label">Empresa</div>
                  <input
                    className="admin-input"
                    value={form.companyName}
                    disabled={
                      mode !== "create" && process.status !== "EN_PREPARACION"
                    }
                    onChange={(e) => {
                      const next = { ...form, companyName: e.target.value };
                      setForm(next);
                      scheduleSave(next);
                    }}
                  />
                </div>

                {/* Proceso */}
                <div>
                  <div className="admin-field-label">Nombre del proceso</div>
                  <input
                    className="admin-input"
                    value={form.processName}
                    disabled={
                      mode !== "create" && process.status !== "EN_PREPARACION"
                    }
                    onChange={(e) => {
                      const next = { ...form, processName: e.target.value };
                      setForm(next);
                      scheduleSave(next);
                    }}
                  />
                </div>

                {/* Slug */}
                <div>
                  <div className="admin-field-label">
                    Código (para sitio web)
                  </div>
                  <input
                    className="admin-input"
                    value={form.processSlug}
                    disabled={
                      mode !== "create" && process.status !== "EN_PREPARACION"
                    }
                    onChange={(e) => {
                      const next = { ...form, processSlug: e.target.value };
                      setForm(next);
                      scheduleSave(next);
                    }}
                  />
                </div>

                {/* Estado */}
                <div>
                  <div className="admin-field-label">Estado</div>
                  <input
                    className="admin-input"
                    value={
                      mode === "create" ? "EN_PREPARACION" : process.status
                    }
                    disabled
                  />
                </div>

                {/* Fecha inicio */}
                <div>
                  <div className="admin-field-label">
                    Fecha prevista de inicio
                  </div>
                  <input
                    type="date"
                    className="admin-input"
                    value={form.expectedStartAt || ""}
                    disabled={
                      mode !== "create" && process.status !== "EN_PREPARACION"
                    }
                    onChange={(e) => {
                      const next = {
                        ...form,
                        expectedStartAt: e.target.value,
                      };
                      setForm(next);
                      scheduleSave(next);
                    }}
                  />
                </div>

                {/* Fecha fin */}
                <div>
                  <div className="admin-field-label">
                    Fecha prevista de cierre
                  </div>
                  <input
                    type="date"
                    className="admin-input"
                    value={form.expectedEndAt || ""}
                    disabled={
                      mode !== "create" && process.status !== "EN_PREPARACION"
                    }
                    onChange={(e) => {
                      const next = {
                        ...form,
                        expectedEndAt: e.target.value,
                      };
                      setForm(next);
                      scheduleSave(next);
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                  {mode === "create"
                    ? "Complete los datos básicos y luego cree el proceso."
                    : "Los cambios se guardan automáticamente."}
                </div>

                {mode === "create" ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCreateProcess}
                    disabled={creating}
                  >
                    {creating ? "Creando…" : "Crear proceso"}
                  </button>
                ) : (
                  process.status === "EN_PREPARACION" && (
                    <button
                      className="btn"
                      type="button"
                      onClick={handleLaunchProcess}
                    >
                      Lanzar proceso
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "participants" && (
          <div className="section">
            <div className="section-body">
              <p>Gestión de participantes próximamente.</p>
            </div>
          </div>
        )}

        {activeTab === "c1q" && (
          <TemplateEditor
            title="Preguntas C1"
            subtitle="Plantilla específica para este proceso."
            loadUrl={`/api/admin/processes/${processSlug}/templates/c1`}
            saveUrl={`/api/admin/processes/${processSlug}/templates/c1`}
          />
        )}

        {activeTab === "c2q" && (
          <TemplateEditor
            title="Preguntas C2"
            subtitle="Plantilla específica para este proceso."
            loadUrl={`/api/admin/processes/${processSlug}/templates/c2`}
            saveUrl={`/api/admin/processes/${processSlug}/templates/c2`}
          />
        )}

        {activeTab === "c1r" && (
          <div className="section">
            <div className="section-body">
              <p>Editor de reporte C1 próximamente.</p>
            </div>
          </div>
        )}

        {activeTab === "c2r" && (
          <div className="section">
            <div className="section-body">
              <p>Editor de reporte C2 próximamente.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
