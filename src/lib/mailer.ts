import nodemailer from "nodemailer";
import { appBaseUrl } from "@/lib/auth-session";

/**
 * Gửi email (chỉ dùng cho link đặt lại mật khẩu hiện tại).
 *
 * SMTP là TUỲ CHỌN: nếu chưa khai báo SMTP_HOST trong .env thì hàm không gửi gì và trả
 * `{ sent: false }` — lúc đó UI hiện link đặt lại ngay trên màn hình để admin copy gửi tay
 * (qua Zalo/chat nội bộ). Nhờ vậy tính năng "Quên mật khẩu" chạy được ngay cả khi công ty
 * chưa cấu hình email, và tự động chuyển sang gửi mail khi khai báo SMTP.
 *
 * Cấu hình trong .env:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=crm@tcmbtl.com
 *   SMTP_PASS=<mật khẩu ứng dụng>
 *   SMTP_FROM="TCM CRM <crm@tcmbtl.com>"
 */

export function isMailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

export type MailResult = { sent: boolean; error?: string };

async function sendMail(to: string, subject: string, text: string, html: string): Promise<MailResult> {
  if (!isMailConfigured()) return { sent: false };
  try {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = SMTPS; 587 dùng STARTTLS (nodemailer tự nâng cấp)
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "no-reply@tcmbtl.com",
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e) {
    // Không ném lỗi ra ngoài: gửi mail hỏng không được phép làm hỏng luồng đặt lại mật khẩu —
    // caller sẽ rơi về phương án hiện link để gửi tay.
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function resetPasswordUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Email đặt lại mật khẩu — song ngữ ngắn gọn, không phụ thuộc next-intl (chạy ngoài request context). */
export async function sendPasswordResetEmail(to: string, fullName: string, token: string, ttlMinutes: number): Promise<MailResult> {
  const url = resetPasswordUrl(token);
  const subject = "TCM CRM — Đặt lại mật khẩu / Reset your password";
  const text = [
    `Xin chào ${fullName},`,
    "",
    "Bạn (hoặc quản trị viên) vừa yêu cầu đặt lại mật khẩu TCM CRM.",
    `Mở link sau để đặt mật khẩu mới (link hết hạn sau ${ttlMinutes} phút):`,
    url,
    "",
    "Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.",
    "",
    "— TCM CRM",
  ].join("\n");
  const html = `
    <div style="font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#0F172A">
      <p>Xin chào <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Bạn (hoặc quản trị viên) vừa yêu cầu đặt lại mật khẩu TCM CRM.</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(url)}" style="background:#0068E6;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;display:inline-block">Đặt mật khẩu mới</a>
      </p>
      <p style="color:#475569;font-size:13.5px">Link hết hạn sau ${ttlMinutes} phút. Nếu nút không bấm được, copy địa chỉ này vào trình duyệt:<br>
      <span style="word-break:break-all">${escapeHtml(url)}</span></p>
      <p style="color:#475569;font-size:13.5px">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>
      <p style="color:#94A3B8;font-size:12.5px;margin-top:28px">TCM — Targeted Marketing</p>
    </div>`;
  return sendMail(to, subject, text, html);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
