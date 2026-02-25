import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../services/auth";
import "../../styles/admin.css";

export default function ProcessEditor({ mode = "create" }) {
  const navigate = useNavigate();

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
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

        <h1 className="h1" style={{ margin: 0 }}>
          {mode === "create" ? "Nuevo Proceso" : "Editar Proceso"}
        </h1>

        <p className="sub" style={{ marginTop: 8 }}>
          Pantalla en construcción (creación/edición + autoguardado).
        </p>
      </div>
    </div>
  );
}
