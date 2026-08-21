import "server-only";
import { scrubSecrets } from "./mkt-secret";
import type { MktChannel } from "./mkt";

/**
 * MKT-2b/2c — LỚP GỌI API Facebook Page (Graph) và LinkedIn organization.
 *
 * ⚠ File này KHÔNG đọc DB và KHÔNG tự lấy token — người gọi truyền token vào. Nhờ vậy test được
 * bằng `fetchImpl` giả mà không cần token thật và không đụng trang thật của công ty.
 *
 * ⚠ MỌI lỗi trả về đều đi qua `scrubSecrets`: hai nền tảng hay dội lại nguyên URL có
 * `access_token=…` trong message, lưu thẳng là token nằm chữ thường trong DB.
 *
 * ⚠ Phân biệt hai loại hỏng, vì cách xử lý khác hẳn nhau:
 *   - `AUTH` (token hết hạn / bị thu hồi / thiếu quyền) → phải NỐI LẠI KÊNH, thử lại vô ích.
 *   - `TEMP` (mạng, 429, 5xx) → thử lại lượt sau là được.
 * Job đăng theo lịch chỉ bỏ cuộc vĩnh viễn với `AUTH`; `TEMP` thì để nguyên cho lượt sau.
 */

export type ApiFailKind = "AUTH" | "TEMP" | "BAD_REQUEST";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; kind: ApiFailKind; message: string };

export type Fetcher = typeof fetch;

const GRAPH = "https://graph.facebook.com/v21.0";
const LI = "https://api.linkedin.com";

const fail = (kind: ApiFailKind, message: string): ApiResult<never> => ({ ok: false, kind, message: scrubSecrets(message) });

/** Mã HTTP → loại hỏng. 401/403 là token; 429/5xx là tạm; còn lại là sai yêu cầu. */
function kindOf(status: number): ApiFailKind {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 429 || status >= 500) return "TEMP";
  return "BAD_REQUEST";
}

async function call<T>(f: Fetcher, url: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    // Mạng hỏng / DNS / timeout — luôn là TEMP, lượt sau thử lại.
    return fail("TEMP", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as { error?: { message?: string; code?: number }; message?: string } | null;
    // Graph nhét lỗi token vào error.code 190 kèm HTTP 400 — không đọc code này thì token chết bị
    // xếp nhầm vào BAD_REQUEST và job cứ thử lại mãi.
    const graphAuth = b?.error?.code === 190 || b?.error?.code === 102 || b?.error?.code === 10;
    const msg = b?.error?.message ?? b?.message ?? text.slice(0, 300) ?? `HTTP ${res.status}`;
    return fail(graphAuth ? "AUTH" : kindOf(res.status), `HTTP ${res.status}: ${msg}`);
  }
  return { ok: true, data: (body ?? {}) as T };
}

// ─────────────────────────────────────────────────────────
// FACEBOOK PAGE
// ─────────────────────────────────────────────────────────

/** Kiểm token còn sống + lấy tên trang. */
export async function fbCheck(f: Fetcher, pageId: string, token: string): Promise<ApiResult<{ name: string }>> {
  return call<{ name: string }>(f, `${GRAPH}/${encodeURIComponent(pageId)}?fields=name&access_token=${encodeURIComponent(token)}`, { method: "GET" });
}

/**
 * Đăng bài chữ (kèm link ảnh nếu có) lên Page.
 *
 * ⚠ Trả `id` dạng "{pageId}_{postId}" — đó chính là khoá để MKT-2c kéo số liệu. Không lưu id này là
 * bài đăng rồi mà mãi không có số liệu.
 */
export async function fbPublish(f: Fetcher, pageId: string, token: string, message: string, imageUrl?: string | null): Promise<ApiResult<{ id: string }>> {
  const body = new URLSearchParams({ message, access_token: token });
  if (imageUrl) body.set("link", imageUrl);
  return call<{ id: string }>(f, `${GRAPH}/${encodeURIComponent(pageId)}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

type FbInsightRow = { name: string; values: { value: number }[] };

/** Số liệu một bài Facebook. Chỉ số nào nền tảng không trả thì để null — KHÔNG đoán bằng 0. */
export async function fbPostMetrics(f: Fetcher, externalId: string, token: string): Promise<ApiResult<{ impressions: number | null; reactions: number | null; comments: number | null; shares: number | null; clicks: number | null }>> {
  const metrics = "post_impressions,post_clicks";
  const r = await call<{ insights?: { data: FbInsightRow[] }; reactions?: { summary?: { total_count: number } }; comments?: { summary?: { total_count: number } }; shares?: { count: number } }>(
    f,
    `${GRAPH}/${encodeURIComponent(externalId)}?fields=insights.metric(${metrics}),reactions.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(token)}`,
    { method: "GET" },
  );
  if (!r.ok) return r;
  const pick = (name: string): number | null => {
    const row = r.data.insights?.data?.find((x) => x.name === name);
    const v = row?.values?.[0]?.value;
    return typeof v === "number" ? v : null;
  };
  return {
    ok: true,
    data: {
      impressions: pick("post_impressions"),
      clicks: pick("post_clicks"),
      reactions: r.data.reactions?.summary?.total_count ?? null,
      comments: r.data.comments?.summary?.total_count ?? null,
      shares: r.data.shares?.count ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────
// LINKEDIN ORGANIZATION
// ─────────────────────────────────────────────────────────

function liHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    // LinkedIn đòi khai phiên bản API theo tháng; thiếu header này là 426 Upgrade Required.
    "LinkedIn-Version": "202405",
    "Content-Type": "application/json",
  };
}

/** Kiểm token + lấy tên tổ chức. `orgUrn` dạng "urn:li:organization:123". */
export async function liCheck(f: Fetcher, orgUrn: string, token: string): Promise<ApiResult<{ name: string }>> {
  const id = orgUrn.split(":").pop() ?? "";
  const r = await call<{ localizedName?: string; name?: { localized?: Record<string, string> } }>(f, `${LI}/rest/organizations/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: liHeaders(token),
  });
  if (!r.ok) return r;
  const name = r.data.localizedName ?? Object.values(r.data.name?.localized ?? {})[0] ?? "";
  return { ok: true, data: { name } };
}

/**
 * Đăng bài chữ lên trang công ty LinkedIn (Posts API).
 *
 * ⚠ Id bài nằm ở HEADER `x-restli-id` chứ không phải body — body thường rỗng. Đọc body để lấy id là
 * luôn ra null và MKT-2c không bao giờ kéo được số liệu.
 */
export async function liPublish(f: Fetcher, orgUrn: string, token: string, text: string): Promise<ApiResult<{ id: string }>> {
  const payload = {
    author: orgUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  let res: Response;
  try {
    res = await f(`${LI}/rest/posts`, { method: "POST", headers: liHeaders(token), body: JSON.stringify(payload) });
  } catch (e) {
    return fail("TEMP", e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const t = await res.text();
    return fail(kindOf(res.status), `HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const id = res.headers.get("x-restli-id") ?? "";
  if (!id) return fail("BAD_REQUEST", "LinkedIn không trả x-restli-id — không lưu được id bài để kéo số liệu");
  return { ok: true, data: { id } };
}

/** Số liệu một bài LinkedIn (organizationalEntityShareStatistics theo share URN). */
export async function liPostMetrics(f: Fetcher, orgUrn: string, shareUrn: string, token: string): Promise<ApiResult<{ impressions: number | null; reactions: number | null; comments: number | null; shares: number | null; clicks: number | null }>> {
  const url =
    `${LI}/rest/organizationalEntityShareStatistics?q=organizationalEntity` +
    `&organizationalEntity=${encodeURIComponent(orgUrn)}&shares[0]=${encodeURIComponent(shareUrn)}`;
  const r = await call<{ elements?: { totalShareStatistics?: { impressionCount?: number; likeCount?: number; commentCount?: number; shareCount?: number; clickCount?: number } }[] }>(f, url, {
    method: "GET",
    headers: liHeaders(token),
  });
  if (!r.ok) return r;
  const s = r.data.elements?.[0]?.totalShareStatistics;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return { ok: true, data: { impressions: num(s?.impressionCount), reactions: num(s?.likeCount), comments: num(s?.commentCount), shares: num(s?.shareCount), clicks: num(s?.clickCount) } };
}

// ─────────────────────────────────────────────────────────
// Bộ chọn theo kênh
// ─────────────────────────────────────────────────────────

export async function checkConnection(f: Fetcher, channel: MktChannel, targetId: string, token: string): Promise<ApiResult<{ name: string }>> {
  return channel === "FANPAGE" ? fbCheck(f, targetId, token) : liCheck(f, targetId, token);
}

export async function publishToChannel(f: Fetcher, channel: MktChannel, targetId: string, token: string, text: string): Promise<ApiResult<{ id: string }>> {
  return channel === "FANPAGE" ? fbPublish(f, targetId, token, text) : liPublish(f, targetId, token, text);
}

export async function fetchPostMetrics(f: Fetcher, channel: MktChannel, targetId: string, externalId: string, token: string) {
  return channel === "FANPAGE" ? fbPostMetrics(f, externalId, token) : liPostMetrics(f, targetId, externalId, token);
}
