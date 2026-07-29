// Cảnh báo tập trung khách hàng (FR-11) — hàm thuần, KHÔNG gọi Prisma.
//
// Rủi ro nghề: một khách chiếm quá nhiều doanh thu của team thì mất khách đó là mất mảng kinh
// doanh. Doanh thu lấy theo SỐ ĐÃ XUẤT HÓA ĐƠN (ClientInvoice) — số thật đã ghi nhận, không phải
// giá chào trên CO/CE vốn có thể không bao giờ thành đơn.
//
// H1 — GOM THEO NHÓM: rủi ro thật nằm ở NHÓM chứ không ở từng pháp nhân. AEON có 4 pháp nhân ký
// riêng, mỗi bên chỉ ~15% nên trước đây không bao giờ vượt ngưỡng — trong khi mất cả nhóm AEON là
// mất 60%. Nay mỗi ĐỐI TƯỢNG = nhóm nếu khách có nhóm, ngược lại là chính khách đó.

/** Một pháp nhân + doanh thu của nó. `groupId` khác null = khách thuộc một nhóm. */
export type ClientRevenue = {
  clientId: string;
  clientName: string;
  teamCode: string | null;
  revenue: number;
  groupId?: string | null;
  groupName?: string | null;
};

export type ConcentrationItem = {
  /** Tên nhóm nếu gom theo nhóm, ngược lại là tên khách. */
  subjectName: string;
  /** Mã team; null khi đối tượng vắt nhiều team (mẫu số lúc đó là TOÀN CÔNG TY). */
  teamCode: string | null;
  /** true = đối tượng là một nhóm nhiều pháp nhân. */
  isGroup: boolean;
  /** Số pháp nhân trong đối tượng (1 với khách lẻ). */
  memberCount: number;
  revenue: number;
  /** Mẫu số đã dùng: doanh thu team, hoặc toàn công ty khi đối tượng vắt nhiều team. */
  baseRevenue: number;
  sharePct: number;
};

/**
 * Đối tượng vượt ngưỡng % doanh thu, sắp giảm dần theo tỉ trọng.
 *
 * MẪU SỐ — quy tắc đã chốt:
 *  · đối tượng nằm gọn trong 1 team   → mẫu số = doanh thu team đó (giữ đúng nghĩa cũ)
 *  · đối tượng vắt ≥2 team (AEON: A2+A3) → mẫu số = doanh thu TOÀN CÔNG TY, `teamCode = null`
 *
 * Chọn vậy vì chẻ doanh thu một nhóm về từng team rồi so với từng mẫu số team sẽ đẻ nhiều dòng
 * cảnh báo cho cùng một rủi ro, và không dòng nào nói đúng độ lớn thật. Đánh đổi: hai loại % khác
 * mẫu số — nhãn hiển thị PHẢI ghi rõ (xem concentration-banner.tsx).
 *
 * Mẫu số ≤ 0 thì bỏ qua (chia cho 0).
 */
export function findConcentrationRisks(rows: ClientRevenue[], thresholdPct: number): ConcentrationItem[] {
  type Subject = { name: string; isGroup: boolean; members: Set<string>; teams: Set<string>; revenue: number };
  const subjects = new Map<string, Subject>();
  const teamTotals = new Map<string, number>();
  let companyTotal = 0;

  for (const r of rows) {
    const key = r.groupId ?? `client:${r.clientId}`;
    const cur = subjects.get(key) ?? {
      name: r.groupId ? (r.groupName ?? r.clientName) : r.clientName,
      isGroup: !!r.groupId,
      members: new Set<string>(),
      teams: new Set<string>(),
      revenue: 0,
    };
    cur.members.add(r.clientId);
    cur.teams.add(r.teamCode ?? "");
    cur.revenue += r.revenue;
    subjects.set(key, cur);

    const tk = r.teamCode ?? "";
    teamTotals.set(tk, (teamTotals.get(tk) ?? 0) + r.revenue);
    companyTotal += r.revenue;
  }

  const out: ConcentrationItem[] = [];
  for (const s of subjects.values()) {
    if (s.revenue <= 0) continue;
    const single = s.teams.size === 1;
    const onlyTeam = [...s.teams][0];
    const teamCode = single ? (onlyTeam || null) : null;
    const baseRevenue = single ? (teamTotals.get(onlyTeam) ?? 0) : companyTotal;
    if (baseRevenue <= 0) continue;
    const sharePct = (s.revenue / baseRevenue) * 100;
    if (sharePct < thresholdPct) continue;
    out.push({
      subjectName: s.name,
      teamCode,
      isGroup: s.isGroup,
      memberCount: s.members.size,
      revenue: s.revenue,
      baseRevenue,
      sharePct,
    });
  }
  return out.sort((a, b) => b.sharePct - a.sharePct);
}
