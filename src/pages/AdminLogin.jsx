import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import "../styles/auth.css";
import { adminAuth } from "../services/admin";

const backgrounds = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const passwordRef = useRef(null);

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

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await adminAuth.login(email, password);
      navigate("/admin/processes", { replace: true });
    } catch (err) {
      setError(err?.message || "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{ backgroundImage: `url(/backgrounds/${bg}.jpg)` }}>
      <div className="auth-overlay" />

      <div className="auth-content">
        <div className="auth-inner">
          <Logo />

          <div className="auth-card">
            <p className="auth-instructions">Acceso de administrador</p>

            <form onSubmit={onSubmit} noValidate>
              <input
                type="text"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    passwordRef.current?.focus();
                  }
                }}
              />

              <input
                ref={passwordRef}
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button className="primary" type="submit" disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>

            {error && <p style={{ margin: "10px 0 0 0", color: "#ff668f" }}>{error}</p>}

            <p className="auth-help">
              Si necesita ayuda, escriba a{" "}
              <a href="mailto:integracion@germanretana.com">integracion@germanretana.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
