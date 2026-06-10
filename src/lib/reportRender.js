/**
 * Render-side helpers for the C1/C2 reports — PURE, no aggregation/math/DB.
 *
 * These shape how aggregated data is *presented*: heatmap shading and the
 * grid ordering used in the C1 report. They are shared by the online preview
 * (ReportView.jsx, via CSS hex with '#') and the Word export (reportDocx.js,
 * which wants a bare 6-digit hex without '#'), so the two never drift.
 *
 * Heatmap ramp: a pastel red -> yellow -> green gradient. t = 0 is the worst
 * score (red), t = 1 the best (green). Lightness is kept high so dark ink text
 * stays readable over the shaded background.
 *
 * The gradient only spans the TOP HALF of each scale: the bottom half is solid
 * red, then it ramps red -> green from the midpoint to the max. So 0–4 grids
 * are red below 2 and gradient 2 -> 4; 0–10 evaluations are red below 5 and
 * gradient 5 -> 10. (heatHex clamps, so sub-midpoint values fall out as red.)
 */

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function toHex2(n) {
  return Math.round(n).toString(16).padStart(2, "0");
}

// HSL (h in degrees, s/l in 0..1) -> "rrggbb" (no leading '#').
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return toHex2((r + m) * 255) + toHex2((g + m) * 255) + toHex2((b + m) * 255);
}

/**
 * Heat color for a normalized score. Returns a bare 6-digit hex ("rrggbb").
 * Prepend '#' for CSS; pass as-is to docx shading fills.
 */
export function heatHex(t) {
  const hue = clamp01(t) * 120; // 0 = red, 60 = yellow, 120 = green
  return hslToHex(hue, 0.7, 0.78);
}

// 0–4 grid average -> heat hex, or null when there's nothing to shade.
// Red below 2, then gradient 2 -> 4.
export function gridHeatHex(avg) {
  if (avg == null || !Number.isFinite(avg)) return null;
  return heatHex((avg - 2) / 2);
}

// 0–10 evaluation average -> heat hex, or null when there's nothing to shade.
// Red below 5, then gradient 5 -> 10.
export function evalHeatHex(avg) {
  if (avg == null || !Number.isFinite(avg)) return null;
  return heatHex((avg - 5) / 5);
}

/**
 * Return a copy of the report blocks with every grid block's items sorted by
 * average score, best first. Items without an average sink to the bottom.
 * Used by the C1 report only (C2 keeps template order).
 */
export function sortGridItemsByAvg(blocks) {
  return (blocks || []).map((b) => {
    if (b.kind !== "grid") return b;
    const items = [...b.items].sort(
      (a, c) => (c.avg ?? -Infinity) - (a.avg ?? -Infinity),
    );
    return { ...b, items };
  });
}
