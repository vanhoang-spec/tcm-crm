import { lookup } from "dns/promises";

/**
 * "Unfurl" link preview cho tin nhắn type=LINK — server tự fetch trang đích, đọc thẻ og:* để hiển
 * thị card preview (ảnh/title/mô tả) ngay trong khung chat, KHÔNG cần client gọi ra ngoài.
 *
 * Rủi ro SSRF (server tự fetch URL do user nhập): chặn bằng DNS resolve trước rồi kiểm tra IP có
 * thuộc dải private/loopback/link-local hay không (chặn được localhost, 127.0.0.1, 169.254.169.254
 * — cloud metadata endpoint, 192.168.x, 10.x, 172.16-31.x…). Đây là chặn ở mức hợp lý cho 1 tính
 * năng tiện ích nội bộ — KHÔNG chống được tấn công DNS-rebinding tinh vi (đòi hỏi pin IP ở tầng
 * socket, không cần thiết cho use-case này).
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 500_000; // đủ cho hầu hết <head>; dừng sớm khi gặp </head>

export type LinkPreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // dạng lạ → chặn cho an toàn
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local, gồm cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.slice(7));
  return false;
}

function decodeHtmlEntities(s: string | null): string | null {
  if (!s) return null;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim() || null;
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Trả preview hoặc null nếu URL không hợp lệ/không truy cập được/không phải trang HTML. Không throw. */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateOrReservedIp(address)) return null;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TCM-CRM-LinkPreview/1.0)" },
    });
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});

    const title = decodeHtmlEntities(extractMeta(html, "og:title") ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? null);
    const description = decodeHtmlEntities(extractMeta(html, "og:description") ?? extractMeta(html, "description"));
    let imageUrl = extractMeta(html, "og:image");
    if (imageUrl) {
      try {
        const abs = new URL(imageUrl, url);
        imageUrl = abs.protocol === "http:" || abs.protocol === "https:" ? abs.toString() : null;
      } catch {
        imageUrl = null;
      }
    }
    const siteName = decodeHtmlEntities(extractMeta(html, "og:site_name")) ?? url.hostname;

    if (!title && !description && !imageUrl) return null;
    return { title, description, imageUrl, siteName };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
