import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../../components/Logo";
import "../../styles/auth.css";
import { auth } from "../../services/auth";

export default function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await auth.loginAdmin(email, password);
      navigate("/admin/processes", { replace: true });
    } catch (err) {
      setError(err?.message || "Credenciales inválidas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-overlay" />

      <div className="auth-content">
        <div className="auth-inner">
          <Logo />

          <div className="auth-card">
            <p className="auth-instructions">Acceso de administrador.</p>

            <form onSubmit={onSubmit} noValidate>
              <input
                type="email"
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
                {loading ? "Ingresando…" : "Ingresar"}
              </button>
            </form>

            {error ? (
              <p style={{ margin: "10px 0 0 0", color: "#ff668f" }}>{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
