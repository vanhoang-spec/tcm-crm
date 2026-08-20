import type { AiMessage } from "./deepseek";

/**
 * Prompt xin AI NHẬN XÉT kết quả đối chiếu chi ngân hàng.
 *
 * ⚠ AI KHÔNG làm phần khớp và KHÔNG được đổi kết luận: bảng "khoản rớt" đã do `reconcile()` tính
 * bằng code và đã nằm sẵn trong tài liệu trước khi gọi AI (xem `buildReconBlocks`). Việc của AI chỉ
 * là giải thích nguyên nhân khả dĩ và gợi ý bước tiếp theo — sai một chiều nào của phần khớp cũng
 * mất tiền thật (báo nhầm "rớt" ⇒ chi trùng; báo nhầm "đã chi" ⇒ NCC không nhận được tiền).
 *
 * ⚠ Dữ liệu gửi đi đã được `reconSummaryForAi` rút gọn: KHÔNG có số tài khoản, KHÔNG có số dư,
 * KHÔNG gửi cả sao kê — chỉ phần chưa khớp và phần cần xác nhận.
 */
export function bankReconPrompt(summary: string): AiMessage[] {
  const system = `Bạn là kiểm soát viên kế toán của một agency sự kiện tại Việt Nam. Bạn nhận KẾT QUẢ ĐỐI CHIẾU đã được hệ thống tính sẵn giữa bảng kế hoạch chi và sao kê ngân hàng.

QUY TẮC BẮT BUỘC:
1. KHÔNG tính lại, KHÔNG kết luận lại khoản nào rớt hay không rớt — con số trong phần DỮ LIỆU là kết quả cuối cùng. Nhiệm vụ của bạn là GIẢI THÍCH và GỢI Ý.
2. Chỉ dùng thông tin trong phần DỮ LIỆU. Không bịa tên, số tiền, số hoá đơn.
3. Với mỗi khoản chưa khớp, nêu nguyên nhân KHẢ DĨ (sai số tài khoản, vượt hạn mức chuyển trong ngày, tài khoản thụ hưởng đóng, ngân hàng từ chối, lệnh chưa được duyệt hết cấp) và việc kế toán nên làm tiếp.
4. Với mục "đã khớp nhưng cần xác nhận", nói rõ vì sao đáng ngờ và cách kiểm chứng nhanh.
5. Nếu không có khoản nào rớt, nói ngắn gọn là khớp đủ, đừng viết dài.
6. Viết tiếng Việt, ngắn, đi thẳng việc. Không lặp lại nguyên bảng số liệu đã có ở trên.
7. KHÔNG đặt tiêu đề trùng với các mục đã có ("Khoản chưa thanh toán được", "Các khoản đã thanh toán thành công") — phần bạn viết là NHẬN XÉT nối thêm phía sau.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `DỮ LIỆU ĐỐI CHIẾU (hệ thống đã tính):\n\n${summary}` },
  ];
}
