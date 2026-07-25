// =============================================================================
// build-docx.mjs — Renderer Word (.docx) cho Sổ tay HS&E của TCM.
// Đọc nội dung từ content.mjs (nguồn duy nhất) → xuất TCM-HSE-Manual.docx
// Thuần Node, KHÔNG cần LibreOffice/pandoc/Python.
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, TableOfContents,
  Header, Footer, PageNumber, ShadingType, VerticalAlign, PageBreak, LevelFormat,
} from "docx";
import { meta, doc, policy, annexes, glossary, revisionHistory, approvals } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

// ── Brand kit (hex không có #) ───────────────────────────────────────────────
const C = {
  brand600: "0068E6", brand700: "0052B8", brand800: "023F8F", brand900: "0A3269", brand950: "061D40",
  brand50: "EEF6FF", brand100: "DCECFF", brand200: "B3D9FF",
  ink: "0F172A", muted: "64748B", border: "E2E8F0", surface2: "F6F8FB",
  warning: "B45309", warningBg: "FFFBEB", danger: "B91C1C", dangerBg: "FEF2F2",
  success: "15803D", successBg: "ECFDF3", white: "FFFFFF",
};
const FONT = "Nunito"; // fallback Arial do Word xử lý
const FONT_HEAD = "Nunito";

const CALLOUT = {
  note: { bg: C.brand50, bar: C.brand600, label: { vi: "LƯU Ý", en: "NOTE" } },
  warning: { bg: C.warningBg, bar: C.warning, label: { vi: "CẢNH BÁO", en: "WARNING" } },
  danger: { bg: C.dangerBg, bar: C.danger, label: { vi: "NGUY HIỂM", en: "DANGER" } },
  good: { bg: C.successBg, bar: C.success, label: { vi: "THỰC HÀNH TỐT", en: "GOOD PRACTICE" } },
};

const img = (p) => fs.readFileSync(path.join(REPO, p));
const logoBuf = img("public/brand/logo.png");   // 2189×923
const markBuf = img("public/brand/mark.png");    // 2189×738

// ── Helpers tạo nội dung ─────────────────────────────────────────────────────
const run = (text, o = {}) => new TextRun({ text, font: o.font || FONT, size: o.size || 21, bold: o.bold, italics: o.italics, color: o.color || C.ink, allCaps: o.caps });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 276 }, alignment: o.align, heading: o.heading, keepNext: o.keepNext, shading: o.shading, border: o.border, indent: o.indent, numbering: o.numbering, bullet: o.bullet });

const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } };
const thinBorder = (color = C.border) => ({ top: { style: BorderStyle.SINGLE, size: 4, color }, bottom: { style: BorderStyle.SINGLE, size: 4, color }, left: { style: BorderStyle.SINGLE, size: 4, color }, right: { style: BorderStyle.SINGLE, size: 4, color }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color } });

// ── Renderers cho từng block type ────────────────────────────────────────────
function renderPart(b) {
  // Banner brand: bảng 1 ô nền brand600
  const cell = new TableCell({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 },
    margins: { top: 160, bottom: 160, left: 200, right: 200 },
    borders: noBorder,
    children: [
      para(run(b.vi, { font: FONT_HEAD, size: 30, bold: true, color: C.white, caps: true }), { after: 20, line: 300 }),
      ...(b.en ? [para(run(b.en, { font: FONT_HEAD, size: 19, color: C.brand100 }), { after: 0, line: 240 })] : []),
    ],
  });
  return [
    new Paragraph({ children: [], spacing: { before: 240, after: 0 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorder, rows: [new TableRow({ children: [cell] })] }),
    new Paragraph({ children: [], spacing: { after: 200 } }),
  ];
}

function renderH1(b) {
  const title = b.num ? `Chương ${b.num}. ${b.vi}` : b.vi;
  return [
    para(run(title, { font: FONT_HEAD, size: 26, bold: true, color: C.brand700 }), { heading: HeadingLevel.HEADING_1, before: 120, after: 40, keepNext: true, line: 300 }),
    ...(b.en ? [para(run(b.en, { font: FONT_HEAD, size: 18, italics: true, color: C.muted }), { after: 60, keepNext: true })] : []),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorder,
      rows: [new TableRow({ children: [new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 12, color: C.brand600 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [], spacing: { after: 0, line: 20 } })] })] })] }),
    new Paragraph({ children: [], spacing: { after: 80 } }),
  ];
}

function renderH2(b) {
  return [para([run(b.vi, { font: FONT_HEAD, size: 22, bold: true, color: C.brand800 }), ...(b.en ? [run("  " + b.en, { size: 16, italics: true, color: C.muted })] : [])], { heading: HeadingLevel.HEADING_2, before: 140, after: 40, keepNext: true })];
}
function renderH3(b) {
  return [para([run(b.vi, { font: FONT_HEAD, size: 20, bold: true, color: C.ink }), ...(b.en ? [run("  " + b.en, { size: 15, italics: true, color: C.muted })] : [])], { heading: HeadingLevel.HEADING_3, before: 120, after: 30, keepNext: true })];
}

function renderP(b) {
  const out = [para(run(b.vi))];
  if (b.en) out.push(para(run(b.en, { italics: true, color: C.muted, size: 19 }), { after: 140 }));
  return out;
}

const itemText = (it) => (typeof it === "string" ? it : it.vi);
function renderList(b, ordered) {
  return b.items.map((it) => para(run(itemText(it)), ordered
    ? { numbering: { reference: "num-list", level: 0 }, after: 60, line: 264 }
    : { bullet: { level: 0 }, after: 60, line: 264 }));
}

function cellParas(obj, o = {}) {
  const t = typeof obj === "string" ? obj : obj.vi;
  const en = typeof obj === "object" ? obj.en : undefined;
  const ps = [para(run(t, { size: o.size || 19, bold: o.bold, color: o.color || C.ink }), { after: en ? 10 : 0, line: 252 })];
  if (en) ps.push(para(run(en, { size: 15, italics: true, color: C.muted }), { after: 0, line: 216 }));
  return ps;
}

function renderTable(b) {
  const widths = b.widths || b.head.map(() => Math.floor(100 / b.head.length));
  const headRow = new TableRow({ tableHeader: true, children: b.head.map((h, i) => new TableCell({
    width: { size: widths[i], type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 },
    margins: { top: 60, bottom: 60, left: 100, right: 100 }, verticalAlign: VerticalAlign.CENTER,
    children: cellParas({ vi: h.vi, en: h.en }, { bold: true, color: C.white, size: 19 }),
  })) });
  const bodyRows = b.rows.map((r, ri) => new TableRow({ children: r.map((c, i) => new TableCell({
    width: { size: widths[i], type: WidthType.PERCENTAGE },
    shading: ri % 2 ? { type: ShadingType.CLEAR, color: "auto", fill: C.surface2 } : undefined,
    margins: { top: 50, bottom: 50, left: 100, right: 100 }, verticalAlign: VerticalAlign.CENTER,
    children: cellParas(c),
  })) }));
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorder(), rows: [headRow, ...bodyRows] }), new Paragraph({ children: [], spacing: { after: 140 } })];
}

function renderCallout(b) {
  const cfg = CALLOUT[b.variant] || CALLOUT.note;
  const kids = [
    para([run(`${cfg.label.vi} `, { bold: true, size: 16, color: cfg.bar, caps: true }), run(`/ ${cfg.label.en}`, { size: 14, color: cfg.bar, italics: true })], { after: 40, line: 220 }),
    para(run(b.vi, { size: 20, color: C.ink }), { after: b.en ? 40 : 0 }),
  ];
  if (b.en) kids.push(para(run(b.en, { size: 16, italics: true, color: C.muted }), { after: 0 }));
  const cell = new TableCell({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: cfg.bg },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: cfg.bar }, bottom: { style: BorderStyle.SINGLE, size: 4, color: cfg.bar }, right: { style: BorderStyle.SINGLE, size: 4, color: cfg.bar }, left: { style: BorderStyle.SINGLE, size: 30, color: cfg.bar } },
    margins: { top: 120, bottom: 120, left: 200, right: 160 },
    children: kids,
  });
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorder, rows: [new TableRow({ children: [cell] })] }), new Paragraph({ children: [], spacing: { after: 140 } })];
}

function renderSummary(b) {
  const kids = [
    para([run("English summary", { font: FONT_HEAD, bold: true, size: 18, color: C.brand700 })], { after: 50, line: 220 }),
    ...b.items.map((s) => para(run(s, { size: 17, italics: true, color: C.brand900 }), { bullet: { level: 0 }, after: 40, line: 240 })),
  ];
  const cell = new TableCell({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand50 },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.brand200 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.brand200 }, left: { style: BorderStyle.SINGLE, size: 4, color: C.brand200 }, right: { style: BorderStyle.SINGLE, size: 4, color: C.brand200 } },
    margins: { top: 120, bottom: 120, left: 200, right: 160 },
    children: kids,
  });
  return [new Paragraph({ children: [], spacing: { after: 60 } }), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorder, rows: [new TableRow({ children: [cell] })] })];
}

// ── Khối đặc biệt: Tuyên bố Chính sách (song ngữ đầy đủ) ──────────────────────
function renderPolicy() {
  const out = [];
  out.push(para(run(policy.titleVi, { font: FONT_HEAD, size: 26, bold: true, color: C.brand700 }), { heading: HeadingLevel.HEADING_1, after: 20, before: 120, align: AlignmentType.CENTER }));
  out.push(para(run(policy.titleEn, { font: FONT_HEAD, size: 18, italics: true, color: C.muted }), { after: 160, align: AlignmentType.CENTER }));
  // VI
  policy.vi.forEach((p) => out.push(para(run(p, { size: 21 }), { after: 100 })));
  policy.viBullets.forEach((b) => out.push(para(run(b), { bullet: { level: 0 }, after: 50 })));
  out.push(para(run(policy.viClose, { size: 21 }), { after: 160 }));
  // EN (muted, italic)
  out.push(para(run("— English —", { size: 16, color: C.brand600, bold: true }), { after: 60 }));
  policy.en.forEach((p) => out.push(para(run(p, { size: 18, italics: true, color: C.muted }), { after: 90 })));
  policy.enBullets.forEach((b) => out.push(para(run(b, { size: 17, italics: true, color: C.muted }), { bullet: { level: 0 }, after: 40 })));
  out.push(para(run(policy.enClose, { size: 18, italics: true, color: C.muted }), { after: 200 }));
  // Chữ ký
  out.push(...renderSignature(policy.signRoles, { effective: true }));
  return out;
}

function renderSignature(roles, o = {}) {
  const out = [new Paragraph({ children: [], spacing: { before: 200, after: 0 } })];
  roles.forEach((r) => {
    out.push(para([run(r.vi, { bold: true, size: 20 }), run("  /  " + r.en, { size: 15, italics: true, color: C.muted })], { after: 20 }));
    out.push(para(run("Ký & ghi rõ họ tên / Signature & full name: ______________________________", { size: 18, color: C.muted }), { after: 20 }));
    out.push(para(run("Ngày / Date: ____ / ____ / __________", { size: 18, color: C.muted }), { after: 160 }));
  });
  return out;
}

// ── Phụ lục biểu mẫu ─────────────────────────────────────────────────────────
function renderAnnexes() {
  const out = [];
  for (const a of annexes) {
    out.push(para([run(`Phụ lục ${a.code} — ${a.vi}`, { font: FONT_HEAD, size: 22, bold: true, color: C.brand700 }), run("  " + a.en, { size: 15, italics: true, color: C.muted })], { heading: HeadingLevel.HEADING_2, before: 160, after: 40, keepNext: true }));
    if (a.desc) out.push(para([run(a.desc.vi, { size: 19 }), run("  " + a.desc.en, { size: 15, italics: true, color: C.muted })], { after: 100 }));
    if (a.fields && a.fields.length) {
      const rows = a.fields.map(([vi, en]) => new TableRow({ children: [
        new TableCell({ width: { size: 42, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.surface2 }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: cellParas({ vi, en }, { bold: true, size: 18 }) }),
        new TableCell({ width: { size: 58, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [para(run("", { size: 18 }), { after: 0 })] }),
      ] }));
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorder(), rows }));
      out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
    }
    if (a.check && a.check.length) {
      const rows = a.check.map(([vi, en]) => new TableRow({ children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 60, bottom: 60, left: 100, right: 60 }, children: [para(run("☐", { size: 24, color: C.brand600 }), { after: 0, align: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 92, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: cellParas({ vi, en }) }),
      ] }));
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorder(), rows }));
      out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
    }
    if (a.code === "A") out.push(...renderSignature(policy.signRoles));
  }
  // Phụ lục M — Glossary
  out.push(new Paragraph({ children: [new PageBreak()] }));
  out.push(para([run("Phụ lục M — Thuật ngữ song ngữ (VI–EN)", { font: FONT_HEAD, size: 22, bold: true, color: C.brand700 }), run("  Bilingual glossary", { size: 15, italics: true, color: C.muted })], { heading: HeadingLevel.HEADING_2, before: 120, after: 80 }));
  const gHead = new TableRow({ tableHeader: true, children: [
    new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 }, margins: { top: 50, bottom: 50, left: 100, right: 100 }, children: cellParas({ vi: "Tiếng Việt" }, { bold: true, color: C.white }) }),
    new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 }, margins: { top: 50, bottom: 50, left: 100, right: 100 }, children: cellParas({ vi: "English" }, { bold: true, color: C.white }) }),
  ] });
  const gRows = glossary.map(([vi, en], i) => new TableRow({ children: [
    new TableCell({ shading: i % 2 ? { type: ShadingType.CLEAR, color: "auto", fill: C.surface2 } : undefined, margins: { top: 40, bottom: 40, left: 100, right: 100 }, children: cellParas({ vi }) }),
    new TableCell({ shading: i % 2 ? { type: ShadingType.CLEAR, color: "auto", fill: C.surface2 } : undefined, margins: { top: 40, bottom: 40, left: 100, right: 100 }, children: cellParas({ vi: en }) }),
  ] }));
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorder(), rows: [gHead, ...gRows] }));
  return out;
}

// ── Dispatch block → elements ────────────────────────────────────────────────
function renderBlock(b) {
  switch (b.t) {
    case "part": return renderPart(b);
    case "h1": return renderH1(b);
    case "h2": return renderH2(b);
    case "h3": return renderH3(b);
    case "p": return renderP(b);
    case "ul": return renderList(b, false);
    case "ol": return renderList(b, true);
    case "table": return renderTable(b);
    case "callout": return renderCallout(b);
    case "summary": return renderSummary(b);
    case "spacer": return [new Paragraph({ children: [], spacing: { after: 160 } })];
    case "pagebreak": return [new Paragraph({ children: [new PageBreak()] })];
    case "policyStatement": return renderPolicy();
    case "annexList": return renderAnnexes();
    default: return [];
  }
}

// ── Trang bìa ────────────────────────────────────────────────────────────────
function coverPage() {
  const ratio = 923 / 2189;
  const w = 300;
  return [
    new Paragraph({ children: [], spacing: { before: 800 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new ImageRun({ data: logoBuf, transformation: { width: w, height: Math.round(w * ratio) } })] }),
    // thanh brand
    new Table({ width: { size: 60, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: noBorder, rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 }, borders: noBorder, children: [new Paragraph({ children: [], spacing: { after: 0, line: 30 } })] })] })] }),
    new Paragraph({ children: [], spacing: { after: 500 } }),
    para(run(meta.title.vi, { font: FONT_HEAD, size: 44, bold: true, color: C.brand900, caps: true }), { align: AlignmentType.CENTER, after: 80, line: 460 }),
    para(run(meta.title.en, { font: FONT_HEAD, size: 24, italics: true, color: C.muted }), { align: AlignmentType.CENTER, after: 700 }),
    para([run(meta.classification.vi, { size: 18, bold: true, color: C.brand700, caps: true }), run("  ·  " + meta.classification.en, { size: 15, italics: true, color: C.muted })], { align: AlignmentType.CENTER, after: 400 }),
    // hộp metadata
    new Table({ width: { size: 70, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: thinBorder(C.brand200), rows: [
      metaRow("Mã tài liệu / Doc code", meta.docCode),
      metaRow("Phiên bản / Version", meta.version),
      metaRow("Ngày hiệu lực / Effective date", meta.effectiveDate),
      metaRow("Ban hành bởi / Issued by", "Ban Giám đốc (BoD) — Board of Directors"),
    ] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}
function metaRow(k, v) {
  return new TableRow({ children: [
    new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand50 }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, children: [para(run(k, { size: 18, bold: true, color: C.brand800 }), { after: 0 })] }),
    new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 140, right: 100 }, children: [para(run(v, { size: 18 }), { after: 0 })] }),
  ] });
}

// ── Trang kiểm soát tài liệu ─────────────────────────────────────────────────
function controlPage() {
  const out = [];
  out.push(para(run("Kiểm soát tài liệu", { font: FONT_HEAD, size: 26, bold: true, color: C.brand700 }), { heading: HeadingLevel.HEADING_1, after: 20 }));
  out.push(para(run("Document control", { size: 16, italics: true, color: C.muted }), { after: 160 }));

  out.push(para(run("Lịch sử phiên bản / Revision history", { font: FONT_HEAD, size: 20, bold: true, color: C.brand800 }), { after: 60 }));
  const rhHead = new TableRow({ tableHeader: true, children: ["Phiên bản / Ver", "Ngày / Date", "Người / By", "Nội dung / Note"].map((h, i) => new TableCell({ width: { size: [16, 18, 26, 40][i], type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 }, margins: { top: 50, bottom: 50, left: 100, right: 100 }, children: [para(run(h, { size: 18, bold: true, color: C.white }), { after: 0 })] })) });
  const rhRows = revisionHistory.map((r) => new TableRow({ children: [r.ver, r.date, r.by, r.note.vi].map((v, i) => new TableCell({ width: { size: [16, 18, 26, 40][i], type: WidthType.PERCENTAGE }, margins: { top: 50, bottom: 50, left: 100, right: 100 }, children: cellParas({ vi: v }) })) }));
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorder(), rows: [rhHead, ...rhRows] }));
  out.push(new Paragraph({ children: [], spacing: { after: 200 } }));

  out.push(para(run("Soạn thảo — Rà soát — Phê duyệt / Prepared — Reviewed — Approved", { font: FONT_HEAD, size: 20, bold: true, color: C.brand800 }), { after: 60 }));
  const apHead = new TableRow({ tableHeader: true, children: ["Vai trò / Role", "Người / Who", "Chữ ký / Signature"].map((h, i) => new TableCell({ width: { size: [34, 33, 33][i], type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.brand600 }, margins: { top: 50, bottom: 50, left: 100, right: 100 }, children: [para(run(h, { size: 18, bold: true, color: C.white }), { after: 0 })] })) });
  const apRows = approvals.map((r) => new TableRow({ children: [
    new TableCell({ width: { size: 34, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: C.surface2 }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: cellParas({ vi: r.role.vi, en: r.role.en }, { bold: true }) }),
    new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: cellParas({ vi: r.who.vi, en: r.who.en }) }),
    new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [para(run("", {}), { after: 0 })] }),
  ] }));
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorder(), rows: [apHead, ...apRows] }));
  out.push(new Paragraph({ children: [new PageBreak()] }));

  // Mục lục
  out.push(para(run("Mục lục", { font: FONT_HEAD, size: 26, bold: true, color: C.brand700 }), { heading: HeadingLevel.HEADING_1, after: 20 }));
  out.push(para(run("Table of contents", { size: 16, italics: true, color: C.muted }), { after: 120 }));
  out.push(new TableOfContents("Mục lục", { hyperlink: true, headingStyleRange: "1-1" }));
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

// ── Header & Footer ──────────────────────────────────────────────────────────
const header = new Header({ children: [
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [
    new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: noBorder, verticalAlign: VerticalAlign.CENTER, margins: { bottom: 40 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ data: markBuf, transformation: { width: 96, height: Math.round(96 * 738 / 2189) } })] })] }),
    new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: noBorder, verticalAlign: VerticalAlign.CENTER, margins: { bottom: 40 }, children: [para(run(meta.title.vi + "  ·  " + meta.docCode, { size: 14, color: C.muted }), { after: 0, align: AlignmentType.RIGHT })] }),
  ] })] }),
] });

const footer = new Footer({ children: [
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [
    new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: noBorder, margins: { top: 40 }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(`${meta.company} · ${meta.est}  —  ${meta.classification.vi}`, { size: 14, color: C.muted })] })] }),
    new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: noBorder, margins: { top: 40 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run("Trang ", { size: 14, color: C.muted }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: C.muted, font: FONT }), run(" / ", { size: 14, color: C.muted }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: C.muted, font: FONT })] })] }),
  ] })] }),
] });

// ── Ghép tài liệu ────────────────────────────────────────────────────────────
const body = [];
for (const b of doc) body.push(...renderBlock(b));

const document = new Document({
  creator: meta.company,
  title: meta.title.vi,
  description: "TCM HS&E Manual",
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: C.ink } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT_HEAD, size: 26, bold: true, color: C.brand700 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT_HEAD, size: 22, bold: true, color: C.brand800 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT_HEAD, size: 20, bold: true, color: C.ink } },
    ],
  },
  numbering: { config: [{ reference: "num-list", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 460, hanging: 300 } } } }] }] },
  sections: [
    // Section 1: bìa (không header/footer)
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 } } }, children: coverPage() },
    // Section 2: nội dung (có header/footer)
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1400, bottom: 1200, left: 1200, right: 1200 } } }, headers: { default: header }, footers: { default: footer }, children: [...controlPage(), ...body] },
  ],
});

const outPath = path.join(__dirname, "TCM-HSE-Manual.docx");
const buf = await Packer.toBuffer(document);
fs.writeFileSync(outPath, buf);
console.log(`✓ Word xuất thành công: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
