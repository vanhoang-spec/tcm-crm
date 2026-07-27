// C4 — P&L dự án: KẾ HOẠCH (CO/CE sống) vs THỰC CHI (tiền đã ra) vs THỰC THU (hóa đơn/đã thu).
// Hàm thuần, KHÔNG gọi Prisma. Trang /projects/[id]/pnl nạp số rồi gọi computePnl.
//
// Nguyên tắc (bám 4 bất biến + quyết định CEO 27/07):
// - "Kế hoạch" = bảng CO/CE CTRACT SỐNG (không phải baseline rev1 — 3 revision của T013 đang chứa
//   hai loại số trong cùng cột coTotal, lấy baseline sẽ ra "tiết kiệm 1,5 tỷ" ảo; đối chiếu
//   baseline để đợt sau khi dữ liệu revision được chuẩn hoá).
// - "Đã chi" = tạm ứng + phiếu chi CHƯA HUỶ, LOẠI khoản gắn dòng Chi hộ (bất biến #2 — chi hộ là
//   tiền hộ khách, ngoài lãi lỗ). CÙNG bộ lọc với projectDisbursement.
// - "Cam kết thêm" = PO còn sống chưa chi + CTV đã nhập chưa thành phiếu chi — làn CAM KẾT, không
//   ăn trần, chỉ để CEO thấy tiền SẼ ra (bất biến #3: không cộng vào đâu cả).
// - Chi hộ tách khối riêng; hóa đơn có thể GỘP cả phần chi hộ (hóa đơn = CE + Chi hộ) — nói rõ
//   trong cảnh báo thay vì im lặng.

export type PnlInput = {
  /** Doanh thu kế hoạch = CE của bảng sống (KHÔNG gồm Chi hộ). */
  cePlan: number;
  /** Giá vốn kế hoạch = coTotal bảng sống (đã gross-up thuế). */
  coPlan: number;
  /** Chi hộ kế hoạch (ngoài P&L, hiển thị riêng). */
  chiHoPlan: number;
  /** Σ hóa đơn chưa huỷ (có thể gộp phần chi hộ). */
  invoiced: number;
  /** Σ tiền khách đã trả. */
  collected: number;
  /** Đã chi thật (tạm ứng + phiếu chi chưa huỷ, loại dòng Chi hộ). */
  disbursed: number;
  /** PO còn sống chưa chi (max 0) + CTV đã nhập chưa thành phiếu chi (max 0). */
  committed: number;
  hasSheet: boolean;
  hasInvoices: boolean;
};

export type PnlResult = PnlInput & {
  grossPlan: number; // CE − CO
  marginPlanPct: number;
  /** Lãi gộp TẠM TÍNH theo dòng tiền thật = đã thu − đã chi. Chỉ có nghĩa khi vòng thu/chi đã
   *  chạy tương đối — cảnh báo đi kèm nói rõ. */
  grossCashActual: number;
  /** Nếu chi nốt phần cam kết: đã chi + cam kết. */
  projectedSpend: number;
};

export function computePnl(i: PnlInput): PnlResult {
  return {
    ...i,
    grossPlan: i.cePlan - i.coPlan,
    marginPlanPct: i.cePlan > 0 ? ((i.cePlan - i.coPlan) / i.cePlan) * 100 : 0,
    grossCashActual: i.collected - i.disbursed,
    projectedSpend: i.disbursed + i.committed,
  };
}
