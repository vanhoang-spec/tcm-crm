// =============================================================================
// build-pdf.mjs — Render TCM-HSE-Manual.html → TCM-HSE-Manual.pdf bằng Puppeteer.
// Chạy build-html.mjs trước (hoặc dùng file HTML có sẵn). In theo CSS @page.
// Nếu Puppeteer/Chromium không khả dụng → thoát với hướng dẫn fallback.
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "TCM-HSE-Manual.html");
const pdfPath = path.join(__dirname, "TCM-HSE-Manual.pdf");

if (!fs.existsSync(htmlPath)) {
  console.error("✗ Chưa có TCM-HSE-Manual.html — chạy `node build-html.mjs` trước.");
  process.exit(1);
}

let puppeteer;
try {
  puppeteer = (await import("puppeteer")).default;
} catch {
  console.error("✗ Chưa cài được Puppeteer/Chromium. FALLBACK: mở TCM-HSE-Manual.docx bằng Word → Save as PDF, hoặc mở TCM-HSE-Manual.html trong trình duyệt → In → Lưu PDF.");
  process.exit(2);
}

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
  console.log(`✓ PDF xuất thành công: ${pdfPath} (${kb} KB)`);
} finally {
  await browser.close();
}
