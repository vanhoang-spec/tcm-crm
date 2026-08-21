/**
 * HỢP ĐỒNG CHUNG cho mọi nhà cung cấp AI của app (DeepSeek, Claude).
 *
 * Tách ra khỏi `deepseek.ts` khi gắn thêm Claude (21/08/2026): hai client khác nhau nhưng phải ném
 * CÙNG một loại lỗi và trả CÙNG một hình dạng kết quả, nếu không thì mỗi chỗ gọi phải biết mình
 * đang nói chuyện với ai — đúng thứ tầng này sinh ra để giấu đi.
 *
 * ⚠ `deepseek.ts` re-export lại toàn bộ file này nên ~15 chỗ đang `import { AiError } from
 * "@/lib/ai/deepseek"` KHÔNG phải sửa. Code mới thì import thẳng từ đây.
 *
 * File này CỐ Ý không khai `server-only`: nó chỉ có kiểu + một class lỗi, không chạm khoá API nào.
 */

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

/** Mã lỗi để UI dịch sang vi/en — KHÔNG trả thẳng thông báo lỗi thô của API cho người dùng. */
export type AiErrorCode = "NOT_CONFIGURED" | "AUTH" | "RATE_LIMIT" | "TIMEOUT" | "SERVER" | "EMPTY" | "UNKNOWN";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    /** Chi tiết kỹ thuật — chỉ ghi log phía server, không hiện cho người dùng. */
    readonly detail?: string,
  ) {
    super(code);
    this.name = "AiError";
  }
}

export type AiUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type AiResult = { text: string; usage: AiUsage | null };

export type ChatOptions = {
  /** 0 = bám sát dữ liệu (phân tích số liệu); 1+ = sáng tạo (brainstorm idea). */
  temperature?: number;
  maxTokens?: number;
  /** Ép model trả JSON thuần — dùng cho các tính năng cần parse có cấu trúc. */
  json?: boolean;
  model?: string;
};

/**
 * Trần thời gian cho MỘT lượt gọi AI, dùng chung cho mọi nhà cung cấp.
 *
 * ⚠ CON SỐ NÀY BỊ TRẦN TỪ BÊN NGOÀI, đừng nâng lên mà không kiểm lại đường mạng phía trước:
 * Cloudflare (gói free) ngắt request proxy ở khoảng 100s và trả lỗi 524. Nếu app chỉ bỏ cuộc SAU
 * mốc đó thì người dùng thấy trang lỗi của Cloudflare chứ không phải thông báo của app — mà server
 * vẫn chạy tiếp và CÓ THỂ đã ghi xong vào DB, tức là "hỏng" nhưng thật ra đã thành công.
 * nginx phía trước đặt `proxy_read_timeout 300s` nên nginx KHÔNG phải chỗ thắt cổ chai.
 *
 * Nếu lượt sinh nội dung dài hơn 75s và bắt đầu rớt, cách đúng KHÔNG phải nâng số này lên quá 100s
 * mà là đẩy phần gọi AI sang chạy nền rồi cho client hỏi kết quả sau.
 */
export const AI_TIMEOUT_MS = 75_000;

/** Gỡ ```json ... ``` nếu model lỡ bọc, rồi parse. Dùng chung cho mọi client. */
export function parseAiJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new AiError("EMPTY", `Không parse được JSON: ${cleaned.slice(0, 300)}`);
  }
}
