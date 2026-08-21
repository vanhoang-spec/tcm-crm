import "server-only";
import { aiChat, aiChatJson, isAiConfigured } from "./deepseek";
import { claudeChat, claudeChatJson, claudeModel, isClaudeConfigured } from "./claude";
import type { AiMessage, AiResult, ChatOptions } from "./types";

/**
 * MODULE MKT DÙNG NHÀ CUNG CẤP NÀO — một nguồn sự thật (quyết định chủ dự án 21/08/2026: gắn API
 * Claude cho phần lên kế hoạch + viết bài MKT).
 *
 * ⚠ CHỈ MKT đi qua đây. Đọc CV, bóc biên bản họp, so báo giá NCC, kho kiến thức khách, soạn văn bản
 * hành chính… vẫn gọi thẳng `deepseek.ts` như cũ. Đừng "thống nhất" bằng cách kéo hết sang Claude:
 * đó là đổi nhà cung cấp cho 5 module đang chạy thật, phải hỏi chủ dự án trước.
 *
 * ⚠ CÓ ĐƯỜNG RƠI VỀ DEEPSEEK, và đó là CHỦ ĐÍCH: production hôm nay chạy bằng DeepSeek: deploy bản
 * này lên trước khi khai `ANTHROPIC_API_KEY` mà không có đường rơi thì toàn bộ MKT chết ngay.
 * ⚠ Đổi lại, việc đang dùng model nào KHÔNG ĐƯỢC IM LẶNG: `mktAiProviderLabel()` đi vào hộp xác
 * nhận trước mỗi nút AI (người bấm phải biết dữ liệu bay sang đâu) và vào trang /settings/ai.
 * Bỏ nhãn đi là biến đây thành thứ đổi model sau lưng người dùng.
 */

export type MktAiProvider = "CLAUDE" | "DEEPSEEK";

/** Nhà cung cấp đang có hiệu lực; null = chưa khai khoá nào, tính năng AI của MKT tắt. */
export function mktAiProvider(): MktAiProvider | null {
  if (isClaudeConfigured()) return "CLAUDE";
  if (isAiConfigured()) return "DEEPSEEK";
  return null;
}

export function isMktAiConfigured(): boolean {
  return mktAiProvider() !== null;
}

/** Nhãn hiện cho người dùng, kèm tên model để biết chính xác bài do model nào viết. */
export function mktAiProviderLabel(): string {
  const p = mktAiProvider();
  if (p === "CLAUDE") return `Claude (${claudeModel()})`;
  if (p === "DEEPSEEK") return `DeepSeek (${process.env.DEEPSEEK_MODEL ?? "deepseek-chat"})`;
  return "—";
}

export async function mktChat(messages: AiMessage[], opts: ChatOptions = {}): Promise<AiResult> {
  return mktAiProvider() === "CLAUDE" ? claudeChat(messages, opts) : aiChat(messages, opts);
}

export async function mktChatJson<T>(messages: AiMessage[], opts: Omit<ChatOptions, "json"> = {}): Promise<T> {
  return mktAiProvider() === "CLAUDE" ? claudeChatJson<T>(messages, opts) : aiChatJson<T>(messages, opts);
}
