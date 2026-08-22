import "server-only";
import { textToSafeHtml } from "@/lib/recruit-email";

/**
 * Client gửi email qua Resend (TD-2b).
 *
 * Dùng `fetch` thuần, KHÔNG thêm SDK: Resend là đúng MỘT lời gọi `POST /emails` — cùng lý do
 * `deepseek.ts` không kéo SDK về.
 *
 * ⚠ CHƯA KHAI KHOÁ thì mọi hàm ở đây là no-op có báo lỗi rõ ràng (`NOT_CONFIGURED`), app chạy bình
 * thường, nút gửi bị khoá kèm câu giải thích. Khuôn giống Claude / VAPID / MKT_TOKEN_SECRET.
 *
 * Cấu hình trong .env trên MÁY CHỦ (không vào git):
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM="TCM Careers <careers@tcmbtl.com>"
 *   RESEND_REPLY_TO=hr@tcmbtl.com        (tuỳ chọn)
 *
 * ⚠⚠ RESEND ĐÒI XÁC MINH DOMAIN `tcmbtl.com` BẰNG BẢN GHI DNS (SPF + DKIM). Không làm bước đó thì
 * thư gửi ứng viên hoặc vào spam hoặc bị chặn thẳng — khai khoá KHÔNG đủ. Việc của chủ dự án/IT.
 */

const API_URL = "https://api.resend.com/emails";
/** Thư ngắn, không có gì phải chờ lâu; treo request Next 30s là quá đủ. */
const TIMEOUT_MS = 30_000;

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
}

/** Địa chỉ người gửi đang khai — hiện ở bản xem trước để HR biết thư đi từ hộp nào. */
export function resendFrom(): string {
  return process.env.RESEND_FROM ?? "";
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * ⚠ Khoá API có thể lọt vào thông báo lỗi của tầng mạng (URL, header dội lại). Làm sạch TRƯỚC khi
 * lưu vào sổ thư hay ghi log — cùng bài học `scrubSecrets` của MKT-2b.
 */
export function scrubResendError(msg: string): string {
  const key = process.env.RESEND_API_KEY;
  let out = msg;
  if (key && key.length > 6) out = out.split(key).join("re_***");
  return out.replace(/re_[A-Za-z0-9_-]{10,}/g, "re_***").slice(0, 500);
}

/**
 * Gửi MỘT thư. KHÔNG tự thử lại: người dùng bấm nút, và thử lại một thư có thể thành gửi HAI lần
 * cho ứng viên nếu lần đầu thật ra đã đi được mà chỉ hỏng lúc đọc phản hồi.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  /** Văn bản thuần — hàm tự bọc thành HTML an toàn và gửi kèm bản text. */
  text: string;
  replyTo?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return { ok: false, error: "NOT_CONFIGURED" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: textToSafeHtml(opts.text),
        text: opts.text,
        ...(opts.replyTo || process.env.RESEND_REPLY_TO
          ? { reply_to: opts.replyTo || process.env.RESEND_REPLY_TO }
          : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const bodyText = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, error: scrubResendError(`HTTP ${res.status}: ${bodyText}`) };

    let id: string | null = null;
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id ?? null;
    } catch {
      id = null;
    }
    return { ok: true, id };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, error: "TIMEOUT" };
    return { ok: false, error: scrubResendError(e instanceof Error ? e.message : String(e)) };
  } finally {
    clearTimeout(timer);
  }
}
