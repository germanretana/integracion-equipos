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

export default function ProcessEditor() {
  const navigate = useNavigate();
  const { processSlug } = useParams();

  const [activeTab, setActiveTab] = React.useState("general");
  const [process, setProcess] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  React.useEffect(() => {
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
  }, [processSlug]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-inner">
          <p className="sub">Cargando proceso…</p>
        </div>
      </div>
    );
  }

  if (error || !process) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="error">{error || "Proceso no encontrado."}</div>
        </div>
      </div>
    );
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
          {process.companyName} — {process.processName}
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
          <Tab
            active={activeTab === "participants"}
            onClick={() => setActiveTab("participants")}
          >
            Participantes
          </Tab>
          <Tab active={activeTab === "c1q"} onClick={() => setActiveTab("c1q")}>
            Preguntas C1
          </Tab>
          <Tab active={activeTab === "c2q"} onClick={() => setActiveTab("c2q")}>
            Preguntas C2
          </Tab>
          <Tab active={activeTab === "c1r"} onClick={() => setActiveTab("c1r")}>
            Reporte C1
          </Tab>
          <Tab active={activeTab === "c2r"} onClick={() => setActiveTab("c2r")}>
            Reporte C2
          </Tab>
        </div>

        {/* Tab content */}

        {activeTab === "general" && (
          <div className="section">
            <div className="section-body">
              <p>
                <strong>Empresa:</strong> {process.companyName}
              </p>
              <p>
                <strong>Proceso:</strong> {process.processName}
              </p>
              <p>
                <strong>Estado:</strong> {process.status}
              </p>
              <p>
                <strong>Slug:</strong> {process.processSlug}
              </p>
              <p>
                <strong>Creado:</strong> {process.createdAt}
              </p>
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
