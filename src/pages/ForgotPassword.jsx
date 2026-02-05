import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";
import { auth } from "../services/auth";

const backgrounds = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setOk(false);

    if (!isValidEmail(email)) {
      setError("Por favor ingrese un correo electrónico válido.");
      return;
    }

    setLoading(true);
    try {
      await auth.requestPasswordReset(email);
      setOk(true);
    } catch (err) {
      setError(err?.message || "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

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
              Ingrese su correo y le enviaremos instrucciones para restablecer su contraseña.
            </p>

            <form onSubmit={onSubmit}>
              <input
                type="text"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <button className="primary" type="submit" disabled={loading}>
                {loading ? "Enviando..." : "Enviar instrucciones"}
              </button>
            </form>

            {ok && (
              <p style={{ margin: "10px 0 0 0" }}>
                Listo. Si el correo existe, recibirá instrucciones en breve.
              </p>
            )}

            {error && (
              <p style={{ margin: "10px 0 0 0", color: "#ff668f" }}>
                {error}
              </p>
            )}

            <Link to="/login" className="secondary-link">
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
