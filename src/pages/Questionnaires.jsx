import { Link } from "react-router-dom";
import "../styles/questionnaires.css";

const C1_STORAGE_KEY = "itss_integracion_c1_v1";

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getC1State() {
  const data = loadJson(C1_STORAGE_KEY);
  if (!data) return { status: "todo", pct: 0 };
  if (data?.submittedAt) return { status: "done", pct: 100 };

  const answers = data?.answers || {};
  const requiredIds = ["c1_q1_rating", "c1_q2_single", "c1_q3_multi", "c1_q4_text", "c1_q5_text"];
  const answered = requiredIds.filter((id) => {
    const v = answers[id];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "number") return true;
    if (typeof v === "string") return v.trim().length > 0;
    return false;
  }).length;

  const pct = Math.round((answered / requiredIds.length) * 100);
  if (pct === 0) return { status: "todo", pct: 0 };
  return { status: "progress", pct };
}

function getC2State(peerSlug) {
  const key = `itss_integracion_c2_${peerSlug}_v1`;
  const data = loadJson(key);
  if (!data) return { status: "todo", pct: 0 };
  if (data?.submittedAt) return { status: "done", pct: 100 };

  const answers = data?.answers || {};
  const requiredIds = ["c2_q1_rating", "c2_q2_rating", "c2_q3_single", "c2_q4_text", "c2_q5_text"];
  const answered = requiredIds.filter((id) => {
    const v = answers[id];
    if (typeof v === "number") return true;
    if (typeof v === "string") return v.trim().length > 0;
    return false;
  }).length;

  const pct = Math.round((answered / requiredIds.length) * 100);
  if (pct === 0) return { status: "todo", pct: 0 };
  return { status: "progress", pct };
}

function StatusPill({ status, pct }) {
  if (status === "done") return <span className="pill ok">Completado</span>;
  if (status === "progress") return <span className="pill warn">En progreso ({pct}%)</span>;
  return <span className="pill muted">Sin comenzar</span>;
}

function Row({ to, title, desc, status, pct }) {
  return (
    <Link className="row-link" to={to}>
      <div className="row">
        <div className="row-left">
          <p className="row-title">{title}</p>
          {desc && <p className="row-desc">{desc}</p>}
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
  const c1 = getC1State();

  const c2People = [
    { name: "Ana López", slug: "ana-lopez" },
    { name: "Carlos Méndez", slug: "carlos-mendez" },
    { name: "Laura Jiménez", slug: "laura-jimenez" },
    { name: "Diego Vargas", slug: "diego-vargas" },
  ].map((p) => {
    const st = getC2State(p.slug);
    return { ...p, ...st, to: `/app/c2/${p.slug}` };
  });

  return (
    <div className="page">
      <div className="page-inner">
        <div className="topbar">
          <div className="topbar-left">
            <img className="brand-logo brand-logo--lg" src="/brand/integracion-plateado.png" alt="" />
          </div>
          <div className="nav">
            <span className="nav-label active">Cuestionarios</span>
          </div>
        </div>

        <h1 className="h1">Cuestionarios</h1>

        <div className="section">
          <div className="section-body">
            <p className="row-desc">
              Muchas gracias por participar en este proceso de retroalimentación. Su aporte será
              esencial para el éxito del proceso de integración del Equipo Gerencial de
              <b> &lt;nombre de la empresa&gt;</b>.
            </p>

            <ul className="row-desc" style={{ paddingLeft: 18, marginTop: 10 }}>
              <li>
                El cuestionario de <b>Retroalimentación del equipo (C1)</b> debe ser contestado
                <b> una sola vez</b>.
              </li>
              <li>
                Los cuestionarios de <b>Retroalimentación a compañeros (C2)</b> requieren que usted
                complete <b>uno por cada colega</b> del equipo.
              </li>
            </ul>

            <p className="row-desc" style={{ marginTop: 10 }}>
              Le agradecemos expresar sus perspectivas con la mayor objetividad y profundidad
              posibles, en beneficio de la organización y del nivel gerencial.
            </p>

            <p className="row-desc" style={{ marginTop: 6 }}>
              Este proceso garantiza el <b>anonimato</b> y la <b>consideración real</b> de todas las
              respuestas.
            </p>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">Retroalimentación del equipo (C1)</h2>
          <div className="section-body">
            <Row
              to="/app/c1"
              title="Cuestionario general sobre el equipo gerencial"
              desc="Evaluación del desempeño global del equipo."
              status={c1.status}
              pct={c1.pct}
            />
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">Retroalimentación a compañeros (C2)</h2>
          <div className="section-body">
            {c2People.map((p) => (
              <Row key={p.slug} {...p} />
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
