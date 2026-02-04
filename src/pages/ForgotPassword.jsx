import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";

export default function ForgotPassword() {
  return (
    <div className="auth-container">
      <div className="auth-overlay" />

      <div className="auth-content">
        <div className="auth-inner">
          <Logo />

          <div className="auth-card">
            <p className="auth-instructions">
              Ingrese su correo y le enviaremos una nueva contraseña.
            </p>

            <input type="email" placeholder="Correo electrónico" />

            <button className="primary">Enviar</button>

            <Link to="/login" className="secondary-link">
              Volver a iniciar sesión
            </Link>

            <p className="auth-help">
              ¿Necesita ayuda? Escríbanos a{" "}
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
