// Cảnh báo tập trung khách hàng (FR-11) — hàm thuần, KHÔNG gọi Prisma.
//
// Rủi ro nghề: một khách chiếm quá nhiều doanh thu của team thì mất khách đó là mất mảng kinh
// doanh. Doanh thu lấy theo SỐ ĐÃ XUẤT HÓA ĐƠN (ClientInvoice) — số thật đã ghi nhận, không phải
// giá chào trên CO/CE vốn có thể không bao giờ thành đơn.

export type ClientRevenue = { clientId: string; clientName: string; teamCode: string | null; revenue: number };

export type ConcentrationItem = {
  clientName: string;
  teamCode: string | null;
  revenue: number;
  teamRevenue: number;
  sharePct: number;
};

/**
 * Khách vượt ngưỡng % doanh thu của TEAM mình. Trả về danh sách đã sắp giảm dần theo tỉ trọng.
 * Team chưa có doanh thu thì bỏ qua (chia cho 0). Ngưỡng lấy từ Settings, mặc định 40%.
 */
export function findConcentrationRisks(rows: ClientRevenue[], thresholdPct: number): ConcentrationItem[] {
  const teamTotals = new Map<string, number>();
  for (const r of rows) {
    const key = r.teamCode ?? "";
    teamTotals.set(key, (teamTotals.get(key) ?? 0) + r.revenue);
  }

  const out: ConcentrationItem[] = [];
  for (const r of rows) {
    if (r.revenue <= 0) continue;
    const teamRevenue = teamTotals.get(r.teamCode ?? "") ?? 0;
    if (teamRevenue <= 0) continue;
    const sharePct = (r.revenue / teamRevenue) * 100;
    if (sharePct >= thresholdPct) {
      out.push({ clientName: r.clientName, teamCode: r.teamCode, revenue: r.revenue, teamRevenue, sharePct });
    }
  }
  return out.sort((a, b) => b.sharePct - a.sharePct);
}
