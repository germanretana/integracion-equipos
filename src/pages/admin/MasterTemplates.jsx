import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../services/auth";
import Markdown from "../../components/Markdown";
import "../../styles/admin.css";

function Tab({ active, children, onClick }) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      style={{
        opacity: active ? 1 : 0.75,
        borderColor: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)",
        background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
        fontWeight: active ? 900 : 800,
      }}
    >
      {children}
    </button>
  );
}

export default function MasterTemplates() {
  const navigate = useNavigate();

  const [kind, setKind] = React.useState("c1"); // c1 | c2
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");

  const [instructionsMd, setInstructionsMd] = React.useState("");

  function handleLogout() {
    auth.clearAdminSession();
    navigate("/admin/login", { replace: true });
  }

  async function load(k) {
    setLoading(true);
    setError("");
    try {
      const tpl = await auth.fetch(`/api/admin/base-templates/${k}`);
      setInstructionsMd(tpl?.instructionsMd || "");
    } catch (e) {
      setError(e?.message || "No se pudo cargar la plantilla.");
      setInstructionsMd("");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      await auth.fetch(`/api/admin/base-templates/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ instructionsMd }),
      });
      setFlash("Plantilla guardada.");
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === "c1" ? "Plantilla Maestra — C1" : "Plantilla Maestra — C2";

  const subtitle =
    kind === "c1"
      ? "Estas instrucciones se copiarán a cada proceso nuevo (C1)."
      : "Estas instrucciones se copiarán a cada proceso nuevo (C2).";

  return (
    <div className="page">
      <div className="page-inner">
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Link to="/admin/processes" className="btn">
            {"<"} Volver
          </Link>

          <button className="btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 className="h1" style={{ margin: 0 }}>
              {title}
            </h1>
            <p className="sub" style={{ marginTop: 6 }}>
              {subtitle}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Tab active={kind === "c1"} onClick={() => setKind("c1")}>
              C1
            </Tab>
            <Tab active={kind === "c2"} onClick={() => setKind("c2")}>
              C2
            </Tab>
            <button className="btn" onClick={onSave} disabled={saving || loading}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>

        {loading && <p className="sub">Cargando…</p>}
        {error && <div className="error">{error}</div>}
        {flash && !error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.90)",
              fontSize: 13,
            }}
          >
            {flash}
          </div>
        )}

        {/* Editor + Preview */}
        {!loading && (
          <div
            className="section"
            style={{ marginTop: 14 }}
          >
            <div className="section-body">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <p className="sub" style={{ marginTop: 0 }}>
                    Markdown
                  </p>
                  <textarea
                    className="admin-textarea"
                    style={{ minHeight: 320 }}
                    value={instructionsMd}
                    onChange={(e) => setInstructionsMd(e.target.value)}
                    placeholder="Escribí aquí las instrucciones en Markdown…"
                  />
                  <p className="sub" style={{ marginTop: 10, opacity: 0.8 }}>
                    Tip: podés usar títulos, listas y **negritas**.
                  </p>
                </div>

                <div>
                  <p className="sub" style={{ marginTop: 0 }}>
                    Preview
                  </p>
                  <div
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.22)",
                      padding: 12,
                      minHeight: 320,
                    }}
                  >
                    <Markdown text={instructionsMd || ""} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button className="btn" onClick={onSave} disabled={saving || loading}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => load(kind)}
                  disabled={saving || loading}
                >
                  Recargar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nota */}
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            opacity: 0.65,
            lineHeight: 1.4,
          }}
        >
          Nota: los procesos ya creados mantienen sus propias plantillas. Estas
          plantillas maestras afectan únicamente a procesos nuevos.
        </div>
      </div>
    </div>
  );
}
