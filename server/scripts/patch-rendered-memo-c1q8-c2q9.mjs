import fs from "fs";

const FILE = "src/components/QuestionnaireRenderer.jsx";
let src = fs.readFileSync(FILE, "utf8");

const startNeedle = `  const rendered = React.useMemo(() => {`;
const endNeedle = `  return (
    <div>
      {/* C2 q9 grid render */}`;

const a = src.indexOf(startNeedle);
if (a === -1) {
  console.error("❌ No encontré startNeedle de rendered useMemo");
  process.exit(1);
}
const b = src.indexOf(endNeedle, a);
if (b === -1) {
  console.error("❌ No encontré endNeedle antes del return principal");
  process.exit(1);
}

const replacement = `  const rendered = React.useMemo(() => {
    if (!hasC2Q9 && !hasC1Q8) return null;

    const out = [];
    const qs = questions || [];
    let i = 0;

    while (i < qs.length) {
      const q = qs[i];
      const id = String(q?.id || q?.key || \`\${i}\`);
      const type = String(q?.type || "").toLowerCase();

      // C1.q8: header + items as a single 3-col block
      if (hasC1Q8 && isC1Q8HeaderId(id) && type === "header") {
        out.push(
          <MissingWrap key={id} qid={id} missing={false}>
            {renderHeader({ ...q, id })}
          </MissingWrap>
        );

        const items = [];
        i += 1;
        while (i < qs.length) {
          const q2 = qs[i];
          const id2 = String(q2?.id || q2?.key || \`\${i}\`);
          if (!isC1Q8ItemId(id2)) break;
          items.push({ ...q2, id: id2 });
          i += 1;
        }

        if (items.length) {
          out.push(
            <div key="c1q8-grid" className="c1q8-grid">
              {items.map((it) => renderC1Q8Row(it))}
            </div>
          );
        }
        continue;
      }

      // C2.q9: header + items as 2-col block
      if (hasC2Q9 && isC2Q9HeaderId(id) && type === "header") {
        out.push(
          <MissingWrap key={id} qid={id} missing={false}>
            {renderHeader({ ...q, id })}
          </MissingWrap>
        );

        const items = [];
        i += 1;
        while (i < qs.length) {
          const q2 = qs[i];
          const id2 = String(q2?.id || q2?.key || \`\${i}\`);
          if (!isC2Q9Id(id2)) break;
          items.push({ ...q2, id: id2 });
          i += 1;
        }

        if (items.length) {
          out.push(
            <div key="c2q9-grid" className="c2q9-grid">
              {items.map((it) => renderValue04Compact(it))}
            </div>
          );
        }
        continue;
      }

      // default render
      out.push(
        <MissingWrap key={id} qid={id} missing={missingSet.has(id)}>
          {renderQuestion({ ...q, id })}
        </MissingWrap>
      );
      i += 1;
    }

    return out;
  }, [hasC2Q9, hasC1Q8, questions, missingSet, disabled, answers]);`;

src = src.slice(0, a) + replacement + "\n\n" + src.slice(b);

fs.writeFileSync(FILE, src, "utf8");
console.log("✅ rendered memo actualizado para C1.q8 (3-col) y C2.q9 (2-col)");
