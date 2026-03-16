import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../../services/auth";
import TemplateEditor from "../../components/admin/TemplateEditor";
import "../../styles/admin.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

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

function participantLabel(p) {
  return (
    `${p?.firstName || ""} ${p?.lastName || ""}`.trim() ||
    p?.email ||
    "Participante"
  );
}

function slugifyProcessParts(companyName, processName) {
  return String(`${companyName || ""}-${processName || ""}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
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
  const createSlugTouchedRef = React.useRef(false);
  const [loading, setLoading] = React.useState(mode !== "create");
  const [error, setError] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  const [participants, setParticipants] = React.useState([]);
  const [participantsLoading, setParticipantsLoading] = React.useState(false);
  const [participantsError, setParticipantsError] = React.useState("");
  const [participantForm, setParticipantForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [participantSaving, setParticipantSaving] = React.useState(false);
  const [editingParticipantId, setEditingParticipantId] = React.useState(null);
  const [credentialModal, setCredentialModal] = React.useState(null);

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

      window.location.replace(`/admin/processes/${updated.processSlug}`);
    } catch (e) {
      window.alert(e?.message || "No se pudo lanzar el proceso.");
    }
  }

  async function handleCreateProcess() {
    if (!form) return;

    const companyName = String(form.companyName || "").trim();
    const processName = String(form.processName || "").trim();
    const processSlug = String(form.processSlug || "").trim();

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
          processSlug: processSlug || null,
          expectedStartAt: form.expectedStartAt || null,
          expectedEndAt: form.expectedEndAt || null,
        }),
      });

      navigate(`/admin/processes/${created.processSlug}`, {
        replace: true,
      });
    } catch (e) {
      window.alert(e?.message || "No se pudo crear el proceso.");
    } finally {
      setCreating(false);
    }
  }

  async function handleLogoSelected(file) {
    if (!file) return;
    if (mode === "create") {
      window.alert("Primero debe crear el proceso antes de subir un logo.");
      return;
    }
    if (!process || process.status !== "EN_PREPARACION") {
      window.alert("Solo se puede modificar el logo en EN_PREPARACION.");
      return;
    }

    const fd = new FormData();
    fd.append("logo", file);

    setUploadingLogo(true);
    try {
      const data = await auth.fetch(
        `/api/admin/processes/${process.processSlug}/logo`,
        {
          method: "POST",
          body: fd,
        },
      );

      const nextLogoUrl = data?.logoUrl || "";
      setForm((prev) =>
        prev
          ? {
              ...prev,
              logoUrl: nextLogoUrl,
            }
          : prev,
      );
      setProcess((prev) =>
        prev
          ? {
              ...prev,
              logoUrl: nextLogoUrl,
            }
          : prev,
      );
    } catch (e) {
      window.alert(e?.message || "No se pudo subir el logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function loadParticipants(currentSlug = processSlug) {
    if (mode === "create") return;
    setParticipantsLoading(true);
    setParticipantsError("");
    try {
      const data = await auth.fetch(
        `/api/admin/processes/${currentSlug}/participants`,
      );
      setParticipants(Array.isArray(data) ? data : []);
    } catch (e) {
      setParticipantsError(
        e?.message || "No se pudieron cargar los participantes.",
      );
    } finally {
      setParticipantsLoading(false);
    }
  }

  function resetParticipantForm() {
    setParticipantForm({
      firstName: "",
      lastName: "",
      email: "",
    });
    setEditingParticipantId(null);
  }

  async function handleParticipantSubmit() {
    const firstName = String(participantForm.firstName || "").trim();
    const lastName = String(participantForm.lastName || "").trim();
    const email = String(participantForm.email || "").trim();

    if (!firstName || !lastName || !email) {
      window.alert("Debe completar nombre, apellido y correo.");
      return;
    }

    if (!process || process.status !== "EN_PREPARACION") {
      window.alert("Solo se pueden modificar participantes en EN_PREPARACION.");
      return;
    }

    setParticipantSaving(true);
    try {
      if (editingParticipantId) {
        await auth.fetch(
          `/api/admin/processes/${process.processSlug}/participants/${editingParticipantId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              firstName,
              lastName,
              email,
            }),
          },
        );
      } else {
        const created = await auth.fetch(
          `/api/admin/processes/${process.processSlug}/participants`,
          {
            method: "POST",
            body: JSON.stringify({
              firstName,
              lastName,
              email,
            }),
          },
        );

        setCredentialModal({
          title: "Participante creado",
          participantName: participantLabel(created),
          email: created.email,
          tempPassword: created.tempPassword,
        });
      }

      await loadParticipants(process.processSlug);
      resetParticipantForm();
    } catch (e) {
      window.alert(e?.message || "No se pudo guardar el participante.");
    } finally {
      setParticipantSaving(false);
    }
  }

  function handleParticipantEdit(p) {
    setEditingParticipantId(p.id);
    setParticipantForm({
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      email: p.email || "",
    });
  }

  async function handleParticipantDelete(p) {
    if (!process || process.status !== "EN_PREPARACION") return;

    const ok = window.confirm(
      `¿Eliminar a ${participantLabel(p)}?\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;

    try {
      await auth.fetch(
        `/api/admin/processes/${process.processSlug}/participants/${p.id}`,
        {
          method: "DELETE",
        },
      );
      await loadParticipants(process.processSlug);
      if (editingParticipantId === p.id) {
        resetParticipantForm();
      }
    } catch (e) {
      window.alert(e?.message || "No se pudo eliminar el participante.");
    }
  }

  async function handleParticipantResetAccess(p) {
    if (!process) return;

    const ok = window.confirm(`¿Resetear acceso de ${participantLabel(p)}?`);
    if (!ok) return;

    try {
      const data = await auth.fetch(
        `/api/admin/processes/${process.processSlug}/participants/${p.id}/reset-access`,
        {
          method: "POST",
        },
      );

      setCredentialModal({
        title: "Acceso reiniciado",
        participantName: participantLabel(p),
        email: p.email,
        tempPassword: data.tempPassword,
      });
    } catch (e) {
      window.alert(e?.message || "No se pudo resetear el acceso.");
    }
  }

  async function handleDeleteProcess() {
    if (!process) return;

    if (process.status !== "EN_PREPARACION") {
      window.alert(
        "Primero debe revertir el proceso a EN_PREPARACION antes de eliminarlo.",
      );
      return;
    }

    const ok1 = window.confirm(
      "¿Eliminar este proceso?\n\nEsta acción borrará permanentemente participantes, respuestas, plantillas, eventos y logo.",
    );
    if (!ok1) return;

    const typed = window.prompt(
      `Para confirmar, escriba el código exacto del proceso:\n\n${process.processSlug}`,
    );

    if (typed !== process.processSlug) {
      window.alert("Confirmación incorrecta. El proceso no fue eliminado.");
      return;
    }

    try {
      await auth.fetch(`/api/admin/processes/${process.processSlug}`, {
        method: "DELETE",
      });

      window.alert("Proceso eliminado.");
      navigate("/admin/processes", { replace: true });
    } catch (e) {
      window.alert(e?.message || "No se pudo eliminar el proceso.");
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

  React.useEffect(() => {
    if (mode !== "create") return;
    if (!form) return;
    if (createSlugTouchedRef.current) return;

    const suggested = slugifyProcessParts(form.companyName, form.processName);

    setForm((prev) =>
      prev
        ? {
            ...prev,
            processSlug: suggested,
          }
        : prev,
    );
  }, [mode, form?.companyName, form?.processName]);

  React.useEffect(() => {
    if (mode === "create") return;
    if (!processSlug) return;
    loadParticipants(processSlug);
  }, [mode, processSlug]);

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

        <h1 className="h1" style={{ marginBottom: 8 }}>
          {mode === "create"
            ? "Nuevo proceso"
            : `${process.companyName} — ${process.processName}`}
        </h1>

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
                      if (mode === "create") {
                        createSlugTouchedRef.current = true;
                      }
                      const next = { ...form, processSlug: e.target.value };
                      setForm(next);
                      scheduleSave(next);
                    }}
                  />
                  {mode === "create" && (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
                      Se sugiere automáticamente a partir de empresa + nombre,
                      pero puede editarlo.
                    </div>
                  )}
                </div>

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

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="admin-field-label">Logo</div>

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        width: 220,
                        height: 140,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {form.logoUrl ? (
                        <img
                          src={`${API_BASE}${form.logoUrl}`}
                          alt="Logo del proceso"
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                            display: "block",
                          }}
                        />
                      ) : (
                        <span style={{ opacity: 0.6, fontSize: 13 }}>
                          Sin logo
                        </span>
                      )}
                    </div>

                    <div style={{ minWidth: 260 }}>
                      {mode === "create" ? (
                        <div
                          style={{
                            opacity: 0.65,
                            fontSize: 13,
                            lineHeight: 1.5,
                          }}
                        >
                          Podrá subir el logo una vez creado el proceso.
                        </div>
                      ) : (
                        <>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={
                              process.status !== "EN_PREPARACION" ||
                              uploadingLogo
                            }
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              handleLogoSelected(file);
                              e.target.value = "";
                            }}
                          />
                          <div
                            style={{
                              marginTop: 8,
                              opacity: 0.65,
                              fontSize: 12,
                            }}
                          >
                            {uploadingLogo
                              ? "Subiendo logo…"
                              : "Formatos recomendados: JPG o PNG. El sistema optimiza automáticamente la imagen."}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
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

        {activeTab === "general" && mode !== "create" && process && (
          <div className="section" style={{ marginTop: 18 }}>
            <div className="section-body">
              <h2 className="h2" style={{ marginTop: 0 }}>
                Zona peligrosa
              </h2>

              <p className="sub" style={{ marginTop: 6 }}>
                Eliminar este proceso borrará permanentemente participantes,
                respuestas, plantillas, eventos y el logo asociado.
              </p>

              <button
                className="btn"
                type="button"
                onClick={handleDeleteProcess}
                disabled={process.status !== "EN_PREPARACION"}
                style={{
                  borderColor:
                    process.status === "EN_PREPARACION"
                      ? "rgba(255,80,80,0.5)"
                      : undefined,
                  background:
                    process.status === "EN_PREPARACION"
                      ? "rgba(255,80,80,0.18)"
                      : undefined,
                }}
              >
                Eliminar proceso
              </button>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  opacity: 0.75,
                }}
              >
                {process.status === "EN_PREPARACION"
                  ? "Esta acción es irreversible."
                  : "Para eliminar el proceso primero debe revertirlo a EN_PREPARACION."}
              </div>
            </div>
          </div>
        )}
        {activeTab === "participants" && (
          <div className="section">
            <div className="section-body">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1.2fr auto auto",
                  gap: 12,
                  alignItems: "end",
                  marginBottom: 18,
                }}
              >
                <div>
                  <div className="admin-field-label">Nombre</div>
                  <input
                    className="admin-input"
                    value={participantForm.firstName}
                    disabled={
                      process.status !== "EN_PREPARACION" || participantSaving
                    }
                    onChange={(e) =>
                      setParticipantForm((prev) => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <div className="admin-field-label">Apellido</div>
                  <input
                    className="admin-input"
                    value={participantForm.lastName}
                    disabled={
                      process.status !== "EN_PREPARACION" || participantSaving
                    }
                    onChange={(e) =>
                      setParticipantForm((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <div className="admin-field-label">Correo electrónico</div>
                  <input
                    className="admin-input"
                    value={participantForm.email}
                    disabled={
                      process.status !== "EN_PREPARACION" || participantSaving
                    }
                    onChange={(e) =>
                      setParticipantForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>

                <button
                  className="btn"
                  type="button"
                  disabled={
                    process.status !== "EN_PREPARACION" || participantSaving
                  }
                  onClick={handleParticipantSubmit}
                >
                  {participantSaving
                    ? "Guardando…"
                    : editingParticipantId
                      ? "Actualizar"
                      : "Agregar"}
                </button>

                <button
                  className="btn"
                  type="button"
                  disabled={participantSaving}
                  onClick={resetParticipantForm}
                >
                  Limpiar
                </button>
              </div>

              {participantsError && (
                <div className="error">{participantsError}</div>
              )}
              {participantsLoading && (
                <p className="sub">Cargando participantes…</p>
              )}

              {!participantsLoading && participants.length === 0 && (
                <p className="sub">No hay participantes configurados.</p>
              )}

              {!participantsLoading && participants.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Nombre
                        </th>
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Correo
                        </th>
                        <th style={{ textAlign: "left", padding: "10px 8px" }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p) => (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <td style={{ padding: "12px 8px" }}>
                            {participantLabel(p)}
                          </td>
                          <td style={{ padding: "12px 8px" }}>{p.email}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                className="btn"
                                type="button"
                                disabled={process.status !== "EN_PREPARACION"}
                                onClick={() => handleParticipantEdit(p)}
                              >
                                Editar
                              </button>

                              <button
                                className="btn"
                                type="button"
                                onClick={() => handleParticipantResetAccess(p)}
                              >
                                Reset acceso
                              </button>

                              <button
                                className="btn"
                                type="button"
                                disabled={process.status !== "EN_PREPARACION"}
                                onClick={() => handleParticipantDelete(p)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 16, opacity: 0.65, fontSize: 12 }}>
                {process.status === "EN_PREPARACION"
                  ? "Puede agregar, editar o eliminar participantes mientras el proceso esté en preparación."
                  : "En procesos ya lanzados, la lista queda bloqueada. Solo puede resetear accesos."}
              </div>
            </div>
          </div>
        )}

        {activeTab === "c1q" && (
          <TemplateEditor
            title="Preguntas C1"
            subtitle="Plantilla específica para este proceso."
            loadUrl={`/api/admin/processes/${processSlug}/templates/c1`}
            saveUrl={`/api/admin/processes/${processSlug}/templates/c1`}
            previewProcess={
              process
                ? {
                    companyName: process.companyName,
                    processName: process.processName,
                    logoUrl: process.logoUrl || null,
                  }
                : null
            }
          />
        )}

        {activeTab === "c2q" && (
          <TemplateEditor
            title="Preguntas C2"
            subtitle="Plantilla específica para este proceso."
            loadUrl={`/api/admin/processes/${processSlug}/templates/c2`}
            saveUrl={`/api/admin/processes/${processSlug}/templates/c2`}
            previewProcess={
              process
                ? {
                    companyName: process.companyName,
                    processName: process.processName,
                    logoUrl: process.logoUrl || null,
                  }
                : null
            }
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

        {credentialModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 520,
                borderRadius: 18,
                padding: 20,
                background: "rgba(20,24,32,0.98)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              }}
            >
              <h2 className="h2" style={{ marginTop: 0 }}>
                {credentialModal.title}
              </h2>

              <p style={{ marginBottom: 8 }}>
                <strong>Participante:</strong> {credentialModal.participantName}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>Correo:</strong> {credentialModal.email}
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Contraseña temporal:</strong>{" "}
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 15,
                  }}
                >
                  {credentialModal.tempPassword}
                </span>
              </p>

              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <button
                  className="btn"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        credentialModal.tempPassword || "",
                      );
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copiar contraseña
                </button>

                <button
                  className="btn"
                  type="button"
                  onClick={() => setCredentialModal(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
