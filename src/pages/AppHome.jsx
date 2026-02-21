import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";
import "../styles/app.css";
import { auth } from "../services/auth";

export default function AppHome() {
  const session = auth.getSession();
  const participantName = session?.participant?.name || "—";
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <Logo />
        </div>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Participante: <strong>{participantName}</strong>
        </div>

        <nav className="app-nav">
          <span className="app-nav-link active">Inicio</span>
          <Link to="/app/questionnaires" className="app-nav-link">
            Cuestionarios
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <div className="app-container">
          <h1 className="app-title">Inicio</h1>
          <p className="app-subtitle">
            Bienvenido. Desde aquí puede acceder a sus cuestionarios.
          </p>

          <div className="app-actions">
            <Link to="/app/questionnaires" className="btn-primary">
              Ir a cuestionarios
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
