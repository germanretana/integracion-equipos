import React from "react";
import { VerticalBarChart, HorizontalBarChart } from "./ReportCharts";
import { gridHeatHex, evalHeatHex } from "../../lib/reportRender";

// Inline background shading from a bare heat hex (null => no shading).
function heatBg(hex) {
  return hex ? { background: `#${hex}` } : undefined;
}

/**
 * Renders the ordered report blocks produced by buildReportBlocks() onto a
 * white "paper" surface that resembles the eventual Word document.
 */

// Question text may contain light HTML and newlines (mirrors the questionnaire
// renderer's handling).
function QuestionText({ html }) {
  if (!html) return null;
  const norm = String(html).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  return <div className="report-q" dangerouslySetInnerHTML={{ __html: norm }} />;
}

// A multi-paragraph bullet: paragraphs become line breaks inside one bullet.
function ParagraphBullet({ paragraphs }) {
  return (
    <li>
      {paragraphs.map((p, j) => (
        <React.Fragment key={j}>
          {j > 0 ? <br /> : null}
          {p}
        </React.Fragment>
      ))}
    </li>
  );
}

function fmtAvg(avg) {
  return avg == null ? "—" : avg.toFixed(2);
}

function EmptyNote() {
  return <p className="report-empty">Sin respuestas.</p>;
}

function RatingChart({ block }) {
  return <VerticalBarChart categories={block.categories} total={block.total} />;
}

function BinaryChart({ block }) {
  return <HorizontalBarChart rows={block.rows} total={block.total} />;
}

function GroupedText({ text }) {
  return (
    <div className="report-grouped">
      <QuestionText html={text.questionText} />
      {text.groups.length === 0 ? (
        <EmptyNote />
      ) : (
        text.groups.map((g) => (
          <div key={String(g.key)} className="report-group">
            <div className="report-group-head">
              <span className="report-dot" style={{ background: g.color }} />
              {g.label}
            </div>
            <ul className="report-bullets">
              {g.entries.map((paras, i) => (
                <ParagraphBullet key={i} paragraphs={paras} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function Grid({ block }) {
  if (!block.hasSuggestion) {
    return (
      <table className="report-grid">
        <thead>
          <tr>
            <th>Aspecto</th>
            <th className="report-grid-avg">Promedio</th>
          </tr>
        </thead>
        <tbody>
          {block.items.map((it, i) => (
            <tr key={i}>
              <td>{it.text}</td>
              <td className="report-grid-avg" style={heatBg(gridHeatHex(it.avg))}>
                {fmtAvg(it.avg)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div className="report-grid-stack">
      {block.items.map((it, i) => (
        <div key={i} className="report-grid-item">
          <div className="report-grid-item-head">
            <span className="report-grid-item-text">{it.text}</span>
            <span className="report-grid-badge" style={heatBg(gridHeatHex(it.avg))}>
              {fmtAvg(it.avg)}
            </span>
          </div>
          {it.suggestions.length > 0 ? (
            <ul className="report-bullets">
              {it.suggestions.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BigAverage({ block }) {
  return (
    <div className="report-bigavg" style={heatBg(evalHeatHex(block.avg))}>
      <div className="report-bigavg-num">{fmtAvg(block.avg)}</div>
      <div className="report-bigavg-foot">Promedio de {block.count} respuesta(s)</div>
    </div>
  );
}

// Pairing block for a focal participant's C2 report. Rendered as its own unit
// so it sits below a thick separator like every other top-level group.
export function PairingBlock({ partners = [] }) {
  return (
    <div className="report-unit">
      <div className="report-card">
        <div className="report-q">
          Sus compañeros sugieren que usted mejore la calidad de su relación personal y
          laboral con:
        </div>
        {partners.length === 0 ? (
          <p className="report-empty">Ningún compañero hizo esta sugerencia.</p>
        ) : (
          <ul className="report-bullets">
            {partners.map((p) => (
              <li key={p.id}>
                {p.name} ({p.count} {p.count === 1 ? "vez" : "veces"})
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// The body of one question card: its original text followed by the result.
function BlockBody({ block }) {
  return (
    <>
      <QuestionText html={block.questionText} />

      {block.kind === "rating_chart" ? <RatingChart block={block} /> : null}
      {block.kind === "binary_chart" ? <BinaryChart block={block} /> : null}

      {block.kind === "categorical_text" ? (
        <>
          {block.categoricalKind === "rating" ? (
            <RatingChart block={block.chart} />
          ) : (
            <BinaryChart block={block.chart} />
          )}
          <GroupedText text={block.text} />
        </>
      ) : null}

      {block.kind === "bullet_list" ? (
        block.items.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="report-bullets">
            {block.items.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )
      ) : null}

      {block.kind === "text_list" ? (
        block.items.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="report-bullets">
            {block.items.map((paras, i) => (
              <ParagraphBullet key={i} paragraphs={paras} />
            ))}
          </ul>
        )
      ) : null}

      {block.kind === "grid" ? <Grid block={block} /> : null}
      {block.kind === "big_average" ? <BigAverage block={block} /> : null}
    </>
  );
}

// Group consecutive blocks that share a non-empty groupId into one unit;
// blocks without a group each become their own unit. Mirrors how the
// questionnaire renderer blocks questions by group.
function toUnits(blocks) {
  const units = [];
  let cur = null;
  for (const b of blocks) {
    const g = b.groupId;
    if (g && cur && cur.groupId === g) {
      cur.blocks.push(b);
    } else {
      cur = { groupId: g || null, key: b.id, blocks: [b] };
      units.push(cur);
    }
  }
  return units;
}

export default function ReportView({ blocks = [], children }) {
  const units = toUnits(blocks);
  return (
    <div className="report-paper">
      {units.map((u) => (
        <div className="report-unit" key={u.key}>
          {u.blocks.map((b) =>
            b.kind === "header" ? (
              <h2 className="report-h2" key={b.id}>
                <QuestionText html={b.questionText} />
              </h2>
            ) : (
              <div className="report-card" key={b.id}>
                <BlockBody block={b} />
              </div>
            ),
          )}
        </div>
      ))}
      {children}
    </div>
  );
}
