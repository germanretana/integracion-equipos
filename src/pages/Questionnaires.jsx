import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "../styles/questionnaires.css";
import { auth } from "../services/auth";

function StatusPill({ status, percent }) {
  if (status === "done")
    return <span className="pill pill-ok">Completado</span>;
  if (status === "progress")
    return (
      <span className="pill pill-warn">En progreso ({percent || 0}%)</span>
    );
  return <span className="pill muted">Sin comenzar</span>;
}

function Row({ to, title, status, percent }) {
  return (
    <Link className="row-link" to={to}>
      <div className="row" role="button">
        <div className="row-left">
          <p className="row-title">{title || "—"}</p>
        </div>

        <div className="row-right">
          <StatusPill status={status} percent={percent} />
          <span className="chev">{">"}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Questionnaires() {
  const navigate = useNavigate();
  const { processSlug } = useParams();
  const session = auth.getSession();
  const participantName = session?.participant?.name || "—";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await auth.fetch(`/api/app/${processSlug}/questionnaires`);
        if (!alive) return;
        setData(res);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar los cuestionarios.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [processSlug]);

  function onLogout() {
    auth.logoutParticipant();
    navigate("/", { replace: true });
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="p-topbar">
          <h1 className="h1 p-topbar-left" style={{ margin: 0 }}>
            Cuestionarios
          </h1>

          <div className="p-topbar-center">
            Participante: <strong>{participantName}</strong>
          </div>

          <div className="p-topbar-right">
            <button className="admin-btn" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>

        {loading ? <p className="sub">Cargando…</p> : null}
        {error ? <div className="error">{error}</div> : null}

        {!loading && data ? (
          <>
            <p className="sub">
              Muchas gracias por contestar estos cuestionarios. Su aporte será
              esencial para el éxito del proceso de integración del Equipo
              Gerencial de <b>{data.process.companyName}</b>.
            </p>

            <div className="section">
              <h2 className="section-title">
                Retroalimentación del equipo (C1)
              </h2>
              <div className="section-body">
                <Row
                  to={data.c1.to}
                  title={data.c1.title}
                  status={data.c1.status}
                  percent={data.c1.percent}
                />
              </div>
            </div>

            <div className="section">
              <h2 className="section-title">
                Retroalimentación a compañeros (C2)
              </h2>
              <div className="section-body">
                {data.c2.map((p) => (
                  <Row
                    key={p.to}
                    to={p.to}
                    title={p.title}
                    status={p.status}
                    percent={p.percent}
                  />
                ))}
              </div>
            </div>

            <p className="footer-help">
              Si tiene alguna duda o consulta, escriba a{" "}
              <a href="mailto:integracion@germanretana.com">
                integracion@germanretana.com
              </a>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
