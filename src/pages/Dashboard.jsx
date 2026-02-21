import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";
import { auth } from "../services/auth";

export default function Dashboard() {
  const navigate = useNavigate();
  const session = auth.getSession();

  const logout = () => {
    auth.clearSession();
    navigate("/", { replace: true });
  };

  return (
    <div
      className="auth-container"
      style={{ backgroundImage: `url(/backgrounds/E.jpg)` }}
    >
      <div className="auth-overlay" />

      <div className="auth-content">
        <div className="auth-inner">
          <Logo />

          <div className="auth-card">
            <h2 style={{ margin: "0 0 8px 0" }}>Acceso confirmado</h2>
            <p className="auth-instructions" style={{ marginTop: 0 }}>
              {auth.isMock
                ? "Modo MOCK activo (sin backend)."
                : "Conectado al backend."}
            </p>

            <div style={{ textAlign: "left" }}>
              <p style={{ margin: "8px 0" }}>
                <strong>Usuario:</strong> {session?.participant?.name || "—"}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Correo:</strong> {session?.participant?.email || "—"}
              </p>
            </div>

            <button className="primary" onClick={logout}>
              Cerrar sesión
            </button>

            <p className="auth-help">
              Si necesita ayuda, escriba a{" "}
              <a href="mailto:integracion@germanretana.com">
                integracion@germanretana.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
