import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";

const backgrounds = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

export default function ForgotPassword() {
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
              Ingrese su correo electrónico y le enviaremos instrucciones
              para restablecer su contraseña.
            </p>

            <input
              type="email"
              placeholder="Correo electrónico"
            />

            <button className="primary">
              Enviar instrucciones
            </button>

            <Link to="/" className="secondary-link">
              Volver al inicio de sesión
            </Link>

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
