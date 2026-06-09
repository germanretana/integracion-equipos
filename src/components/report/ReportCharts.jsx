import React from "react";
import { verticalBarSvg, horizontalBarSvg } from "../../lib/chartSvg";

/**
 * Report chart primitives. The actual SVG is produced by the single source of
 * truth in src/lib/chartSvg.js; here we just inject it into the DOM and wrap it
 * with the framed figure + footer. The same chartSvg output is rasterized to
 * PNG for the Word export (see src/lib/reportDocx.js), so the preview and the
 * export never drift.
 *
 * CSS (.report-chart svg) scales the injected SVG responsively while preserving
 * its viewBox aspect ratio.
 */

// Vertical bars for the 0–4 rating scale.
export function VerticalBarChart({ categories = [], total = 0 }) {
  const { width, svg } = verticalBarSvg(categories, total);
  return (
    <figure className="report-chart" style={{ maxWidth: width + 32 }}>
      <div
        className="report-chart-svg"
        style={{ width: "100%", maxWidth: width }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="report-chart-foot">Total de respuestas: {total}</figcaption>
    </figure>
  );
}

// Horizontal bars for binary_yes_no.
export function HorizontalBarChart({ rows = [], total = 0 }) {
  const { width, svg } = horizontalBarSvg(rows, total);
  return (
    <figure className="report-chart" style={{ maxWidth: width + 32 }}>
      <div
        className="report-chart-svg"
        style={{ width: "100%", maxWidth: width }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="report-chart-foot">Total de respuestas: {total}</figcaption>
    </figure>
  );
}
