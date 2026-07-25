// ─────────────────────────────────────────────────────────
// Period engine dùng chung (Creative cost + KPI): periodCode tự mô tả "YYYY-Mmm | YYYY-Qn | YYYY-Hn | YYYY".
// Tách từ creative-cost.ts (re-export ở đó giữ nguyên caller cũ) — KHÔNG đổi hành vi.
// ─────────────────────────────────────────────────────────

export const COST_REVIEW_CYCLES = ["MONTH", "QUARTER", "HALF", "YEAR"] as const;
export type CostReviewCycle = (typeof COST_REVIEW_CYCLES)[number];

/** Số tháng trong 1 kỳ, SUY RA TỪ periodCode (không lấy từ setting hiện hành — tránh định giá lại kỳ đã lưu). */
export type ParsedPeriod = { start: Date; end: Date; months: number };

/** Parse periodCode tự mô tả → { start, end (exclusive), months }. null nếu sai định dạng. */
export function parsePeriodCode(code: string): ParsedPeriod | null {
  const mMonth = /^(\d{4})-M(\d{2})$/.exec(code);
  if (mMonth) {
    const y = Number(mMonth[1]);
    const mo = Number(mMonth[2]);
    if (mo < 1 || mo > 12) return null;
    return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)), months: 1 };
  }
  const mQ = /^(\d{4})-Q([1-4])$/.exec(code);
  if (mQ) {
    const y = Number(mQ[1]);
    const q = Number(mQ[2]);
    const startMo = (q - 1) * 3;
    return { start: new Date(Date.UTC(y, startMo, 1)), end: new Date(Date.UTC(y, startMo + 3, 1)), months: 3 };
  }
  const mH = /^(\d{4})-H([12])$/.exec(code);
  if (mH) {
    const y = Number(mH[1]);
    const h = Number(mH[2]);
    const startMo = (h - 1) * 6;
    return { start: new Date(Date.UTC(y, startMo, 1)), end: new Date(Date.UTC(y, startMo + 6, 1)), months: 6 };
  }
  const mY = /^(\d{4})$/.exec(code);
  if (mY) {
    const y = Number(mY[1]);
    return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)), months: 12 };
  }
  return null;
}

/** periodCode của thời điểm `date` theo cycle. Truyền date từ ngoài (Date.now() không dùng được trong 1 số ngữ cảnh). */
export function currentPeriodCode(cycle: CostReviewCycle, date: Date): string {
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth(); // 0-based
  if (cycle === "YEAR") return `${y}`;
  if (cycle === "HALF") return `${y}-H${mo < 6 ? 1 : 2}`;
  if (cycle === "QUARTER") return `${y}-Q${Math.floor(mo / 3) + 1}`;
  return `${y}-M${String(mo + 1).padStart(2, "0")}`;
}

/** Dịch periodCode tới trước/sau 1 đơn vị chu kỳ (dir = ±1). Trả nguyên code cũ nếu parse lỗi. */
export function shiftPeriodCode(cycle: CostReviewCycle, code: string, dir: 1 | -1): string {
  const p = parsePeriodCode(code);
  if (!p) return code;
  const d = new Date(p.start);
  if (cycle === "MONTH") d.setUTCMonth(d.getUTCMonth() + dir);
  else if (cycle === "QUARTER") d.setUTCMonth(d.getUTCMonth() + 3 * dir);
  else if (cycle === "HALF") d.setUTCMonth(d.getUTCMonth() + 6 * dir);
  else d.setUTCFullYear(d.getUTCFullYear() + dir);
  return currentPeriodCode(cycle, d);
}
