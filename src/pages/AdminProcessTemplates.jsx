import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/admin.css";
import "../styles/questionnaires.css";
import { adminFetch } from "../services/admin";
import Markdown from "../components/Markdown";

export default function AdminProcessTemplates() {
  const { processSlug } = useParams();

  const [tab, setTab] = useState("c1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [templates, setTemplates] = useState({ c1: null, c2: null });
  const current = useMemo(() => templates?.[tab], [templates, tab]);

  const [md, setMd] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      setOk("");
      try {
        const [c1, c2] = await Promise.all([
          adminFetch(`/api/admin/processes/${processSlug}/templates/c1`),
          adminFetch(`/api/admin/processes/${processSlug}/templates/c2`)
        ]);
        if (!alive) return;
        setTemplates({ c1, c2 });
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "No se pudieron cargar las plantillas del proceso.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [processSlug]);

  useEffect(() => {
    setOk("");
    setError("");
    setMd(typeof current?.instructionsMd === "string" ? current.instructionsMd : "");
  }, [tab, current]);

  async function save() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const updated = await adminFetch(`/api/admin/processes/${processSlug}/templates/${tab}`, {
        method: "PUT",
        body: {
          ...current,
          instructionsMd: md
        }
      });

      setTemplates((prev) => ({ ...prev, [tab]: updated }));
      setOk("Guardado.");
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
          <Link className="admin-btn" to={`/admin/processes/${processSlug}`}>
            Volver
          </Link>
        </div>

        <h1 className="h1">Plantillas — {processSlug}</h1>

        <p className="sub">
          Edite las instrucciones para cada cuestionario usando sintaxis Markdown.
          Use <b>-</b> para viñetas, <b>*itálica*</b> y <b>**negrita**</b>.
        </p>

        <div className="admin-tabs">
          <button className={`admin-tab ${tab === "c1" ? "active" : ""}`} onClick={() => setTab("c1")}>
            C1
          </button>
          <button className={`admin-tab ${tab === "c2" ? "active" : ""}`} onClick={() => setTab("c2")}>
            C2
          </button>
        </div>

        {loading && <p className="admin-note">Cargando…</p>}
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok">{ok}</div>}

        {!loading && current && (
          <div className="admin-card">
            <div className="admin-card-body">
              <textarea
                style={{ minHeight: 220 }}
                value={md}
                onChange={(e) => setMd(e.target.value)}
                placeholder="Escriba aquí las instrucciones…"
              />

              <div className="admin-row" style={{ justifyContent: "space-between", marginTop: 12 }}>
                <span className="admin-note">Se guarda dentro del proceso.</span>
                <button className="admin-btn" onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="admin-label">Vista previa</div>
                <div className="admin-card" style={{ marginTop: 6 }}>
                  <div className="admin-card-body">
                    <Markdown text={md} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
