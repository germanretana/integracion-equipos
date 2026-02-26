import React from "react";
import { Link, useNavigate } from "react-router-dom";
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

export default function MasterTemplates() {
  const navigate = useNavigate();
  const [kind, setKind] = React.useState("c1"); // c1 | c2

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  const title =
    kind === "c1" ? "Plantilla Maestra — C1" : "Plantilla Maestra — C2";

  const subtitle =
    kind === "c1"
      ? "Estas instrucciones y preguntas se copiarán a cada proceso nuevo (C1)."
      : "Estas instrucciones y preguntas se copiarán a cada proceso nuevo (C2).";

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

        <TemplateEditor
          title={title}
          subtitle={subtitle}
          loadUrl={`/api/admin/base-templates/${kind}`}
          saveUrl={`/api/admin/base-templates/${kind}`}
          headerRight={
            <>
              <Tab active={kind === "c1"} onClick={() => setKind("c1")}>
                C1
              </Tab>
              <Tab active={kind === "c2"} onClick={() => setKind("c2")}>
                C2
              </Tab>
            </>
          }
          note={
            "Nota: los procesos ya creados mantienen sus propias plantillas. Estas plantillas maestras afectan únicamente a procesos nuevos."
          }
        />
      </div>
    </div>
  );
}
