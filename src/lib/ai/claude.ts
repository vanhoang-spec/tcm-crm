import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_TIMEOUT_MS, AiError, parseAiJson, type AiMessage, type AiResult, type ChatOptions } from "./types";

/**
 * Client gọi Claude (Anthropic) — dùng cho module MKT: lên kế hoạch tháng, viết bài từng kênh,
 * soạn brief designer, phân tích quý. Các module khác vẫn đi DeepSeek (xem `mkt-ai.ts`).
 *
 * Dùng SDK CHÍNH THỨC `@anthropic-ai/sdk` chứ không fetch thuần như `deepseek.ts`: DeepSeek nói
 * giao thức OpenAI nên fetch là đủ, còn Anthropic có kiểu dữ liệu riêng (content blocks, stream
 * events) mà viết tay chỉ để lặp lại việc SDK đã làm.
 *
 * ⚠ API key CHỈ tồn tại phía server (`process.env.ANTHROPIC_API_KEY`), không bao giờ gửi xuống
 * trình duyệt. `import "server-only"` khiến build LỖI ngay nếu ai lỡ import file này vào component
 * client.
 *
 * Cấu hình trong .env:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   CLAUDE_MODEL=claude-opus-5      (tuỳ chọn — mặc định claude-opus-5)
 */

const DEFAULT_MODEL = "claude-opus-5";

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Tên model đang dùng — để hiện cho người dùng biết bài do model nào viết. */
export function claudeModel(): string {
  return process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;
}

/**
 * Anthropic KHÔNG có `response_format: json_object` như DeepSeek. Cách ép JSON ổn định nhất mà
 * không phải dựng JSON Schema cho từng lời gọi là ĐIỀN SẴN lượt trả lời bằng dấu `{`: model buộc
 * phải viết tiếp từ đó nên không thể mở đầu bằng lời dẫn hay bọc ```json.
 *
 * ⚠ Phần điền sẵn KHÔNG nằm trong nội dung model trả về — phải tự ghép lại (xem `aiChat` bên dưới),
 * quên là mọi lượt JSON đều hỏng ngay ký tự đầu.
 */
const JSON_PREFILL = "{";

/**
 * Gọi Claude. Ném `AiError` cùng bộ mã với DeepSeek — caller không cần biết đang gọi ai.
 *
 * KHÔNG tự thử lại (`maxRetries: 0`), giữ đúng chính sách của `deepseek.ts`: mọi tính năng AI ở
 * đây đều do người dùng bấm nút, và mỗi lần thử lại ăn vào ngân sách 75s chung — hết giờ thì người
 * dùng không nhận được gì cả, tệ hơn là báo lỗi sớm để họ tự bấm lại.
 */
export async function claudeChat(messages: AiMessage[], opts: ChatOptions = {}): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("NOT_CONFIGURED");

  // ⚠ Anthropic tách system prompt RA KHỎI mảng messages (khác OpenAI/DeepSeek nhét vào cùng mảng).
  // Gộp nhiều dòng system lại; phần còn lại phải luân phiên user/assistant.
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (turns.length === 0) throw new AiError("UNKNOWN", "Không có message nào ngoài system");
  if (opts.json) turns.push({ role: "assistant", content: JSON_PREFILL });

  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: AI_TIMEOUT_MS });

  try {
    // Streaming: lượt sinh nội dung dài (kế hoạch cả tháng ~6000 token) mà gọi kiểu chờ-một-cục thì
    // SDK từ chối vì có thể vượt trần request. `finalMessage()` gom lại thành một message hoàn chỉnh
    // nên phần còn lại của hàm không phải xử lý từng sự kiện stream.
    const stream = client.messages.stream({
      model: opts.model ?? claudeModel(),
      max_tokens: opts.maxTokens ?? 2400,
      temperature: opts.temperature ?? 0.3,
      ...(system ? { system } : {}),
      messages: turns,
    });
    const msg = await stream.finalMessage();

    const body = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    // Ghép lại phần điền sẵn — xem chú thích JSON_PREFILL.
    const text = opts.json ? JSON_PREFILL + body : body;
    if (!body) throw new AiError("EMPTY");

    return {
      text,
      usage: {
        promptTokens: msg.usage.input_tokens,
        completionTokens: msg.usage.output_tokens,
        totalTokens: msg.usage.input_tokens + msg.usage.output_tokens,
      },
    };
  } catch (e) {
    throw toAiError(e);
  }
}

/** Gọi và parse JSON. */
export async function claudeChatJson<T>(messages: AiMessage[], opts: Omit<ChatOptions, "json"> = {}): Promise<T> {
  const { text } = await claudeChat(messages, { ...opts, json: true });
  return parseAiJson<T>(text);
}

/** Đổi lỗi của SDK sang bộ mã chung — UI chỉ hiểu `AiErrorCode`, không hiểu lớp lỗi của Anthropic. */
function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new AiError("AUTH", e.message);
  if (e instanceof Anthropic.RateLimitError) return new AiError("RATE_LIMIT", e.message);
  if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError)
    return new AiError("TIMEOUT", e.message);
  if (e instanceof Anthropic.InternalServerError) return new AiError("SERVER", e.message);
  // ⚠ Hết tiền / vượt hạn mức chi tiêu về dưới dạng 400 kèm "credit balance" — xếp vào UNKNOWN thì
  // người dùng thấy "lỗi không xác định" và không ai biết phải đi nạp tiền.
  if (e instanceof Anthropic.APIError && /credit|billing|quota/i.test(e.message)) return new AiError("RATE_LIMIT", e.message);
  if (e instanceof Anthropic.APIError) return new AiError("UNKNOWN", `${e.status ?? "?"} ${e.message}`);
  return new AiError("UNKNOWN", e instanceof Error ? e.message : String(e));
}
