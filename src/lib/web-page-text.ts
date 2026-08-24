import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Tải một trang web do NGƯỜI DÙNG nhập rồi bóc lấy text — dùng cho link portfolio/profile của ứng
 * viên (yêu cầu chủ dự án 24/08/2026: "các bạn thiết kế hay gửi link web profile của mình").
 *
 * ⚠⚠ ĐÂY LÀ BỀ MẶT SSRF. Server này đứng TRONG LAN công ty (192.168.1.111) cạnh các dịch vụ nội bộ
 * không có xác thực. Cho server đi tải một URL tuỳ ý mà không chặn là mở đường cho người đăng nhập
 * bất kỳ đọc dịch vụ nội bộ qua chính app. Bốn lớp chặn dưới đây, KHÔNG được gỡ lớp nào:
 *   1. chỉ `http:`/`https:` — chặn `file:`, `gopher:`, `ftp:` (đọc file trên đĩa server).
 *   2. PHÂN GIẢI TÊN MIỀN ra IP rồi chặn dải nội bộ — chặn theo TÊN là vô dụng, vì tên miền công
 *      khai trỏ được về 127.0.0.1 hoặc 192.168.x.x.
 *   3. TỰ ĐI TỪNG CHUYỂN HƯỚNG (`redirect: "manual"`) và kiểm LẠI IP ở MỖI CHẶNG — trang công khai
 *      chuyển hướng 302 về `http://169.254.169.254` là đủ phá lớp 2 nếu để `fetch` tự đi.
 *   4. trần thời gian + trần dung lượng + chỉ nhận vài loại nội dung.
 *
 * ⚠ HẠN CHẾ ĐÃ BIẾT, CHẤP NHẬN: giữa lúc kiểm IP và lúc kết nối vẫn có khe DNS rebinding (kiểm xong
 * thì bản ghi đổi). Bịt hẳn phải tự mở socket theo IP đã kiểm và tự lo TLS SNI — quá nặng cho một ô
 * nhập link mà chỉ HR (có `recruit.manage`) dùng được. Ghi ra đây để người sau biết mà cân nhắc.
 */

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export type WebPageError = "BAD_URL" | "BLOCKED_HOST" | "TOO_MANY_REDIRECTS" | "HTTP_ERROR" | "BAD_CONTENT" | "TOO_LARGE" | "TIMEOUT" | "EMPTY";
export type WebPageResult = { ok: true; text: string; finalUrl: string; title: string | null } | { ok: false; error: WebPageError };

/** IPv4/IPv6 nội bộ, loopback, link-local, và IP metadata của các nhà cung cấp đám mây. */
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;          // this-network, private, loopback
    if (a === 169 && b === 254) return true;                     // link-local + metadata đám mây
    if (a === 172 && b >= 16 && b <= 31) return true;             // private
    if (a === 192 && b === 168) return true;                      // private
    if (a === 100 && b >= 64 && b <= 127) return true;            // CGNAT
    if (a === 192 && b === 0) return true;                        // IETF protocol assignments
    if (a >= 224) return true;                                    // multicast + reserved
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true; // link-local, ULA
    // IPv4 ánh xạ vào IPv6 (::ffff:127.0.0.1) — kiểm lại phần IPv4.
    const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true; // không phải IP hợp lệ → chặn
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  // Người dùng gõ thẳng IP thì kiểm ngay, khỏi phân giải.
  if (isIP(hostname)) return !isPrivateIp(hostname);
  try {
    const addrs = await lookup(hostname, { all: true });
    if (addrs.length === 0) return false;
    // MỌI địa chỉ phải công khai — một bản ghi trỏ nội bộ là đủ để chặn.
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
}

/**
 * Tải trang và trả về text thuần. `extract` được TIÊM VÀO thay vì import trực tiếp để file này
 * không kéo theo `pdf-parse`/`mammoth`/`exceljs` khi chỗ gọi chỉ cần HTML.
 */
export async function fetchWebPageText(
  rawUrl: string,
  extract: (buffer: Buffer, mime: string, maxChars: number) => Promise<{ text: string } | null>,
  maxChars: number,
): Promise<WebPageResult> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "BAD_URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "BAD_URL" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await assertPublicHost(url.hostname))) return { ok: false, error: "BLOCKED_HOST" };
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          // User-Agent thật: nhiều trang portfolio chặn thẳng request không có UA.
          "User-Agent": "Mozilla/5.0 (compatible; TCM-CRM/1.0)",
          Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.5",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "HTTP_ERROR" };
        if (hop === MAX_REDIRECTS) return { ok: false, error: "TOO_MANY_REDIRECTS" };
        url = new URL(loc, url); // URL tương đối cũng đi được
        if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "BLOCKED_HOST" };
        continue;
      }
      break;
    }
    if (!res) return { ok: false, error: "HTTP_ERROR" };
    if (!res.ok) return { ok: false, error: "HTTP_ERROR" };

    const ctype = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const allowed = ["text/html", "application/xhtml+xml", "text/plain", "text/markdown", "application/pdf"];
    if (!allowed.includes(ctype)) return { ok: false, error: "BAD_CONTENT" };

    // Trần dung lượng kiểm HAI LẦN: theo header (rẻ) và theo dữ liệu thật (header nói dối được).
    const declared = Number(res.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_PAGE_BYTES) return { ok: false, error: "TOO_LARGE" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_PAGE_BYTES) return { ok: false, error: "TOO_LARGE" };

    const extracted = await extract(buf, ctype === "application/xhtml+xml" ? "text/html" : ctype, maxChars);
    const text = extracted?.text?.trim() ?? "";
    if (!text) return { ok: false, error: "EMPTY" };
    return { ok: true, text, finalUrl: url.toString(), title: ctype.includes("html") ? titleOf(buf.toString("utf8")) : null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, error: "TIMEOUT" };
    console.error("[WEB] fetchWebPageText lỗi:", e);
    return { ok: false, error: "HTTP_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

/** Xuất riêng để test được phần chặn IP mà không phải đi mạng. */
export const __testing = { isPrivateIp };
