import React from "react";

/**
 * Report chart primitives — plain inline SVG on a white background so they read
 * the same in the online preview and when exported to Word.
 *
 * Colors come from the aggregated block data (see src/lib/reportAggregation.js).
 */

const INK = "#111827"; // labels
const MUTED = "#6b7280"; // footer
const AXIS = "#d1d5db";

// Vertical bars for the 0–4 rating scale. Categories arrive ordered left ->
// right (Excelente ... Insatisfactorio). Numeric label sits atop each bar.
export function VerticalBarChart({ categories = [], total = 0 }) {
  const W = 600;
  const H = 280;
  const padL = 16;
  const padR = 16;
  const padTop = 30;
  const padBottom = 50;
  const plotH = H - padTop - padBottom;
  const baseline = padTop + plotH;

  const n = Math.max(1, categories.length);
  const slot = (W - padL - padR) / n;
  const barW = Math.min(86, slot * 0.6);
  const maxCount = Math.max(1, ...categories.map((c) => c.count));

  return (
    <figure className="report-chart" style={{ maxWidth: W + 32 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img">
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        <line x1={padL} y1={baseline} x2={W - padR} y2={baseline} stroke={AXIS} strokeWidth="1" />
        {categories.map((c, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = (c.count / maxCount) * plotH;
          const y = baseline - h;
          return (
            <g key={i}>
              {c.count > 0 ? (
                <rect x={cx - barW / 2} y={y} width={barW} height={h} fill={c.color} rx="3" />
              ) : null}
              <text x={cx} y={y - 7} textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>
                {c.count}
              </text>
              <text x={cx} y={baseline + 18} textAnchor="middle" fontSize="11" fill={INK}>
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="report-chart-foot">Total de respuestas: {total}</figcaption>
    </figure>
  );
}

// Horizontal bars for binary_yes_no. Rows arrive ordered Sí (top), No (below).
// Numeric label sits to the right of each bar.
export function HorizontalBarChart({ rows = [], total = 0 }) {
  const W = 520;
  const rowH = 46;
  const barH = 26;
  const padTop = 12;
  const padBottom = 8;
  const padL = 56;
  const padR = 52;
  const H = padTop + rows.length * rowH + padBottom;
  const plotW = W - padL - padR;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <figure className="report-chart" style={{ maxWidth: W + 32 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img">
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {rows.map((r, i) => {
          const y = padTop + i * rowH + (rowH - barH) / 2;
          const w = (r.count / maxCount) * plotW;
          return (
            <g key={i}>
              <text x={padL - 10} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize="14" fontWeight="700" fill={INK}>
                {r.label}
              </text>
              {r.count > 0 ? <rect x={padL} y={y} width={Math.max(w, 2)} height={barH} fill={r.color} rx="3" /> : null}
              <text x={padL + w + 8} y={y + barH / 2} dominantBaseline="middle" fontSize="14" fontWeight="700" fill={INK}>
                {r.count}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="report-chart-foot" style={{ color: MUTED }}>
        Total de respuestas: {total}
      </figcaption>
    </figure>
  );
}
