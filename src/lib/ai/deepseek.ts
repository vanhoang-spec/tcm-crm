import "server-only";

/**
 * Client gọi DeepSeek API.
 *
 * DeepSeek dùng giao thức tương thích OpenAI nên chỉ cần `fetch` thuần — KHÔNG thêm SDK nào.
 *
 * ⚠ API key CHỈ tồn tại phía server (`process.env.DEEPSEEK_API_KEY`), không bao giờ gửi xuống
 * trình duyệt. Mọi tính năng AI phải đi qua server action / route handler, không gọi trực tiếp
 * từ client. `import "server-only"` ở trên khiến build LỖI ngay nếu ai đó lỡ import file này
 * vào component client.
 *
 * Cấu hình trong .env:
 *   DEEPSEEK_API_KEY=sk-...
 *   DEEPSEEK_MODEL=deepseek-chat        (tuỳ chọn — mặc định deepseek-chat)
 *   DEEPSEEK_BASE_URL=https://api.deepseek.com   (tuỳ chọn)
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
/** Cắt sau 90s — tránh giữ request Next.js treo vô hạn khi API chậm. */
const TIMEOUT_MS = 90_000;

export function isAiConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

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

type ChatOptions = {
  /** 0 = bám sát dữ liệu (phân tích số liệu); 1+ = sáng tạo (brainstorm idea). */
  temperature?: number;
  maxTokens?: number;
  /** Ép model trả JSON thuần — dùng cho các tính năng cần parse có cấu trúc. */
  json?: boolean;
  model?: string;
};

/**
 * Gọi chat completion. Ném `AiError` khi thất bại — caller bắt và dịch mã lỗi sang i18n.
 * KHÔNG tự retry: các tính năng ở đây đều do người dùng bấm nút, tự thử lại rẻ hơn và
 * tránh nhân đôi chi phí token khi API đang quá tải.
 */
export async function aiChat(messages: AiMessage[], opts: ChatOptions = {}): Promise<AiResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new AiError("NOT_CONFIGURED");

  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = opts.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2400,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new AiError("TIMEOUT");
    throw new AiError("UNKNOWN", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new AiError("AUTH", body);
    if (res.status === 429) throw new AiError("RATE_LIMIT", body);
    if (res.status >= 500) throw new AiError("SERVER", `${res.status} ${body}`);
    throw new AiError("UNKNOWN", `${res.status} ${body}`);
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null;

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("EMPTY");

  const u = data?.usage;
  return {
    text,
    usage: u
      ? {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          totalTokens: u.total_tokens ?? 0,
        }
      : null,
  };
}

/** Gọi và parse JSON. Model đôi khi bọc JSON trong ```json — hàm này gỡ trước khi parse. */
export async function aiChatJson<T>(messages: AiMessage[], opts: Omit<ChatOptions, "json"> = {}): Promise<T> {
  const { text } = await aiChat(messages, { ...opts, json: true });
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new AiError("EMPTY", `Không parse được JSON: ${cleaned.slice(0, 300)}`);
  }
}
