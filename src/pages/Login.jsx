import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";

const backgrounds = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

export default function Login() {
  return (
    <div
      className="auth-container"
      style={{ backgroundImage: `url(/backgrounds/${bg}.jpg)` }}
    >
      <div className="auth-overlay" />

      <div className="auth-content">
        <div className="auth-inner">
          <Logo />

          <div className="auth-card">
            <p className="auth-instructions">
              Ingrese con el correo y contraseña que recibió por email.
            </p>

            <input type="email" placeholder="Correo electrónico" />
            <input type="password" placeholder="Contraseña" />

            <button className="primary">Ingresar</button>

            <Link to="/forgot-password" className="secondary-link">
              ¿Olvidó su contraseña?
            </Link>

            <p className="auth-help">
              Si necesita ayuda para acceder, escriba a{" "}
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
