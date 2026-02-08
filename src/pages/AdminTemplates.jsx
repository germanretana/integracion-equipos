import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/admin.css";
import "../styles/questionnaires.css";
import { adminAuth, adminFetch } from "../services/admin";

function normalizeInstructions(ins) {
  return {
    title: ins?.title || "",
    paragraphs: Array.isArray(ins?.paragraphs) ? ins.paragraphs : [],
    bullets: Array.isArray(ins?.bullets) ? ins.bullets : [],
    closing: ins?.closing || ""
  };
}

function TextListEditor({ label, items, onChange, placeholder }) {
  const [draft, setDraft] = useState("");

  return (
    <div style={{ marginTop: 8 }}>
      <div className="admin-label">{label}</div>

      {items.length === 0 ? <p className="admin-note">No hay elementos.</p> : null}

      {items.map((t, idx) => (
        <div key={idx} className="admin-row">
          <input
            className="admin-input"
            value={t}
            onChange={(e) => {
              const next = items.slice();
              next[idx] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
          />
          <button
            className="admin-btn"
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            title="Eliminar"
          >
            Eliminar
          </button>
        </div>
      ))}

      <div className="admin-row" style={{ marginTop: 12 }}>
        <input
          className="admin-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
        />
        <button
          className="admin-btn"
          type="button"
          onClick={() => {
            const val = draft.trim();
            if (!val) return;
            onChange([...items, val]);
            setDraft("");
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

export default function AdminTemplates() {
  const navigate = useNavigate();
  const admin = adminAuth.getAdmin();

  const [tab, setTab] = useState("c1"); // "c1" | "c2"
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [templates, setTemplates] = useState({ c1: null, c2: null });

  const current = useMemo(() => templates?.[tab], [templates, tab]);

  const [ins, setIns] = useState(() => normalizeInstructions(null));

  // cargar templates
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [c1, c2] = await Promise.all([
          adminFetch("/api/admin/templates/c1"),
          adminFetch("/api/admin/templates/c2")
        ]);
        if (!alive) return;
        setTemplates({ c1, c2 });
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar las plantillas.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // cuando cambia tab o cambia template cargado, setear instrucciones en editor
  useEffect(() => {
    setOkMsg("");
    setError("");
    setIns(normalizeInstructions(current?.instructions));
  }, [tab, current]);

  function logout() {
    adminAuth.logout();
    navigate("/admin/login", { replace: true });
  }

  async function save() {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const updated = await adminFetch(`/api/admin/templates/${tab}`, {
        method: "PUT",
        body: {
          ...current,
          instructions: ins
        }
      });

      setTemplates((prev) => ({ ...prev, [tab]: updated }));
      setOkMsg("Guardado.");
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="admin-wrap">
        <div className="admin-top">
          <div className="topbar-left">
            <img className="brand-logo brand-logo--lg" src="/brand/integracion-plateado.png" alt="" />
          </div>

          <div className="admin-actions">
            <span className="admin-note">{admin?.email || "Administrador"}</span>
            <button className="admin-btn" type="button" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <h1 className="h1" style={{ marginTop: 10 }}>
          Plantillas
        </h1>
        <p className="sub">Edite instrucciones y preguntas base para C1 y C2 (por ahora globales).</p>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${tab === "c1" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("c1")}
          >
            C1
          </button>
          <button
            className={`admin-tab ${tab === "c2" ? "active" : ""}`}
            type="button"
            onClick={() => setTab("c2")}
          >
            C2
          </button>
        </div>

        {loading ? <p className="admin-note">Cargando…</p> : null}
        {error ? <div className="error">{error}</div> : null}
        {okMsg ? <div className="ok">{okMsg}</div> : null}

        {!loading && current ? (
          <div className="admin-card">
            <div className="admin-card-head">
              <h2 className="section-title" style={{ padding: 0 }}>
                Instrucciones ({tab.toUpperCase()})
              </h2>
            </div>

            <div className="admin-card-body">
              <div className="admin-label">Título</div>
              <input
                className="admin-input"
                value={ins.title}
                onChange={(e) => setIns((p) => ({ ...p, title: e.target.value }))}
              />

              <TextListEditor
                label="Párrafos"
                items={ins.paragraphs}
                onChange={(next) => setIns((p) => ({ ...p, paragraphs: next }))}
                placeholder="Escriba un párrafo…"
              />

              <TextListEditor
                label="Bullets"
                items={ins.bullets}
                onChange={(next) => setIns((p) => ({ ...p, bullets: next }))}
                placeholder="Escriba un bullet…"
              />

              <div className="admin-label">Cierre (opcional)</div>
              <textarea
                className="admin-textarea"
                value={ins.closing}
                onChange={(e) => setIns((p) => ({ ...p, closing: e.target.value }))}
                placeholder="Texto de cierre…"
              />

              <div className="admin-row" style={{ marginTop: 14, justifyContent: "space-between" }}>
                <span className="admin-note">Se guardará en el backend (db.json).</span>
                <button className="admin-btn" type="button" onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <p className="footer-help" style={{ marginTop: 18 }}>
          Si tiene alguna duda o consulta, escriba a{" "}
          <a href="mailto:integracion@germanretana.com">integracion@germanretana.com</a>
        </p>
      </div>
    </div>
  );
}
