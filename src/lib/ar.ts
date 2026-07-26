// Công nợ phải thu (AR) — hàm thuần, KHÔNG gọi Prisma.
//
// Tồn tại vì trước đó 4 màn hình tự định nghĩa lấy cùng một tập dữ liệu (ClientInvoice +
// ClientPayment) rồi cho 4 con số khác nhau, không chỗ nào ghi chú cho người đọc biết:
//   • /finance/debt        — tổng mọi khoản còn dư, phân nhóm tuổi nợ
//   • Dashboard "Sẽ thu"   — chỉ khoản có hạn trong tháng, LOẠI TRỪ phần đã quá hạn (nợ càng xấu
//                            càng vô hình — chính là lỗi được sửa cùng đợt này)
//   • /finance/cashflow    — cộng đệm 14 ngày vào mốc tiền về
//   • getArOverdueItems    — danh sách quá hạn cho chuông + /reminders
//
// Nay cả 4 gọi chung file này. Khác biệt cố ý DUY NHẤT còn lại là đệm 14 ngày của cashflow —
// nó nằm ở cashflow.ts, không gộp vào đây, và được ghi chú thẳng trên giao diện.

const DAY_MS = 24 * 60 * 60 * 1000;

export type ArInvoiceInput = {
  amount: number;
  invoiceDate: Date;
  dueDate: Date | null;
  paidAmounts: number[];
};

export type ArAgingBucket = "current" | "d30" | "d60" | "d60plus";

export type ArStatus = {
  outstanding: number;
  /** Mốc dùng để tính quá hạn. */
  dueBase: Date;
  /** > 0 = đã quá hạn bấy nhiêu ngày. 0 = đến hạn đúng hôm nay. < 0 = chưa tới hạn. */
  daysOverdue: number;
  isOverdue: boolean;
  bucket: ArAgingBucket;
};

/**
 * Đầu ngày hôm nay theo quy ước UTC-midnight của toàn app (HANDOVER §4.3) — khớp với cách
 * `dateOrNull()` dựng ngày từ chuỗi "YYYY-MM-DD".
 *
 * So sánh theo NGÀY chứ không theo thời điểm: trước đây getArOverdueItems so với `now` nên hóa đơn
 * đến hạn hôm nay đã bị tính là quá hạn ngay từ sáng, trong khi trang Công nợ vẫn xếp nó vào
 * "chưa tới hạn" — cùng một hóa đơn, hai câu trả lời.
 */
export function arStartOfToday(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Mốc đến hạn: ngày phải trả, thiếu thì lấy ngày hóa đơn (hóa đơn cũ không nhập hạn vẫn phải già đi). */
export function arDueBase(inv: { invoiceDate: Date; dueDate: Date | null }): Date {
  return inv.dueDate ?? inv.invoiceDate;
}

export function arOutstanding(inv: ArInvoiceInput): number {
  return inv.amount - inv.paidAmounts.reduce((sum, p) => sum + p, 0);
}

/** Ngưỡng nhóm tuổi nợ 0/30/60 giữ nguyên như trang Công nợ đang hiển thị — không đổi số của ai. */
export function arStatus(inv: ArInvoiceInput, now: Date): ArStatus {
  const dueBase = arDueBase(inv);
  const daysOverdue = Math.floor((arStartOfToday(now).getTime() - dueBase.getTime()) / DAY_MS);
  const bucket: ArAgingBucket =
    daysOverdue <= 0 ? "current" : daysOverdue <= 30 ? "d30" : daysOverdue <= 60 ? "d60" : "d60plus";
  return { outstanding: arOutstanding(inv), dueBase, daysOverdue, isOverdue: daysOverdue > 0, bucket };
}
