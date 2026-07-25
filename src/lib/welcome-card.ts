/**
 * Sinh ảnh chào mừng (SVG, tự vẽ — không phụ thuộc asset ngoài) khi 1 nhân sự mới (@tcmbtl.com) được
 * tự động thêm vào nhóm "GIA ĐÌNH TCM" lúc đăng nhập lần đầu (xem ensureTcmFamilyMembership trong chat.ts).
 * Chỉ dùng nội bộ (server tự tạo nội dung, KHÔNG nhận input tự do từ ngoài ngoài tên nhân sự) nên rủi ro
 * injection thấp, vẫn escape tên để an toàn.
 */

const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c"];

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function burstSvg(cx: number, cy: number, color: string, r: number): string {
  const rays = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const x2 = (cx + Math.cos(angle) * r).toFixed(1);
    const y2 = (cy + Math.sin(angle) * r).toFixed(1);
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/><circle cx="${x2}" cy="${y2}" r="3.5" fill="${color}"/>`;
  }).join("");
  return `<g>${rays}<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/></g>`;
}

function confettiSvg(): string {
  return Array.from({ length: 36 }, () => {
    const x = Math.round(Math.random() * 800);
    const y = Math.round(Math.random() * 180);
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const rot = Math.round(Math.random() * 360);
    const size = 5 + Math.round(Math.random() * 5);
    return `<rect x="${x}" y="${y}" width="${size}" height="${(size * 0.4).toFixed(1)}" fill="${color}" opacity="0.8" transform="rotate(${rot} ${x} ${y})" rx="1"/>`;
  }).join("");
}

/** Ảnh 800×450 dạng SVG: nền gradient tối + pháo hoa + confetti + dòng "Welcome {name} / onboard TCM family". */
export function buildWelcomeSvg(fullName: string): string {
  const name = xmlEscape(fullName);
  const nameFontSize = name.length > 22 ? 30 : name.length > 14 ? 36 : 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1120"/>
      <stop offset="100%" stop-color="#1a1040"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  ${burstSvg(140, 100, "#fbbf24", 55)}
  ${burstSvg(650, 90, "#f472b6", 60)}
  ${burstSvg(420, 55, "#60a5fa", 45)}
  ${burstSvg(730, 220, "#34d399", 40)}
  ${burstSvg(70, 240, "#a78bfa", 42)}
  ${confettiSvg()}
  <text x="400" y="270" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="${nameFontSize}" font-weight="700" fill="#ffffff">🎉 Welcome ${name} 🎉</text>
  <text x="400" y="320" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="26" font-weight="500" fill="#e7edf7">onboard TCM family</text>
  <text x="400" y="368" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="15" fill="#93a3c2">TCM — Targeted Marketing · Est 2000</text>
</svg>`;
}
