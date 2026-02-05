import { useEffect, useMemo, useState } from "react";
import Logo from "../components/Logo";
import "../styles/app.css";
import { auth } from "../services/auth";

const backgrounds = ["A","B","C","D","E","F","G","H","I","J","K","L"];

function pickBackground() {
  return backgrounds[Math.floor(Math.random() * backgrounds.length)];
}

export default function AppHome() {
  const [bg, setBg] = useState("A");

  useEffect(() => {
    setBg(pickBackground());
  }, []);

  const user = useMemo(() => auth.getCurrentUser?.() || null, []);

  const onLogout = async () => {
    try {
      await auth.logout?.();
    } finally {
      window.location.href = "/";
    }
  };

  return (
    <div
      className="app-container"
      style={{ backgroundImage: `url(/backgrounds/${bg}.jpg)` }}
    >
      <div className="app-overlay" />

      <div className="app-content">
        <header className="app-header">
          <div className="app-brand">
            <Logo />
          </div>

          <button className="app-ghost" onClick={onLogout}>
            Salir
          </button>
        </header>

        <main className="app-main">
          <section className="app-card">
            <h1 className="app-title">Bienvenido{user?.email ? `, ${user.email}` : ""}</h1>
            <p className="app-subtitle">
              Este es el panel inicial. Desde aquí iremos habilitando los módulos del proceso.
            </p>

            <div className="app-grid">
              <div className="app-tile">
                <h3>1) Iniciar proceso</h3>
                <p>Cargar/validar datos del equipo y configurar la sesión.</p>
                <button className="app-primary" disabled>
                  Próximamente
                </button>
              </div>

              <div className="app-tile">
                <h3>2) Seguimiento</h3>
                <p>Ver progreso, pendientes y próximos pasos.</p>
                <button className="app-primary" disabled>
                  Próximamente
                </button>
              </div>

              <div className="app-tile">
                <h3>3) Reportes</h3>
                <p>Descargar reportes y evidencia del proceso.</p>
                <button className="app-primary" disabled>
                  Próximamente
                </button>
              </div>
            </div>

            <footer className="app-footer">
              <span>
                ¿Necesita ayuda? Escriba a{" "}
                <a href="mailto:integracion@germanretana.com">integracion@germanretana.com</a>
              </span>
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
}
