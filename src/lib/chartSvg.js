/**
 * Chart SVG — the SINGLE SOURCE OF TRUTH for how report charts are drawn.
 *
 * Each builder returns { width, height, svg } where `svg` is self-contained
 * markup (xmlns, explicit size, white background) so it can be used two ways
 * from one definition:
 *   - online  : injected into the DOM by src/components/report/ReportCharts.jsx
 *               (CSS scales it responsively, keeping the viewBox aspect ratio)
 *   - Word    : rasterized to a PNG via an offscreen <canvas> (see reportDocx.js)
 *
 * Edit colors / labels / grid lines HERE and both the preview and the export
 * update together. Colors come from the aggregated block data
 * (see src/lib/reportAggregation.js).
 */

const INK = "#111827"; // labels
const AXIS = "#d1d5db"; // baseline

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Vertical bars for the 0–4 rating scale. Categories arrive ordered left ->
// right (Excelente … Insatisfactorio). Numeric label sits atop each bar.
export function verticalBarSvg(categories = []) {
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

  const bars = categories
    .map((c, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = (c.count / maxCount) * plotH;
      const y = baseline - h;
      const rect =
        c.count > 0
          ? `<rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${h}" fill="${c.color}" rx="3" />`
          : "";
      return `${rect}<text x="${cx}" y="${y - 7}" text-anchor="middle" font-size="14" font-weight="700" fill="${INK}">${c.count}</text><text x="${cx}" y="${baseline + 18}" text-anchor="middle" font-size="11" fill="${INK}">${escapeXml(c.label)}</text>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif"><rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" /><line x1="${padL}" y1="${baseline}" x2="${W - padR}" y2="${baseline}" stroke="${AXIS}" stroke-width="1" />${bars}</svg>`;

  return { width: W, height: H, svg };
}

// Horizontal bars for binary_yes_no. Rows arrive ordered Sí (top), No (below).
// Numeric label sits to the right of each bar.
export function horizontalBarSvg(rows = []) {
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

  const bars = rows
    .map((r, i) => {
      const y = padTop + i * rowH + (rowH - barH) / 2;
      const w = (r.count / maxCount) * plotW;
      const rect =
        r.count > 0
          ? `<rect x="${padL}" y="${y}" width="${Math.max(w, 2)}" height="${barH}" fill="${r.color}" rx="3" />`
          : "";
      return `<text x="${padL - 10}" y="${y + barH / 2}" text-anchor="end" dominant-baseline="middle" font-size="14" font-weight="700" fill="${INK}">${escapeXml(r.label)}</text>${rect}<text x="${padL + w + 8}" y="${y + barH / 2}" dominant-baseline="middle" font-size="14" font-weight="700" fill="${INK}">${r.count}</text>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif"><rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />${bars}</svg>`;

  return { width: W, height: H, svg };
}
