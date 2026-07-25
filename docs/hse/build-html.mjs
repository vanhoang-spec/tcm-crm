// =============================================================================
// build-html.mjs — Renderer HTML in-sẵn cho Sổ tay HS&E (nguồn cho PDF + fallback).
// Đọc content.mjs → xuất TCM-HSE-Manual.html (self-contained, logo base64, CSS @page).
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { meta, doc, policy, annexes, glossary, revisionHistory, approvals } from "./content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const b64 = (p) => "data:image/png;base64," + fs.readFileSync(path.join(REPO, p)).toString("base64");
const LOGO = b64("public/brand/logo.png");
const MARK = b64("public/brand/mark.png");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CALLOUT = {
  note: { cls: "note", label: "LƯU Ý / NOTE" },
  warning: { cls: "warn", label: "CẢNH BÁO / WARNING" },
  danger: { cls: "danger", label: "NGUY HIỂM / DANGER" },
  good: { cls: "good", label: "THỰC HÀNH TỐT / GOOD PRACTICE" },
};

// TOC: thu thập part + h1
const toc = [];
let chapterCount = 0, partCount = 0;
for (const b of doc) {
  if (b.t === "part") { partCount++; toc.push({ kind: "part", id: `part-${partCount}`, vi: b.vi, en: b.en }); }
  if (b.t === "h1") { chapterCount++; toc.push({ kind: "h1", id: `ch-${chapterCount}`, label: b.num ? `Chương ${b.num}. ${b.vi}` : b.vi, en: b.en }); }
}

const cellHtml = (c) => {
  const vi = typeof c === "string" ? c : c.vi;
  const en = typeof c === "object" ? c.en : undefined;
  return esc(vi) + (en ? `<div class="en-sm">${esc(en)}</div>` : "");
};

function tableHtml(b) {
  const widths = b.widths || b.head.map(() => Math.floor(100 / b.head.length));
  const colg = widths.map((w) => `<col style="width:${w}%">`).join("");
  const head = `<tr>${b.head.map((h) => `<th>${esc(h.vi)}${h.en ? `<div class="en-sm on-brand">${esc(h.en)}</div>` : ""}</th>`).join("")}</tr>`;
  const rows = b.rows.map((r) => `<tr>${r.map((c) => `<td>${cellHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<table><colgroup>${colg}</colgroup><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

let pi = 0, ci = 0;
function block(b) {
  switch (b.t) {
    case "part": pi++; return `<div class="part" id="part-${pi}"><div class="part-vi">${esc(b.vi)}</div>${b.en ? `<div class="part-en">${esc(b.en)}</div>` : ""}</div>`;
    case "h1": ci++; return `<h1 id="ch-${ci}">${esc(b.num ? `Chương ${b.num}. ${b.vi}` : b.vi)}${b.en ? `<span class="h-en">${esc(b.en)}</span>` : ""}</h1>`;
    case "h2": return `<h2>${esc(b.vi)}${b.en ? `<span class="h-en">${esc(b.en)}</span>` : ""}</h2>`;
    case "h3": return `<h3>${esc(b.vi)}${b.en ? `<span class="h-en">${esc(b.en)}</span>` : ""}</h3>`;
    case "p": return `<p>${esc(b.vi)}</p>${b.en ? `<p class="en">${esc(b.en)}</p>` : ""}`;
    case "ul": return `<ul>${b.items.map((it) => `<li>${esc(typeof it === "string" ? it : it.vi)}</li>`).join("")}</ul>`;
    case "ol": return `<ol>${b.items.map((it) => `<li>${esc(typeof it === "string" ? it : it.vi)}</li>`).join("")}</ol>`;
    case "table": return tableHtml(b);
    case "callout": { const c = CALLOUT[b.variant] || CALLOUT.note; return `<div class="callout ${c.cls}"><div class="cl-label">${c.label}</div><div>${esc(b.vi)}</div>${b.en ? `<div class="en">${esc(b.en)}</div>` : ""}</div>`; }
    case "summary": return `<div class="summary"><div class="sum-title">English summary</div><ul>${b.items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`;
    case "spacer": return `<div style="height:12px"></div>`;
    case "pagebreak": return `<div class="pb"></div>`;
    case "policyStatement": return policyHtml();
    case "annexList": return annexHtml();
    default: return "";
  }
}

function signHtml(roles) {
  return roles.map((r) => `<div class="sign"><div class="sign-role">${esc(r.vi)} <span class="en-sm">/ ${esc(r.en)}</span></div><div class="sign-line">Ký &amp; ghi rõ họ tên / Signature &amp; full name: ______________________________</div><div class="sign-line">Ngày / Date: ____ / ____ / __________</div></div>`).join("");
}

function policyHtml() {
  return `<div class="policy">
    <h1 class="center" id="policy">${esc(policy.titleVi)}</h1>
    <div class="center h-en block">${esc(policy.titleEn)}</div>
    ${policy.vi.map((p) => `<p>${esc(p)}</p>`).join("")}
    <ul>${policy.viBullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    <p>${esc(policy.viClose)}</p>
    <div class="en-head">— English —</div>
    ${policy.en.map((p) => `<p class="en">${esc(p)}</p>`).join("")}
    <ul class="en">${policy.enBullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    <p class="en">${esc(policy.enClose)}</p>
    ${signHtml(policy.signRoles)}
  </div>`;
}

function annexHtml() {
  let out = "";
  for (const a of annexes) {
    out += `<h2>Phụ lục ${a.code} — ${esc(a.vi)} <span class="h-en">${esc(a.en)}</span></h2>`;
    if (a.desc) out += `<p>${esc(a.desc.vi)} <span class="en-sm">${esc(a.desc.en)}</span></p>`;
    if (a.fields && a.fields.length) {
      out += `<table class="form"><tbody>${a.fields.map(([vi, en]) => `<tr><td class="f-label">${esc(vi)}<div class="en-sm">${esc(en)}</div></td><td class="f-blank"></td></tr>`).join("")}</tbody></table>`;
    }
    if (a.check && a.check.length) {
      out += `<table class="form"><tbody>${a.check.map(([vi, en]) => `<tr><td class="f-check">☐</td><td>${esc(vi)}<div class="en-sm">${esc(en)}</div></td></tr>`).join("")}</tbody></table>`;
    }
    if (a.code === "A") out += signHtml(policy.signRoles);
  }
  out += `<div class="pb"></div><h2>Phụ lục M — Thuật ngữ song ngữ (VI–EN) <span class="h-en">Bilingual glossary</span></h2>`;
  out += `<table><colgroup><col style="width:50%"><col style="width:50%"></colgroup><thead><tr><th>Tiếng Việt</th><th>English</th></tr></thead><tbody>${glossary.map(([vi, en]) => `<tr><td>${esc(vi)}</td><td>${esc(en)}</td></tr>`).join("")}</tbody></table>`;
  return out;
}

const bodyHtml = doc.map(block).join("\n");

const tocHtml = `<div class="toc"><h1>Mục lục <span class="h-en">Table of contents</span></h1>
  ${toc.map((t) => t.kind === "part"
    ? `<div class="toc-part"><a href="#${t.id}">${esc(t.vi)}</a></div>`
    : `<div class="toc-ch"><a href="#${t.id}">${esc(t.label)}</a></div>`).join("")}
</div>`;

const controlHtml = `<div class="control">
  <h1>Kiểm soát tài liệu <span class="h-en">Document control</span></h1>
  <h2>Lịch sử phiên bản <span class="h-en">Revision history</span></h2>
  <table><colgroup><col style="width:16%"><col style="width:18%"><col style="width:26%"><col style="width:40%"></colgroup>
    <thead><tr><th>Phiên bản / Ver</th><th>Ngày / Date</th><th>Người / By</th><th>Nội dung / Note</th></tr></thead>
    <tbody>${revisionHistory.map((r) => `<tr><td>${esc(r.ver)}</td><td>${esc(r.date)}</td><td>${esc(r.by)}</td><td>${esc(r.note.vi)}</td></tr>`).join("")}</tbody></table>
  <h2>Soạn thảo — Rà soát — Phê duyệt <span class="h-en">Prepared — Reviewed — Approved</span></h2>
  <table><colgroup><col style="width:34%"><col style="width:33%"><col style="width:33%"></colgroup>
    <thead><tr><th>Vai trò / Role</th><th>Người / Who</th><th>Chữ ký / Signature</th></tr></thead>
    <tbody>${approvals.map((r) => `<tr><td><b>${esc(r.role.vi)}</b><div class="en-sm">${esc(r.role.en)}</div></td><td>${esc(r.who.vi)}<div class="en-sm">${esc(r.who.en)}</div></td><td style="height:44px"></td></tr>`).join("")}</tbody></table>
</div>`;

const coverHtml = `<div class="cover">
  <img class="cover-logo" src="${LOGO}" alt="TCM">
  <div class="cover-bar"></div>
  <div class="cover-title">${esc(meta.title.vi)}</div>
  <div class="cover-title-en">${esc(meta.title.en)}</div>
  <div class="cover-class">${esc(meta.classification.vi)} · ${esc(meta.classification.en)}</div>
  <table class="cover-meta">
    <tr><td class="k">Mã tài liệu / Doc code</td><td>${esc(meta.docCode)}</td></tr>
    <tr><td class="k">Phiên bản / Version</td><td>${esc(meta.version)}</td></tr>
    <tr><td class="k">Ngày hiệu lực / Effective date</td><td>${esc(meta.effectiveDate)}</td></tr>
    <tr><td class="k">Ban hành bởi / Issued by</td><td>Ban Giám đốc (BoD) — Board of Directors</td></tr>
  </table>
</div>`;

const CSS = `
  :root{ --brand:#0068E6; --brand700:#0052B8; --brand800:#023F8F; --brand900:#0A3269;
    --brand50:#EEF6FF; --brand100:#DCECFF; --brand200:#B3D9FF;
    --ink:#0F172A; --muted:#64748B; --border:#E2E8F0; --surface2:#F6F8FB; }
  @page{ size:A4; margin:20mm 16mm 18mm 16mm;
    @bottom-left{ content:"${meta.company} · ${meta.est} — ${meta.classification.vi}"; font-size:8pt; color:#64748B; }
    @bottom-right{ content:"Trang " counter(page) " / " counter(pages); font-size:8pt; color:#64748B; } }
  @page:first{ margin:0; @bottom-left{content:""} @bottom-right{content:""} }
  *{ box-sizing:border-box; }
  body{ font-family:"Nunito","Segoe UI",Arial,sans-serif; color:var(--ink); font-size:10.5pt; line-height:1.5; margin:0; }
  h1{ font-size:17pt; color:var(--brand700); font-weight:800; margin:14pt 0 4pt; border-bottom:2.5pt solid var(--brand); padding-bottom:3pt; page-break-after:avoid; }
  h2{ font-size:13pt; color:var(--brand800); font-weight:800; margin:12pt 0 3pt; page-break-after:avoid; }
  h3{ font-size:11.5pt; color:var(--ink); font-weight:800; margin:9pt 0 2pt; page-break-after:avoid; }
  .h-en{ font-weight:500; font-style:italic; color:var(--muted); font-size:9pt; margin-left:8px; }
  p{ margin:0 0 7pt; }
  p.en, .en{ color:var(--muted); font-style:italic; font-size:9pt; }
  ul,ol{ margin:0 0 8pt; padding-left:20px; } li{ margin:0 0 3pt; }
  .en-sm{ color:var(--muted); font-style:italic; font-size:8.5pt; } .en-sm.on-brand{ color:#DCECFF; }
  table{ width:100%; border-collapse:collapse; margin:2pt 0 10pt; font-size:9.5pt; page-break-inside:auto; }
  th{ background:var(--brand); color:#fff; text-align:left; padding:5pt 7pt; font-weight:700; vertical-align:middle; }
  td{ border:0.75pt solid var(--border); padding:4pt 7pt; vertical-align:top; }
  th{ border:0.75pt solid var(--brand); }
  tbody tr:nth-child(even) td{ background:var(--surface2); }
  tr{ page-break-inside:avoid; }
  .part{ background:var(--brand); color:#fff; padding:12pt 14pt; margin:16pt 0 10pt; border-radius:6px; page-break-inside:avoid; page-break-after:avoid; }
  .part-vi{ font-size:16pt; font-weight:800; text-transform:uppercase; letter-spacing:.3px; }
  .part-en{ font-size:9.5pt; color:var(--brand100); font-style:italic; margin-top:2px; }
  .callout{ padding:9pt 12pt; margin:6pt 0 11pt; border-left:5px solid; border-radius:4px; page-break-inside:avoid; font-size:10pt; }
  .cl-label{ font-weight:800; font-size:8pt; letter-spacing:.4px; margin-bottom:3pt; }
  .callout.note{ background:var(--brand50); border-color:var(--brand); } .callout.note .cl-label{ color:var(--brand700); }
  .callout.warn{ background:#FFFBEB; border-color:#B45309; } .callout.warn .cl-label{ color:#B45309; }
  .callout.danger{ background:#FEF2F2; border-color:#B91C1C; } .callout.danger .cl-label{ color:#B91C1C; }
  .callout.good{ background:#ECFDF3; border-color:#15803D; } .callout.good .cl-label{ color:#15803D; }
  .summary{ background:var(--brand50); border:1pt solid var(--brand200); border-radius:5px; padding:8pt 12pt; margin:6pt 0 12pt; page-break-inside:avoid; }
  .sum-title{ font-weight:800; color:var(--brand700); font-size:9.5pt; margin-bottom:3pt; }
  .summary ul{ margin:0; padding-left:18px; } .summary li{ color:var(--brand900); font-style:italic; font-size:9pt; }
  .pb{ page-break-before:always; }
  .center{ text-align:center; } .block{ display:block; }
  /* cover */
  .cover{ height:297mm; padding:34mm 20mm 0; text-align:center; page-break-after:always; display:flex; flex-direction:column; align-items:center; }
  .cover-logo{ width:78mm; margin-bottom:6mm; }
  .cover-bar{ width:60mm; height:5px; background:var(--brand); border-radius:3px; margin-bottom:16mm; }
  .cover-title{ font-size:30pt; font-weight:800; color:var(--brand900); text-transform:uppercase; line-height:1.15; }
  .cover-title-en{ font-size:15pt; font-style:italic; color:var(--muted); margin-top:5mm; }
  .cover-class{ margin-top:20mm; font-weight:800; color:var(--brand700); font-size:11pt; text-transform:uppercase; }
  .cover-meta{ width:78%; margin:16mm auto 0; border:1pt solid var(--brand200); }
  .cover-meta td{ padding:6pt 12pt; font-size:10pt; text-align:left; }
  .cover-meta td.k{ background:var(--brand50); font-weight:700; color:var(--brand800); width:52%; }
  /* toc */
  .toc-part{ font-weight:800; color:var(--brand800); margin:9pt 0 3pt; }
  .toc-ch{ margin:1.5pt 0 1.5pt 14px; }
  .toc a{ color:var(--ink); text-decoration:none; } .toc-part a{ color:var(--brand800); }
  /* forms */
  table.form td.f-label{ background:var(--surface2); font-weight:700; width:42%; }
  table.form td.f-blank{ height:26px; }
  table.form td.f-check{ text-align:center; color:var(--brand); font-size:13pt; width:34px; }
  .en-head{ color:var(--brand); font-weight:800; font-size:9pt; margin:8pt 0 4pt; }
  .sign{ margin:14pt 0; } .sign-role{ font-weight:800; font-size:10.5pt; margin-bottom:6pt; }
  .sign-line{ color:var(--muted); font-size:9.5pt; margin-bottom:5pt; }
`;

const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>${esc(meta.title.vi)} — ${esc(meta.docCode)}</title>
<style>${CSS}</style></head>
<body>
${coverHtml}
${controlHtml}
<div class="pb"></div>
${tocHtml}
<div class="pb"></div>
${bodyHtml}
</body></html>`;

const outPath = path.join(__dirname, "TCM-HSE-Manual.html");
fs.writeFileSync(outPath, html, "utf8");
console.log(`✓ HTML xuất thành công: ${outPath} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
