import { Link, NavLink } from "react-router-dom";
import "../styles/questionnaires.css";

const C1_STORAGE_KEY = "itss_integracion_c1_v1";

function getC1Status() {
  try {
    const raw = localStorage.getItem(C1_STORAGE_KEY);
    if (!raw) return { status: "todo", pct: 0 };
    const data = JSON.parse(raw);

    if (data?.submittedAt) return { status: "done", pct: 100 };

    const answers = data?.answers || {};
    const requiredIds = ["c1_q1_rating", "c1_q2_single", "c1_q3_multi", "c1_q4_text", "c1_q5_text"];

    const answered = requiredIds.filter((id) => {
      const v = answers[id];
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "number") return true;
      if (typeof v === "string") return v.trim().length > 0;
      return v !== null && v !== undefined && v !== "";
    }).length;

    const pct = Math.round((answered / requiredIds.length) * 100);
    if (pct === 0) return { status: "todo", pct: 0 };
    return { status: "progress", pct };
  } catch {
    return { status: "todo", pct: 0 };
  }
}

function StatusPill({ status, pct }) {
  if (status === "done") return <span className="pill ok">Completado</span>;
  if (status === "progress") return <span className="pill warn">En progreso ({pct}%)</span>;
  return <span className="pill muted">Sin comenzar</span>;
}

function Row({ to, title, desc, status, pct }) {
  return (
    <Link className="row-link" to={to}>
      <div className="row" role="button">
        <div className="row-left">
          <p className="row-title">{title}</p>
          {desc ? <p className="row-desc">{desc}</p> : null}
        </div>

        <div className="row-right">
          <StatusPill status={status} pct={pct} />
          <span className="chev">{">"}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Questionnaires() {
  const c1State = getC1Status();

  const c1 = {
    title: "Cuestionario general sobre el equipo gerencial",
    desc: "Complete este cuestionario antes de continuar con C2.",
    status: c1State.status,
    pct: c1State.pct,
    to: "/app/c1",
  };

  // TODO: luego conectamos esto a mock real por participante (N-1)
  const c2 = [
    { name: "Ana López", status: "todo", pct: 0, to: "/app/c2/ana-lopez" },
    { name: "Carlos Méndez", status: "todo", pct: 0, to: "/app/c2/carlos-mendez" },
    { name: "Laura Jiménez", status: "todo", pct: 0, to: "/app/c2/laura-jimenez" },
    { name: "Diego Vargas", status: "todo", pct: 0, to: "/app/c2/diego-vargas" },
  ];

  return (
    <div className="page">
      <div className="page-inner">
        <div className="topbar">
          <div className="topbar-left">
            <img
              className="brand-logo"
              src="/brand/integracion-plateado.png"
              alt="Integración de Equipos Gerenciales"
            />
          </div>

          <div className="nav">
            <NavLink
              to="/app/questionnaires"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Inicio
            </NavLink>
            <NavLink
              to="/app/questionnaires"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Cuestionarios
            </NavLink>
          </div>
        </div>

        <h1 className="h1">Cuestionarios</h1>
        <p className="sub">
          Complete primero la <b>Retroalimentación del Equipo (C1)</b> y luego la{" "}
          <b>Retroalimentación a Compañeros (C2)</b>.
        </p>

        <div className="section">
          <h2 className="section-title">Retroalimentación del equipo (C1)</h2>
          <div className="section-body">
            <Row to={c1.to} title={c1.title} desc={c1.desc} status={c1.status} pct={c1.pct} />
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">Retroalimentación a compañeros (C2)</h2>
          <div className="section-body">
            {c2.map((p) => (
              <Row key={p.to} to={p.to} title={p.name} desc={null} status={p.status} pct={p.pct} />
            ))}
          </div>
        </div>

        <p className="footer-help">
          Si tiene alguna duda o consulta, escriba a{" "}
          <a href="mailto:integracion@germanretana.com">integracion@germanretana.com</a>
        </p>
      </div>
    </div>
  );
}
