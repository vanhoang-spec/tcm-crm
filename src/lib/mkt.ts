// MKT post — phần THUẦN, KHÔNG gọi Prisma, KHÔNG import fs.
//
// ⚠ Hằng MIME/dung lượng phải nằm ở ĐÂY chứ không ở `mkt-storage.ts`: ô chọn tệp là client
// component, mà storage import `fs/promises` — kéo storage vào bundle trình duyệt là build hỏng
// ngay (`Module not found: Can't resolve 'fs/promises'`), và cả tsc lẫn eslint đều KHÔNG bắt được,
// chỉ `next build` bắt. Đây đúng là bài học đã ghi ở `client-kb.ts`.

import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Kênh & nhịp đăng
// ─────────────────────────────────────────────────────────

export const MKT_CHANNELS = ["LINKEDIN", "FANPAGE"] as const;
export type MktChannel = (typeof MKT_CHANNELS)[number];

export function isMktChannel(v: string): v is MktChannel {
  return (MKT_CHANNELS as readonly string[]).includes(v);
}

/** Kênh của FILE insights — có thêm OTHER cho file gộp/không rõ nguồn. */
export const MKT_FILE_CHANNELS = ["LINKEDIN", "FANPAGE", "OTHER"] as const;
export type MktFileChannel = (typeof MKT_FILE_CHANNELS)[number];

export function isMktFileChannel(v: string): v is MktFileChannel {
  return (MKT_FILE_CHANNELS as readonly string[]).includes(v);
}

export const MKT_VARIANT_STATUSES = ["DRAFT", "AI_DRAFTED", "POSTED"] as const;
export type MktVariantStatus = (typeof MKT_VARIANT_STATUSES)[number];

/**
 * Nhịp đăng mục tiêu mỗi tuần — cam kết với chủ dự án 04/08/2026.
 * `max` chỉ để hiển thị dải "1–2" của Fanpage; phép so "đủ hay chưa" dùng `min`.
 */
export const MKT_WEEKLY_TARGET: Record<MktChannel, { min: number; max: number }> = {
  LINKEDIN: { min: 1, max: 1 },
  FANPAGE: { min: 1, max: 2 },
};

/** Số tuần hiện trên banner nhịp (tuần này + 3 tuần trước). */
export const MKT_CADENCE_WEEKS = 4;

// ─────────────────────────────────────────────────────────
// Tệp
// ─────────────────────────────────────────────────────────

/** Ảnh bài đăng — đã chèn frame sẵn ngoài app. Cùng dải với ảnh chat (có GIF, 10MB). */
export const MKT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_MKT_IMAGE_BYTES = 10 * 1024 * 1024;

/** File export insights từ Meta/LinkedIn. CSV/XLSX đọc được nhờ 2 nhánh thêm ở ai/extract-text.ts. */
export const MKT_INSIGHT_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/pdf",
] as const;
export const MAX_MKT_INSIGHT_BYTES = 15 * 1024 * 1024;

// Trần độ dài — chống bài phình vô hạn và chống prompt AI nuốt cả cuốn sách.
export const MAX_MKT_TITLE = 200;
export const MAX_MKT_KEY_POINTS = 4000;
export const MAX_MKT_CONTENT = 8000;
export const MAX_MKT_NOTE = 2000;
export const MAX_MKT_URL = 500;

/**
 * Khuôn JSON mà AI phải trả khi viết bài.
 *
 * ⚠ `aiChatJson` chỉ ép kiểu `as T`, KHÔNG validate — mọi output AI phải qua Zod ở caller.
 * `min(50)` chặn ca model trả một câu cụt: bài đăng 20 ký tự thì HR sửa còn lâu hơn tự viết.
 */
export const mktAiContentSchema = z.object({
  content: z.string().trim().min(50).max(MAX_MKT_CONTENT),
});

/** URL rỗng = chưa có (hợp lệ); có thì phải là http(s) và trong trần độ dài. */
export function isValidMktUrl(url: string): boolean {
  if (url === "") return true;
  return url.length <= MAX_MKT_URL && /^https?:\/\/\S+$/.test(url);
}

// ─────────────────────────────────────────────────────────
// Nhịp đăng theo tuần — HÀM THUẦN
//
// ⚠ TẤT CẢ dùng thành phần ngày GIỜ ĐỊA PHƯƠNG (getFullYear/getMonth/getDate/getDay), TUYỆT ĐỐI
// không getUTC*. Server chạy TZ=Asia/Ho_Chi_Minh; đọc bằng UTC thì bài đăng lúc 0–7h sáng bị đẩy
// về ngày hôm trước — đúng bug đã phải vá ở Kho v2 K4 (HANDOVER 10.11).
// ─────────────────────────────────────────────────────────

/** 00:00 thứ Hai của tuần chứa `d`, theo giờ địa phương. */
export function weekStartLocal(d: Date): Date {
  const day = d.getDay(); // 0 = CN
  const backToMonday = day === 0 ? 6 : day - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - backToMonday);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export type CadenceWeek = {
  /** 00:00 thứ Hai của tuần. */
  start: Date;
  counts: Record<MktChannel, number>;
};

export type PostedMark = { channel: string; postedAt: Date };

/**
 * Đếm số bài ĐÃ ĐĂNG theo tuần, cho `weeks` tuần gần nhất — tuần MỚI NHẤT đứng đầu mảng.
 * Bài ngoài khung thời gian bị bỏ qua; kênh lạ bị bỏ qua (dữ liệu cũ / kênh gỡ sau này).
 */
export function computeWeeklyCadence(
  posted: PostedMark[],
  now: Date,
  weeks: number = MKT_CADENCE_WEEKS,
): CadenceWeek[] {
  const thisWeek = weekStartLocal(now);
  const out: CadenceWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    out.push({ start: addDays(thisWeek, -7 * i), counts: { LINKEDIN: 0, FANPAGE: 0 } });
  }
  const oldest = out[out.length - 1].start;
  for (const p of posted) {
    if (!isMktChannel(p.channel)) continue;
    const ws = weekStartLocal(p.postedAt);
    if (ws < oldest || ws > thisWeek) continue;
    // Chênh lệch ngày chia 7 — tuần 0 là tuần này. Dùng mốc 00:00 địa phương của CẢ HAI vế nên
    // phép trừ không bị lệch bởi giờ trong ngày.
    const idx = Math.round((thisWeek.getTime() - ws.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const bucket = out[idx];
    if (bucket) bucket.counts[p.channel] += 1;
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Quý — cho báo cáo insights
// ─────────────────────────────────────────────────────────

export function isValidQuarter(q: number): boolean {
  return Number.isInteger(q) && q >= 1 && q <= 4;
}

export function isValidFiscalYear(y: number): boolean {
  return Number.isInteger(y) && y >= 2020 && y <= 2100;
}

/** [đầu quý 00:00, đầu quý SAU 00:00) theo giờ địa phương — nửa mở, so bằng `< end`. */
export function quarterRange(year: number, quarter: number): { start: Date; end: Date } {
  const firstMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, firstMonth, 1),
    end: new Date(year, firstMonth + 3, 1),
  };
}

export type QuarterStats = {
  totals: Record<MktChannel, number>;
  /** Mục tiêu cả quý = số tuần (trọn hoặc dở) chạm vào quý × mục tiêu tuần. */
  weekCount: number;
  weeks: CadenceWeek[];
};

/**
 * Thống kê một quý để ghép vào prompt AI. Đây là số CHUẨN về nhịp đăng — file export của Meta/
 * LinkedIn không biết TCM đặt mục tiêu bao nhiêu bài/tuần, còn app thì biết.
 */
export function buildQuarterStats(posted: PostedMark[], year: number, quarter: number): QuarterStats {
  const { start, end } = quarterRange(year, quarter);
  const firstWeek = weekStartLocal(start);
  const weeks: CadenceWeek[] = [];
  for (let w = firstWeek; w < end; w = addDays(w, 7)) {
    weeks.push({ start: w, counts: { LINKEDIN: 0, FANPAGE: 0 } });
  }
  const totals: Record<MktChannel, number> = { LINKEDIN: 0, FANPAGE: 0 };
  for (const p of posted) {
    if (!isMktChannel(p.channel)) continue;
    if (p.postedAt < start || p.postedAt >= end) continue;
    totals[p.channel] += 1;
    const ws = weekStartLocal(p.postedAt);
    const bucket = weeks.find((x) => x.start.getTime() === ws.getTime());
    if (bucket) bucket.counts[p.channel] += 1;
  }
  return { totals, weekCount: weeks.length, weeks };
}
