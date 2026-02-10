import fs from "fs";

const file = "src/components/QuestionnaireRenderer.jsx";
let src = fs.readFileSync(file, "utf8");

function mustFind(needle, name) {
  const i = src.indexOf(needle);
  if (i === -1) throw new Error(`No encontré: ${name}`);
  return i;
}

function insertAfter(needle, block, name) {
  const i = mustFind(needle, name);
  const j = i + needle.length;
  src = src.slice(0, j) + block + src.slice(j);
}

// 1) Helpers: detectar C1 q8 header + items
if (!src.includes("function isC1Q8HeaderId")) {
  insertAfter(
    "function isC2Q9HeaderId(id) {\n  const x = String(id || \"\");\n  return /^c2-9$/i.test(x) || /^c2\\.q9$/i.test(x);\n}\n",
    `\nfunction isC1Q8HeaderId(id) {\n  const x = String(id || \"\");\n  return /^c1-8$/i.test(x) || /^c1\\.q8$/i.test(x);\n}\n\nfunction isC1Q8ValueId(id) {\n  const x = String(id || \"\");\n  // c1-8a ... c1-8y (una letra)\n  return /^c1-8[a-z]$/i.test(x) || /^c1\\.q8\\.[a-z]$/i.test(x);\n}\n`,
    "helpers insert (after isC2Q9HeaderId)"
  );
}

// 2) Renderer especial para un item de C1 q8 (3 columnas)
if (!src.includes("function renderValue04C1Q8Row")) {
  insertAfter(
    "function renderValue04Compact(q) {\n",
    `function renderValue04C1Q8Row(q) {\n    const curRaw = answers?.[q.id];\n    const cur = curRaw && typeof curRaw === \"object\" ? curRaw : {};\n    const val = cur && typeof cur === \"object\" ? cur.value : null;\n    const sug = cur && typeof cur === \"object\" ? String(cur.suggestion || \"\") : \"\";\n\n    const valNum = Number.isFinite(val) ? val : null;\n    const missing = missingSet.has(String(q.id));\n\n    function autoGrow(el) {\n      if (!el) return;\n      el.style.height = \"auto\";\n      el.style.height = `${el.scrollHeight}px`;\n    }\n\n    return (\n      <div className={\"c1q8-item\" + (missing ? \" missing\" : \"\")} data-qid={q.id}>\n        <div className=\"c1q8-labelWrap\">\n          <p className=\"c1q8-label\"><Html html={qText(q)} /></p>\n        </div>\n\n        <div className=\"c1q8-control\">\n          <input\n            className=\"admin-input\"\n            disabled={disabled}\n            inputMode=\"numeric\"\n            value={valNum == null ? \"\" : String(valNum)}\n            placeholder=\"0 a 4\"\n            onChange={(e) => {\n              const nextVal = e.target.value === \"\" ? null : clampInt(e.target.value, 0, 4);\n              setAnswer(q.id, { value: nextVal, suggestion: sug });\n            }}\n          />\n        </div>\n\n        <div className=\"c1q8-suggestion\">\n          <textarea\n            disabled={disabled}\n            value={sug}\n            rows={1}\n            placeholder={q.explanationLabel || \"Sugerencias para mejorar (opcional)\"}\n            style={{ resize: \"none\", overflow: \"hidden\" }}\n            onInput={(e) => autoGrow(e.currentTarget)}\n            onChange={(e) => {\n              const next = e.target.value;\n              setAnswer(q.id, { value: valNum, suggestion: next });\n            }}\n            ref={(el) => {\n              // al montar/actualizar, ajustar altura según contenido existente\n              if (el) autoGrow(el);\n            }}\n          />\n          {missing ? (\n            <div className=\"c1q8-help\" style={{ color: \"#ff668f\", opacity: 1 }}>\n              Falta completar esta pregunta\n            </div>\n          ) : null}\n        </div>\n      </div>\n    );\n  }\n\n  `,
    "insert renderValue04C1Q8Row before renderValue04Compact"
  );
}

// 3) Special layout detection: agregar hasC1Q8
if (!src.includes("const hasC1Q8")) {
  insertAfter(
    "const hasC2Q9 = React.useMemo(() => {\n    return (questions || []).some((q) => isC2Q9HeaderId(q?.id) || isC2Q9Id(q?.id));\n  }, [questions]);\n",
    `\n  const hasC1Q8 = React.useMemo(() => {\n    return (questions || []).some((q) => isC1Q8HeaderId(q?.id) || isC1Q8ValueId(q?.id));\n  }, [questions]);\n`,
    "insert hasC1Q8 after hasC2Q9"
  );
}

// 4) rendered useMemo: soportar C2Q9 y C1Q8 en el mismo recorrido
//    Reemplazamos solo la primera línea del guard: if (!hasC2Q9) return null;
src = src.replace(
  "if (!hasC2Q9) return null;",
  "if (!hasC2Q9 && !hasC1Q8) return null;"
);

// 5) Dentro del while loop, agregamos bloque para header c1-8
if (!src.includes("Detect header for c1-8")) {
  const needle = "      // Detect header for c2-9";
  const idx = mustFind(needle, "loop insertion point for c1-8 block");
  const block = `\n      // Detect header for c1-8 (C1.q8)\n      if (isC1Q8HeaderId(id) && type === \"header\") {\n        out.push(\n          <MissingWrap key={id} qid={id} missing={false}>\n            {renderHeader({ ...q, id })}\n          </MissingWrap>\n        );\n\n        const items = [];\n        i += 1;\n        while (i < qs.length) {\n          const q2 = qs[i];\n          const id2 = String(q2?.id || q2?.key || `${i}`);\n          const type2 = normalizeType(q2?.type);\n          if (!isC1Q8ValueId(id2)) break;\n          if (type2 !== \"value_0_4\") break;\n          items.push({ ...q2, id: id2 });\n          i += 1;\n        }\n\n        if (items.length) {\n          out.push(\n            <div key=\"c1q8-grid\" className=\"c1q8-grid\">\n              {items.map((it) => renderValue04C1Q8Row(it))}\n            </div>\n          );\n        }\n        continue;\n      }\n\n`;
  src = src.slice(0, idx) + block + src.slice(idx);
}

// 6) Dependencias del useMemo rendered: agregar hasC1Q8
src = src.replace(
  "}, [hasC2Q9, questions, missingSet, disabled, answers]);",
  "}, [hasC2Q9, hasC1Q8, questions, missingSet, disabled, answers]);"
);

fs.writeFileSync(file, src, "utf8");
console.log("✅ UI C1.q8 (3 columnas) parcheado en QuestionnaireRenderer.jsx");
