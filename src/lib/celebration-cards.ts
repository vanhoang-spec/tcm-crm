/**
 * Sinh ảnh chúc mừng (SVG, tự vẽ — không phụ thuộc asset ngoài) cho 2 loại tin nhắn tự động trong
 * "GIA ĐÌNH TCM": sinh nhật nhân sự + sinh nhật công ty (xem lib/occasions.ts). "Động" (như GIF) đạt
 * được bằng CSS @keyframes NHÚNG trong SVG — trình duyệt vẫn chạy animation dù ảnh được load qua
 * thẻ <img> tĩnh (khác JS, CSS/SMIL animation trong SVG hoạt động bình thường qua <img src>).
 * Chỉ nhận tên nhân sự làm input tự do → escape XML để an toàn dù rủi ro thấp (nội dung hệ thống tự sinh).
 */

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c", "#f87171"];

function confettiSvg(count: number, maxY: number): string {
  return Array.from({ length: count }, () => {
    const x = Math.round(Math.random() * 800);
    const y = Math.round(Math.random() * maxY);
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const rot = Math.round(Math.random() * 360);
    const size = 5 + Math.round(Math.random() * 5);
    return `<rect x="${x}" y="${y}" width="${size}" height="${(size * 0.4).toFixed(1)}" fill="${color}" opacity="0.85" transform="rotate(${rot} ${x} ${y})" rx="1"/>`;
  }).join("");
}

/** 1 cây bánh kem (3 tầng) đặt tại (cx, baseY) = tâm đáy, kèm N ngọn nến có ngọn lửa lung linh (CSS animate). */
function cakeSvg(cx: number, baseY: number, candleCount: number): string {
  const tierW = [220, 170, 120];
  const tierH = 42;
  const tiers = tierW
    .map((w, i) => {
      const y = baseY - (i + 1) * tierH;
      const x = cx - w / 2;
      const fill = i === 0 ? "#f9a8d4" : i === 1 ? "#fbcfe8" : "#fde4f2";
      return `<rect x="${x}" y="${y}" width="${w}" height="${tierH}" rx="8" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="#ffffff" opacity="0.65"/>`;
    })
    .join("");
  const topW = tierW[2];
  const topY = baseY - 3 * tierH;
  const candleSpacing = topW / (candleCount + 1);
  const candles = Array.from({ length: candleCount }, (_, i) => {
    const x = cx - topW / 2 + candleSpacing * (i + 1);
    const stickY = topY - 26;
    const flicker = i % 2 === 0 ? "flicker-a" : "flicker-b";
    return `
      <rect x="${(x - 3).toFixed(1)}" y="${stickY}" width="6" height="26" rx="2" fill="#facc15"/>
      <g class="${flicker}" style="transform-origin: ${x.toFixed(1)}px ${(stickY - 2).toFixed(1)}px;">
        <path d="M ${(x - 5).toFixed(1)} ${(stickY - 2).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 22).toFixed(1)} ${(x + 5).toFixed(1)} ${(stickY - 2).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 10).toFixed(1)} ${(x - 5).toFixed(1)} ${(stickY - 2).toFixed(1)} Z" fill="#fb923c"/>
        <path d="M ${(x - 2.5).toFixed(1)} ${(stickY - 3).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 15).toFixed(1)} ${(x + 2.5).toFixed(1)} ${(stickY - 3).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 7).toFixed(1)} ${(x - 2.5).toFixed(1)} ${(stickY - 3).toFixed(1)} Z" fill="#fde047"/>
      </g>`;
  }).join("");
  return `<g>${tiers}${candles}</g>`;
}

/** Ảnh 800×450: bánh kem + nến lung linh + confetti + "Happy Birthday {name}" baked vào ảnh. */
export function buildBirthdaySvg(fullName: string): string {
  const name = xmlEscape(fullName);
  const nameFontSize = name.length > 20 ? 30 : name.length > 12 ? 36 : 42;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bgBday" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b0764"/>
      <stop offset="100%" stop-color="#831843"/>
    </linearGradient>
    <style>
      @keyframes flickerA { 0% { transform: scale(1) skewX(0deg); opacity: 0.92; } 50% { transform: scale(1.18,1.3) skewX(4deg); opacity: 1; } 100% { transform: scale(0.88,1.05) skewX(-3deg); opacity: 0.85; } }
      @keyframes flickerB { 0% { transform: scale(0.95,1.1) skewX(-3deg); opacity: 0.88; } 50% { transform: scale(1.15,1.05) skewX(3deg); opacity: 1; } 100% { transform: scale(1,1.2) skewX(0deg); opacity: 0.9; } }
      .flicker-a { animation: flickerA 0.9s ease-in-out infinite alternate; }
      .flicker-b { animation: flickerB 1.15s ease-in-out infinite alternate; }
    </style>
  </defs>
  <rect width="800" height="450" fill="url(#bgBday)"/>
  ${confettiSvg(30, 140)}
  ${cakeSvg(400, 390, 5)}
  <text x="400" y="130" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="${nameFontSize}" font-weight="700" fill="#ffffff">🎂 Happy Birthday 🎂</text>
  <text x="400" y="178" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="34" font-weight="700" fill="#fde047">${name}</text>
</svg>`;
}

function burstSvg(cx: number, cy: number, color: string, r: number, animClass: string): string {
  const rays = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const x2 = (cx + Math.cos(angle) * r).toFixed(1);
    const y2 = (cy + Math.sin(angle) * r).toFixed(1);
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="3.5" fill="${color}"/>`;
  }).join("");
  return `<g class="${animClass}" style="transform-origin: ${cx}px ${cy}px;">${rays}<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/></g>`;
}

/** Ảnh 800×450: bánh kem + pháo hoa nhiều màu lấp lánh (CSS twinkle) + "Happy birthday TCM - N years". */
export function buildCompanyBirthdaySvg(years: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bgCo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1120"/>
      <stop offset="100%" stop-color="#0b3b6b"/>
    </linearGradient>
    <style>
      @keyframes flickerA { 0% { transform: scale(1) skewX(0deg); opacity: 0.92; } 50% { transform: scale(1.18,1.3) skewX(4deg); opacity: 1; } 100% { transform: scale(0.88,1.05) skewX(-3deg); opacity: 0.85; } }
      @keyframes flickerB { 0% { transform: scale(0.95,1.1) skewX(-3deg); opacity: 0.88; } 50% { transform: scale(1.15,1.05) skewX(3deg); opacity: 1; } 100% { transform: scale(1,1.2) skewX(0deg); opacity: 0.9; } }
      .flicker-a { animation: flickerA 0.9s ease-in-out infinite alternate; }
      .flicker-b { animation: flickerB 1.15s ease-in-out infinite alternate; }
      @keyframes twinkle { 0% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.35; transform: scale(0.85); } }
      .tw1 { animation: twinkle 1.4s ease-in-out infinite; }
      .tw2 { animation: twinkle 1.7s ease-in-out infinite 0.3s; }
      .tw3 { animation: twinkle 1.2s ease-in-out infinite 0.6s; }
      .tw4 { animation: twinkle 1.9s ease-in-out infinite 0.15s; }
      .tw5 { animation: twinkle 1.5s ease-in-out infinite 0.45s; }
    </style>
  </defs>
  <rect width="800" height="450" fill="url(#bgCo)"/>
  ${burstSvg(120, 90, "#fbbf24", 55, "tw1")}
  ${burstSvg(660, 85, "#f472b6", 60, "tw2")}
  ${burstSvg(400, 50, "#60a5fa", 45, "tw3")}
  ${burstSvg(710, 210, "#34d399", 42, "tw4")}
  ${burstSvg(85, 220, "#a78bfa", 40, "tw5")}
  ${confettiSvg(24, 130)}
  ${cakeSvg(400, 390, 4)}
  <text x="400" y="110" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="38" font-weight="700" fill="#ffffff">🎉 Happy birthday TCM 🎉</text>
  <text x="400" y="160" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="30" font-weight="700" fill="#fde047">${years} years</text>
</svg>`;
}
