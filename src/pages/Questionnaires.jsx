import { Link } from "react-router-dom";
import "../styles/questionnaires.css";

function StatusPill({ status }) {
  if (status === "done") return <span className="pill ok">Completado</span>;
  if (status === "progress") return <span className="pill warn">En progreso</span>;
  return <span className="pill muted">Sin comenzar</span>;
}

function Row({ to, title, status }) {
  return (
    <Link className="row-link" to={to}>
      <div className="row" role="button">
        <div className="row-left">
          <p className="row-title">{title || "—"}</p>
        </div>

        <div className="row-right">
          <StatusPill status={status} />
          <span className="chev">{">"}</span>
        </div>
      </div>
    </Link>
  );
}

export default function Questionnaires() {
  // TODO: esto vendrá del backend por proceso
  const c1 = {
    title: "Cuestionario general sobre el equipo gerencial",
    status: "todo",
    to: "/app/c1"
  };

  // Mock explícito y claro
  const c2 = [
    { id: "ana-lopez", label: "Ana López", status: "done" },
    { id: "carlos-mendez", label: "Carlos Méndez", status: "progress" },
    { id: "laura-jimenez", label: "Laura Jiménez", status: "todo" },
    { id: "diego-vargas", label: "Diego Vargas", status: "todo" }
  ];

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="h1">Cuestionarios</h1>

        <p className="sub">
          Muchas gracias por contestar estos cuestionarios. Su aporte será esencial
          para el éxito del proceso de integración del Equipo Gerencial.
        </p>

        <div className="section">
          <h2 className="section-title">Retroalimentación del equipo (C1)</h2>
          <div className="section-body">
            <Row to={c1.to} title={c1.title} status={c1.status} />
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">Retroalimentación a compañeros (C2)</h2>
          <div className="section-body">
            {c2.map((p) => (
              <Row
                key={p.id}
                to={`/app/c2/${p.id}`}
                title={p.label}
                status={p.status}
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
      </div>
    </div>
  );
}
