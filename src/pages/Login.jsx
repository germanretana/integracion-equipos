import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";
import { auth } from "../services/auth";

const backgrounds = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!isValidEmail(email)) {
      setError("Por favor ingrese un correo electrónico válido.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      await auth.login(email, password);
      navigate("/app", { replace: true });
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
              Ingrese su usuario y contraseña.
            </p>

            <form onSubmit={onSubmit} noValidate>
              <input
                type="text"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button className="primary" type="submit" disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>

            {error && (
              <p style={{ margin: "10px 0 0 0", color: "#ff668f" }}>
                {error}
              </p>
            )}

            <Link to="/forgot" className="secondary-link">
              Olvidé mi contraseña / Restablecer
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
