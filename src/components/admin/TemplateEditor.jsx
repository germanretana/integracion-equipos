import React, { useState, useEffect } from "react";
import Markdown from "../../components/Markdown";
import "../../styles/admin.css";
import QuestionnaireRenderer from "../../components/QuestionnaireRenderer";
import { auth } from "../../services/auth";

const SCHEMA_VERSION = 1;

function truncate(text, max = 60) {
  if (!text) return "";
  const clean = text.replace(/<[^>]+>/g, "");
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function TemplateEditor({
  title,
  subtitle,
  loadUrl,
  saveUrl,
  headerRight = null, // e.g. tabs
  note = null, // optional override
}) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [flash, setFlash] = React.useState("");

  const [instructionsMd, setInstructionsMd] = React.useState("");
  const [questions, setQuestions] = React.useState([]);

  const [previewMode, setPreviewMode] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState({});

  useEffect(() => {
    if (!previewMode) return;
    setPreviewAnswers({});
  }, [questions, previewMode]);

  function addQuestion() {
    const nextOrder =
      questions.length === 0
        ? 1
        : Math.max(...questions.map((q) => Number(q.order) || 0)) + 1;

    const newId = `new-${Date.now()}`;

    const newQuestion = {
      schemaVersion: SCHEMA_VERSION,
      id: newId,
      order: nextOrder,
      item: "",
      type: "text_area",
      minEntries: 1,
      maxEntries: 1,
      explanation: null,
      condition: null,
      groupId: null,
      dependsOn: null,
      meta: null,
    };

    setQuestions((prev) => [...prev, newQuestion]);
  }

  function removeQuestion(id) {
    if (!window.confirm("¿Eliminar esta pregunta?")) return;
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function moveQuestion(index, direction) {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newQuestions.length) {
        return prev; // no se mueve fuera de límites
      }

      const temp = newQuestions[index];
      newQuestions[index] = newQuestions[targetIndex];
      newQuestions[targetIndex] = temp;

      return newQuestions;
    });
  }

  function updateQuestionField(id, field, value) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );
  }

  function updateDependsOn(id, field, value) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;

        const current = q.dependsOn || {};

        return {
          ...q,
          dependsOn: {
            ...current,
            [field]: value,
          },
        };
      }),
    );
  }

  /* Funciones para grids (o tablas de preguntas) */
  function updateGridItem(qId, itemIndex, field, value) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const items = Array.isArray(q.items) ? q.items.slice() : [];
        if (!items[itemIndex]) return q;

        items[itemIndex] = {
          ...items[itemIndex],
          [field]: value,
        };

        return { ...q, items };
      }),
    );
  }

  /* Dependiendo de si tiene suggestions o no se renderiza como una o dos columnas */
  function updateGridMeta(qId, newMeta) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          meta: {
            ...(q.meta || {}),
            ...newMeta,
          },
        };
      }),
    );
  }

  function addGridItem(qId) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const items = Array.isArray(q.items) ? q.items.slice() : [];
        items.push({
          id: `${qId}-${items.length + 1}`,
          text: "",
        });
        return { ...q, items };
      }),
    );
  }

  function removeGridItem(qId, index) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const items = Array.isArray(q.items) ? q.items.slice() : [];
        items.splice(index, 1);
        return { ...q, items };
      }),
    );
  }

  async function fetchTemplate() {
    setLoading(true);
    setError("");

    try {
      const tpl = await auth.fetch(loadUrl);
      setInstructionsMd(tpl?.instructionsMd || "");
      setQuestions(Array.isArray(tpl?.questions) ? tpl.questions : []);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la plantilla.");
      setInstructionsMd("");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUrl]);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  async function onSave() {
    setSaving(true);
    setError("");

    try {
      // 🔹 Generamos order dinámico según posición en el array
      const questionsWithOrder = questions.map((q, index) => ({
        ...q,
        order: index + 1,
      }));

      await auth.fetch(saveUrl, {
        method: "PUT",
        body: JSON.stringify({
          instructionsMd,
          questions: questionsWithOrder,
        }),
      });

      setFlash("Plantilla guardada.");
    } catch (e) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const qCount = questions.length;

  const defaultNote =
    "Nota: los procesos ya creados mantienen sus propias plantillas. Estas plantillas maestras afectan únicamente a procesos nuevos.";

  return (
    <>
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
          {headerRight}

          <button
            className="btn"
            type="button"
            onClick={fetchTemplate}
            disabled={saving || loading}
          >
            Recargar
          </button>
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
        <>
          <div className="section" style={{ marginTop: 14 }}>
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
                    Instrucciones Generales
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
            </div>
          </div>

          {/* Questions preview */}
          <div className="section" style={{ marginTop: 14 }}>
            <div className="section-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <h2 className="h2" style={{ margin: 0 }}>
                    Preguntas
                  </h2>
                  <p className="sub" style={{ marginTop: 6 }}>
                    Total: <strong>{qCount}</strong>
                  </p>
                </div>

                <button className="btn" type="button" onClick={addQuestion}>
                  + Nueva pregunta
                </button>
              </div>

              {qCount === 0 ? (
                <p className="sub">No hay preguntas configuradas.</p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {questions.map((q, index) => (
                        <tr
                          key={q.id}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <td style={{ padding: "14px 0" }}>
                            <div
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.10)",
                                borderRadius: 16,
                                padding: 16,
                              }}
                            >
                              {/* HEADER LINE — compacto */}
                              <div
                                style={{
                                  display: "flex",
                                  gap: 12,
                                  alignItems: "center",
                                  marginBottom: 14,
                                }}
                              >
                                <div style={{ width: 70 }}>
                                  <div className="admin-field-label">Orden</div>
                                  <input
                                    className="admin-input"
                                    style={{ width: "100%", height: 34 }}
                                    value={index + 1}
                                    disabled
                                  />
                                </div>

                                <div style={{ minWidth: 220 }}>
                                  <div className="admin-field-label">Tipo</div>
                                  <select
                                    className="admin-select"
                                    value={q.type || ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "type",
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="header">header</option>
                                    <option value="input_list">input_list</option>
                                    <option value="text_area">text_area</option>
                                    <option value="binary_yes_no">binary_yes_no</option>
                                    <option value="rating_masc_5">rating_masc_5</option>
                                    <option value="rating_fem_5">rating_fem_5</option>
                                    <option value="value_0_4">value_0_4</option>
                                    <option value="evaluation_0_10">evaluation_0_10</option>
                                    <option value="pairing_rows">pairing_rows</option>
                                    <option value="value_0_4_grid">value_0_4_grid</option>
                                  </select>
                                </div>

                                <div
                                  style={{
                                    marginLeft: "auto",
                                    display: "flex",
                                    gap: 6,
                                  }}
                                >
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => moveQuestion(index, "up")}
                                    disabled={index === 0}
                                    style={{ padding: "4px 8px" }}
                                  >
                                    ↑
                                  </button>

                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => moveQuestion(index, "down")}
                                    disabled={index === questions.length - 1}
                                    style={{ padding: "4px 8px" }}
                                  >
                                    ↓
                                  </button>

                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => removeQuestion(q.id)}
                                    style={{ padding: "4px 8px" }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>

                              {/* TEXTO */}
                              <div style={{ marginBottom: 14 }}>
                                <div className="admin-field-label">
                                  Texto de la pregunta
                                </div>
                                <textarea
                                  className="admin-textarea"
                                  style={{ minHeight: 50 }}
                                  value={q.item || ""}
                                  onChange={(e) =>
                                    updateQuestionField(q.id, "item", e.target.value)
                                  }
                                />
                              </div>

                              {/* GRID */}
                              {q.type === "value_0_4_grid" && (
                                <div
                                  style={{
                                    marginBottom: 14,
                                    padding: 12,
                                    borderRadius: 12,
                                    background: "rgba(0,0,0,0.25)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      marginBottom: 8,
                                    }}
                                  >
                                    <strong>Items del grid</strong>

                                    <label
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                        fontSize: 13,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={
                                          Array.isArray(q.meta?.columns) &&
                                          q.meta.columns.includes("suggestion")
                                        }
                                        onChange={(e) =>
                                          updateGridMeta(q.id, {
                                            columns: e.target.checked
                                              ? ["label", "value", "suggestion"]
                                              : ["label", "value"],
                                          })
                                        }
                                      />
                                      Incluir sugerencias
                                    </label>
                                  </div>

                                  {(Array.isArray(q.items) ? q.items : []).map(
                                    (it, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          display: "flex",
                                          gap: 8,
                                          marginBottom: 6,
                                        }}
                                      >
                                        <input
                                          className="admin-input"
                                          style={{ width: 150, height: 34 }}
                                          value={it.id || ""}
                                          onChange={(e) =>
                                            updateGridItem(
                                              q.id,
                                              idx,
                                              "id",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="id"
                                        />
                                        <input
                                          className="admin-input"
                                          style={{ flex: 1, height: 34 }}
                                          value={it.text || ""}
                                          onChange={(e) =>
                                            updateGridItem(
                                              q.id,
                                              idx,
                                              "text",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="texto"
                                        />
                                        <button
                                          className="btn"
                                          type="button"
                                          onClick={() => removeGridItem(q.id, idx)}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ),
                                  )}

                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => addGridItem(q.id)}
                                  >
                                    + Agregar fila
                                  </button>
                                </div>
                              )}

                              {/* CONFIG SECUNDARIA */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(3, 1fr)",
                                  gap: 12,
                                  marginBottom: 14,
                                }}
                              >
                                <div>
                                  <div className="admin-field-label">
                                    Respuestas mínimas
                                  </div>
                                  <input
                                    className="admin-input"
                                    style={{ width: "100%", height: 34 }}
                                    value={q.minEntries ?? ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "minEntries",
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <div className="admin-field-label">
                                    Respuestas máximas
                                  </div>
                                  <input
                                    className="admin-input"
                                    style={{ width: "100%", height: 34 }}
                                    value={q.maxEntries ?? ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "maxEntries",
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <div className="admin-field-label">Grupo</div>
                                  <input
                                    className="admin-input"
                                    style={{ width: "100%", height: 34 }}
                                    value={q.groupId || ""}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        q.id,
                                        "groupId",
                                        e.target.value || null,
                                      )
                                    }
                                  />
                                </div>
                              </div>

                              {/* DEPENDS ON */}
                              <div>
                                <div className="admin-field-label">
                                  Mostrar solo si:
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 140px",
                                    gap: 10,
                                    marginTop: 4,
                                  }}
                                >
                                  <select
                                    className="admin-select"
                                    value={q.dependsOn?.id || ""}
                                    onChange={(e) =>
                                      updateDependsOn(
                                        q.id,
                                        "id",
                                        e.target.value || null,
                                      )
                                    }
                                  >
                                    <option value="">— sin dependencia —</option>
                                    {questions
                                      .filter(
                                        (p) => p.id !== q.id && p.type !== "header",
                                      )
                                      .map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.order} — {truncate(p.item, 60)}
                                        </option>
                                      ))}
                                  </select>

                                  <input
                                    className="admin-input"
                                    style={{ height: 34 }}
                                    placeholder="igual a"
                                    value={q.dependsOn?.equals || ""}
                                    onChange={(e) =>
                                      updateDependsOn(q.id, "equals", e.target.value)
                                    }
                                    disabled={!q.dependsOn?.id}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Nota global */}
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              opacity: 0.65,
              lineHeight: 1.4,
            }}
          >
            {note || defaultNote}
          </div>

          {/* Preview cuestionario como participante */}
          <div style={{ marginTop: 30 }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setPreviewAnswers({});
                setPreviewMode((v) => !v);
              }}
            >
              {previewMode ? "Cerrar Preview Cuestionario" : "Preview Cuestionario"}
            </button>
          </div>

          {previewMode && (
            <div
              style={{
                marginTop: 20,
                padding: 24,
                borderRadius: 16,
                background: "rgba(80,140,255,0.06)",
                border: "1px solid rgba(80,140,255,0.25)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                👁 Preview como participante
              </div>

              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>
                Este modo no guarda respuestas ni afecta procesos.
              </div>

              <QuestionnaireRenderer
                questions={questions}
                answers={previewAnswers}
                onChange={setPreviewAnswers}
                disabled={false}
                peers={[
                  { id: "p1", name: "Ana López" },
                  { id: "p2", name: "Carlos Méndez" },
                  { id: "p3", name: "Laura Jiménez" },
                ]}
                currentParticipantId="p0"
                missingIds={[]}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
