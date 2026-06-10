/**
 * Word (.docx) export for the team-integration reports.
 *
 * Mirrors the online previews (C1ReportPreview / C2ReportPreview + ReportView)
 * but emits editable Word documents. It reuses the SAME building blocks the
 * previews use, so the two never drift:
 *   - buildReportBlocks / aggregatePairingForFocal  (src/lib/reportAggregation.js)
 *   - verticalBarSvg / horizontalBarSvg             (src/lib/chartSvg.js)
 *
 * Charts: the single-source SVG is rasterized to a white-background PNG via an
 * offscreen <canvas> and embedded as an image (Word needs a raster for charts).
 *
 * Layout notes:
 *   - Each document opens with a branding row: the process (company) logo on
 *     the left and our own logo on the right, above the report title.
 *   - A thick horizontal rule precedes each question/group, standing in for the
 *     boxes that separate question groups in the online preview.
 *   - The value-grid block renders as a table whose right-most "Promedio" cell
 *     is heatmap-shaded (red->green over 0–4); C1 sorts those rows best-first.
 *
 * Two entry points, called from the dashboard with a pre-fetched report bundle
 * (GET /api/admin/processes/:slug/reports):
 *   - downloadC1Report(bundle)  -> one  Company-C1.docx
 *   - downloadC2Reports(bundle) -> a zip of Company-C2-Participant.docx files
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
} from "docx";
import JSZip from "jszip";
import { buildReportBlocks, aggregatePairingForFocal } from "./reportAggregation";
import { verticalBarSvg, horizontalBarSvg } from "./chartSvg";
import { gridHeatHex, evalHeatHex, sortGridItemsByAvg } from "./reportRender";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Our own brand logo (public asset). The blue-on-white variant reads cleanly
// on the white Word page.
const OWN_LOGO_URL = "/brand/integracion-azul.png";

// Palette mirrors src/styles/report.css (hex without '#', as docx expects).
const INK = "111827";
const MUTED = "6B7280";
const BORDER = "E5E7EB";
const HEADER_FILL = "F9FAFB";

// Thick rule that precedes each question/group (tweakable). size is in 1/8 pt.
const RULE_COLOR = "9CA3AF";
const RULE_SIZE = 18;

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Chart rasterization — single-source SVG -> white-background PNG ArrayBuffer.
async function svgToPng(svg, width, height, scale = 2) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("No se pudo rasterizar la gráfica."));
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // white background in Word
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen."))),
        "image/png",
      ),
    );
    return await pngBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Load any image URL, downscale it to fit maxW x maxH (preserving aspect), and
// return it as a small PNG so embedded logos don't bloat the documents. Returns
// null on any failure so a missing/odd logo never breaks the export.
async function loadLogoImage(url, maxW = 230, maxH = 100) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const scale = 2; // render at 2x for crispness
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const pngBlob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
    );
    return { type: "png", data: await pngBlob.arrayBuffer(), width, height };
  } catch {
    return null;
  }
}

function imageRun(logo) {
  return new ImageRun({
    type: logo.type,
    data: logo.data,
    transformation: { width: logo.width, height: logo.height },
  });
}

async function chartImageParagraph(spec) {
  const data = await svgToPng(spec.svg, spec.width, spec.height, 2);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 40 },
    children: [
      new ImageRun({
        type: "png",
        data,
        transformation: { width: spec.width, height: spec.height },
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Light HTML -> docx runs. Question text may carry simple tags (<strong>,
// <em>, <u>, <br>) and newlines (the preview converts \n to <br>).
// ---------------------------------------------------------------------------

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToSegments(html) {
  let s = String(html ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const segs = [];
  let bold = 0;
  let ital = 0;
  let und = 0;
  let last = 0;
  const re = /<(\/?)(strong|b|em|i|u)\b[^>]*>/gi;
  const emit = (chunk) => {
    if (!chunk) return;
    // strip any stray tags we don't handle (e.g. <span>, <a>)
    const cleaned = chunk.replace(/<[^>]+>/g, "");
    const lines = cleaned.split("\n");
    lines.forEach((line, i) => {
      const text = decodeEntities(line);
      if (i === 0 && !text) return; // skip a leading empty chunk
      segs.push({
        text,
        bold: bold > 0,
        italics: ital > 0,
        underline: und > 0,
        lineBreak: i > 0,
      });
    });
  };
  let m;
  while ((m = re.exec(s))) {
    emit(s.slice(last, m.index));
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "strong" || tag === "b") bold += closing ? -1 : 1;
    else if (tag === "em" || tag === "i") ital += closing ? -1 : 1;
    else if (tag === "u") und += closing ? -1 : 1;
    last = re.lastIndex;
  }
  emit(s.slice(last));
  return segs;
}

function htmlToRuns(html, base = {}) {
  const segs = htmlToSegments(html);
  if (!segs.length) return [new TextRun({ text: "", ...base })];
  return segs.map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: base.bold || seg.bold,
        italics: base.italics || seg.italics,
        underline: seg.underline ? {} : undefined,
        break: seg.lineBreak ? 1 : undefined,
        size: base.size,
        color: base.color,
      }),
  );
}

// ---------------------------------------------------------------------------
// Paragraph / table builders (styling mirrors src/styles/report.css).
// ---------------------------------------------------------------------------

function fmtAvg(avg) {
  return avg == null ? "—" : avg.toFixed(2);
}

function headerParagraph(html) {
  return new Paragraph({
    spacing: { before: 360, after: 160 },
    border: {
      bottom: { color: BORDER, size: 12, style: BorderStyle.SINGLE, space: 4 },
    },
    children: htmlToRuns(html, { bold: true, size: 30, color: INK }),
  });
}

// `rule` adds the thick separator above the question (group boundary).
function questionParagraph(html, { rule = false } = {}) {
  return new Paragraph({
    spacing: { before: rule ? 400 : 220, after: 80 },
    border: rule
      ? { top: { color: RULE_COLOR, size: RULE_SIZE, style: BorderStyle.SINGLE, space: 8 } }
      : undefined,
    children: htmlToRuns(html, { bold: true, size: 22, color: INK }),
  });
}

function emptyParagraph(text) {
  return new Paragraph({
    spacing: { before: 40 },
    children: [new TextRun({ text, italics: true, size: 21, color: MUTED })],
  });
}

function chartCaption(total) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({ text: `Total de respuestas: ${total}`, size: 18, color: MUTED }),
    ],
  });
}

function bulletParagraph(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text: String(text), size: 22, color: INK })],
  });
}

// One bullet whose multiple paragraphs become line breaks inside it.
function multiParagraphBullet(paragraphs) {
  const runs = paragraphs.map(
    (p, i) =>
      new TextRun({ text: String(p), size: 22, color: INK, break: i > 0 ? 1 : undefined }),
  );
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: runs });
}

function groupHeadParagraph(label, color) {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      new TextRun({ text: "■ ", color: String(color || "").replace("#", "") || INK, size: 22 }),
      new TextRun({ text: String(label), bold: true, size: 22, color: INK }),
    ],
  });
}

function groupedTextChildren(text) {
  const out = [];
  if (text?.questionText) out.push(questionParagraph(text.questionText));
  if (!text?.groups?.length) {
    out.push(emptyParagraph("Sin respuestas."));
    return out;
  }
  for (const g of text.groups) {
    out.push(groupHeadParagraph(g.label, g.color));
    for (const entry of g.entries) out.push(multiParagraphBullet(entry));
  }
  return out;
}

// --- Value grid -> table ---------------------------------------------------

const GRID_BORDER = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
const GRID_BORDERS = {
  top: GRID_BORDER,
  bottom: GRID_BORDER,
  left: GRID_BORDER,
  right: GRID_BORDER,
  insideHorizontal: GRID_BORDER,
  insideVertical: GRID_BORDER,
};

// A cell holding a single text line.
function textCell(text, { bold = false, fill, align, widthPct } = {}) {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: String(text), bold, size: 22, color: INK })],
      }),
    ],
  });
}

// A cell holding the suggestion bullets (or an em dash when there are none).
function suggestionsCell(suggestions, { widthPct } = {}) {
  const children = suggestions.length
    ? suggestions.map(
        (s) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 20 },
            children: [new TextRun({ text: String(s), size: 22, color: INK })],
          }),
      )
    : [new Paragraph({ children: [new TextRun({ text: "—", size: 22, color: MUTED })] })];
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children,
  });
}

// Averages live in the right-most column so they line up at the page edge; the
// "Promedio" cell is heatmap-shaded by the score (gridHeatHex).
function gridChildren(block) {
  const hasSug = block.hasSuggestion;
  const w = hasSug
    ? { aspecto: 34, sugerencias: 46, promedio: 20 }
    : { aspecto: 78, promedio: 22 };

  const header = new TableRow({
    tableHeader: true,
    children: [
      textCell("Aspecto", { bold: true, fill: HEADER_FILL, widthPct: w.aspecto }),
      ...(hasSug
        ? [textCell("Sugerencias", { bold: true, fill: HEADER_FILL, widthPct: w.sugerencias })]
        : []),
      textCell("Promedio", {
        bold: true,
        fill: HEADER_FILL,
        align: AlignmentType.RIGHT,
        widthPct: w.promedio,
      }),
    ],
  });

  const rows = block.items.map(
    (it) =>
      new TableRow({
        children: [
          textCell(it.text, { widthPct: w.aspecto }),
          ...(hasSug ? [suggestionsCell(it.suggestions, { widthPct: w.sugerencias })] : []),
          textCell(fmtAvg(it.avg), {
            align: AlignmentType.RIGHT,
            widthPct: w.promedio,
            fill: gridHeatHex(it.avg),
          }),
        ],
      }),
  );

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: GRID_BORDERS,
      rows: [header, ...rows],
    }),
  ];
}

// The evaluation average sits in a centered box whose background is shaded by
// the heat color (mirrors the online .report-bigavg box).
function bigAverageChildren(block) {
  const fill = evalHeatHex(block.avg);
  const cell = new TableCell({
    shading: fill ? { fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, bottom: 120, left: 240, right: 240 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: fmtAvg(block.avg), bold: true, size: 72, color: INK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Promedio de ${block.count} respuesta(s)`,
            size: 18,
            color: MUTED,
          }),
        ],
      }),
    ],
  });
  return [
    new Table({
      alignment: AlignmentType.CENTER,
      width: { size: 40, type: WidthType.PERCENTAGE },
      borders: GRID_BORDERS,
      rows: [new TableRow({ children: [cell] })],
    }),
  ];
}

// Turn ordered report blocks into docx children (async: charts rasterize).
// A thick rule precedes each new question group; consecutive blocks that share
// a groupId (one online "box") stay together, and we skip the rule right after
// a section header (which already separates).
async function blocksToChildren(blocks) {
  const children = [];
  let curGroup = null; // groupId of the unit currently open
  let unitOpen = false;
  let prevWasHeader = false;
  let first = true;

  for (const b of blocks) {
    const isHeader = b.kind === "header";

    if (isHeader) {
      children.push(headerParagraph(b.questionText));
      curGroup = null;
      unitOpen = false;
      prevWasHeader = true;
      first = false;
      continue;
    }

    const g = b.groupId;
    const continues = g != null && unitOpen && g === curGroup;
    const unitStart = !continues;
    if (unitStart) {
      curGroup = g; // null for ungrouped -> next block won't continue it
      unitOpen = true;
    }

    const wantRule = unitStart && !prevWasHeader && !first;
    children.push(questionParagraph(b.questionText, { rule: wantRule }));
    prevWasHeader = false;
    first = false;

    switch (b.kind) {
      case "rating_chart":
        children.push(await chartImageParagraph(verticalBarSvg(b.categories, b.total)));
        children.push(chartCaption(b.total));
        break;

      case "binary_chart":
        children.push(await chartImageParagraph(horizontalBarSvg(b.rows, b.total)));
        children.push(chartCaption(b.total));
        break;

      case "categorical_text": {
        const c = b.chart;
        const spec =
          b.categoricalKind === "rating"
            ? verticalBarSvg(c.categories, c.total)
            : horizontalBarSvg(c.rows, c.total);
        children.push(await chartImageParagraph(spec));
        children.push(chartCaption(c.total));
        children.push(...groupedTextChildren(b.text));
        break;
      }

      case "bullet_list":
        if (!b.items.length) children.push(emptyParagraph("Sin respuestas."));
        else for (const s of b.items) children.push(bulletParagraph(s));
        break;

      case "text_list":
        if (!b.items.length) children.push(emptyParagraph("Sin respuestas."));
        else for (const paras of b.items) children.push(multiParagraphBullet(paras));
        break;

      case "grid":
        children.push(...gridChildren(b));
        break;

      case "big_average":
        children.push(...bigAverageChildren(b));
        break;

      default:
        break;
    }
  }
  return children;
}

// Pairing section appended to a C2 report (mirrors PairingBlock).
function pairingChildren(partners) {
  const out = [
    questionParagraph(
      "Sus compañeros sugieren que usted mejore la calidad de su relación personal y laboral con:",
      { rule: true },
    ),
  ];
  if (!partners.length) {
    out.push(emptyParagraph("Ningún compañero hizo esta sugerencia."));
    return out;
  }
  for (const p of partners) {
    out.push(bulletParagraph(`${p.name} (${p.count} ${p.count === 1 ? "vez" : "veces"})`));
  }
  return out;
}

// Replace the <peer> placeholder in C2 question text with the focal name.
function replacePeerToken(blocks, name) {
  const sub = (s) => String(s || "").split("<peer>").join(name);
  return blocks.map((b) => {
    const nb = { ...b, questionText: sub(b.questionText) };
    if (b.text) nb.text = { ...b.text, questionText: sub(b.text.questionText) };
    return nb;
  });
}

// Branding row (process logo left, our logo right) + title + subtitle.
function brandHeaderChildren({ processLogo, ownLogo, title, subtitle }) {
  const out = [];

  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const leftPara = processLogo
    ? new Paragraph({ alignment: AlignmentType.LEFT, children: [imageRun(processLogo)] })
    : new Paragraph({ children: [] });
  const rightPara = ownLogo
    ? new Paragraph({ alignment: AlignmentType.RIGHT, children: [imageRun(ownLogo)] })
    : new Paragraph({ children: [] });

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [leftPara],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [rightPara],
            }),
          ],
        }),
      ],
    }),
  );

  out.push(
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: title, bold: true, size: 40, color: INK })],
    }),
  );
  if (subtitle) {
    out.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: subtitle, size: 20, color: MUTED })],
      }),
    );
  }
  return out;
}

function newDocument(children) {
  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: INK } } } },
    sections: [{ children }],
  });
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

async function buildC1Blob(bundle, logos) {
  const questions = bundle?.templates?.c1?.questions || [];
  const responses = (bundle?.c1Responses || []).map((r) => r.answers);
  const company = bundle?.process?.companyName || "";
  const respCount = responses.length;
  const partCount = bundle?.participants?.length || 0;

  const body =
    questions.length === 0
      ? [emptyParagraph("No hay preguntas configuradas en la plantilla C1.")]
      : await blocksToChildren(sortGridItemsByAvg(buildReportBlocks(questions, responses)));

  const children = [
    ...brandHeaderChildren({
      ...logos,
      title: `Retroalimentación Equipo ${company}`.trim(),
      subtitle: `Reporte consolidado · ${respCount} de ${partCount} participantes respondieron.`,
    }),
    ...body,
  ];
  return Packer.toBlob(newDocument(children));
}

async function buildC2Blob(bundle, participant, logos) {
  const participants = bundle?.participants || [];
  const nameById = (id) =>
    participants.find((p) => String(p.id) === String(id))?.name || String(id);
  const focalName = participant.name;

  const questions = bundle?.templates?.c2?.questions || [];
  const responses = (bundle?.c2Responses || [])
    .filter((r) => String(r.peerId) === String(participant.id))
    .map((r) => r.answers);
  const respCount = responses.length;

  // Pairing suggestions from the C1 pairing question, across all C1s.
  const c1Questions = bundle?.templates?.c1?.questions || [];
  const pairingQ = c1Questions.find((q) => String(q?.type || "").trim() === "pairing_rows");
  const c1Answers = (bundle?.c1Responses || []).map((r) => r.answers);
  const partners = pairingQ
    ? aggregatePairingForFocal(c1Answers, String(pairingQ.id), participant.id, nameById)
    : [];

  const body =
    questions.length === 0
      ? [emptyParagraph("No hay preguntas configuradas en la plantilla C2.")]
      : await blocksToChildren(
          replacePeerToken(buildReportBlocks(questions, responses), focalName),
        );

  const children = [
    ...brandHeaderChildren({
      ...logos,
      title: `Retroalimentación para ${focalName}`,
      subtitle: `Reporte individual · ${respCount} compañero(s) dieron retroalimentación.`,
    }),
    ...body,
    ...pairingChildren(partners),
  ];
  return Packer.toBlob(newDocument(children));
}

// ---------------------------------------------------------------------------
// Filenames + download
// ---------------------------------------------------------------------------

function sanitizeName(s) {
  return (
    String(s || "")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Reporte"
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Load both logos once; they're embedded in every document.
async function loadLogos(bundle) {
  const [processLogo, ownLogo] = await Promise.all([
    loadLogoImage(bundle?.process?.logoUrl ? `${API_BASE}${bundle.process.logoUrl}` : null),
    loadLogoImage(OWN_LOGO_URL),
  ]);
  return { processLogo, ownLogo };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function downloadC1Report(bundle) {
  const logos = await loadLogos(bundle);
  const blob = await buildC1Blob(bundle, logos);
  const company = sanitizeName(bundle?.process?.companyName || "Empresa");
  triggerDownload(blob, `${company}-C1.docx`);
}

export async function downloadC2Reports(bundle) {
  const participants = bundle?.participants || [];
  if (!participants.length) {
    throw new Error("Este proceso no tiene participantes.");
  }
  const company = sanitizeName(bundle?.process?.companyName || "Empresa");
  const logos = await loadLogos(bundle);

  const zip = new JSZip();
  for (const p of participants) {
    const blob = await buildC2Blob(bundle, p, logos);
    zip.file(`${company}-C2-${sanitizeName(p.name)}.docx`, await blob.arrayBuffer());
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `${company}-C2.zip`);
}
