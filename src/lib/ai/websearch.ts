import "server-only";

/**
 * Tìm kiếm web để "neo" câu trả lời AI vào nguồn thật.
 *
 * Vì sao cần: DeepSeek (và mọi LLM) không truy cập internet, nên khi hỏi về xu hướng/tin mới nó
 * sẽ bịa tên chiến dịch và số liệu nghe rất thuyết phục. Có lớp này thì model đọc trích đoạn từ
 * trang web thật rồi mới tổng hợp, và bắt buộc dẫn link để người đọc tự kiểm chứng.
 *
 * Dùng Tavily — dịch vụ search thiết kế riêng cho LLM (trả sẵn nội dung đã bóc tách, không phải
 * chỉ danh sách link). Gọi bằng `fetch` thuần, KHÔNG thêm SDK.
 *
 * Cấu hình trong .env (tuỳ chọn — không có thì tính năng tự rơi về chế độ kiến thức chung):
 *   TAVILY_API_KEY=tvly-...
 */

const TAVILY_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 25_000;

export function isWebSearchConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

export type WebSource = {
  title: string;
  url: string;
  /** Trích đoạn nội dung Tavily đã bóc tách sẵn từ trang. */
  content: string;
  publishedDate: string | null;
};

type TavilyResponse = {
  results?: { title?: string; url?: string; content?: string; published_date?: string }[];
};

/**
 * Trả về các nguồn liên quan. Mảng rỗng nghĩa là không tìm được / chưa cấu hình / lỗi mạng —
 * caller phải xử lý được trường hợp này, KHÔNG ném lỗi làm hỏng cả tính năng.
 */
export async function searchWeb(query: string, maxResults = 6): Promise<WebSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        // "advanced" bóc tách kỹ hơn — đáng giá vì mỗi lần chạy là do người dùng chủ động bấm.
        search_depth: "advanced",
        max_results: maxResults,
        // Ưu tiên bài trong 1 năm gần đây: hỏi về xu hướng thì tin cũ 5 năm gây hiểu sai.
        topic: "general",
        days: 365,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[websearch] Tavily trả lỗi:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data = (await res.json()) as TavilyResponse;
    return (data.results ?? [])
      .filter((r) => r.url && r.content)
      .map((r) => ({
        title: r.title?.trim() || r.url!,
        url: r.url!,
        // Cắt bớt để không thổi phồng số token gửi lên model.
        content: r.content!.slice(0, 1500),
        publishedDate: r.published_date ?? null,
      }));
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") console.error("[websearch] quá thời gian chờ");
    else console.error("[websearch] lỗi:", e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mở rộng câu hỏi của người dùng thành truy vấn tìm kiếm sát ngành hơn.
 * Người dùng thường gõ ngắn ("trend activation FMCG") — thêm bối cảnh giúp kết quả đúng thị trường VN.
 */
export function buildIndustryQuery(question: string): string {
  return `${question} sự kiện activation marketing Việt Nam`;
}
