-- Kho v2 K5: khai lại trạng thái/tình trạng lô khi đồ từ site quay về kho.
--
-- Ràng buộc cũ "1 dòng / 1 item / 1 phiếu" chặn đúng ca dùng chính của K5: MỘT lô đi ra hiện
-- trường, về kho thành NHIỀU tình trạng khác nhau (60 cái còn tốt + 40 cái đã qua sử dụng) —
-- đó là 2 dòng cùng itemId nguồn, khác convertToItemId đích. Quyết định Câu 6 của chủ dự án
-- ("khai đúng trạng thái/tình trạng THỰC TẾ lúc về") vốn hàm ý hàng về KHÔNG đồng nhất, nên
-- ràng buộc này phải nới.
--
-- Thay bằng index THƯỜNG (giữ nguyên tốc độ truy vấn theo phiếu). Chống trùng chuyển lên tầng
-- ứng dụng: parseLines chống theo CẶP (itemId, trạng thái đích, tình trạng đích) cho phiếu trả
-- và vẫn chống theo itemId cho mọi loại phiếu khác — tức chặt hơn ràng buộc cũ ở ca mới và
-- y hệt ràng buộc cũ ở các ca cũ.
--
-- Chỉ bỏ một index, KHÔNG đụng dữ liệu: đúng nguyên tắc migration additive (HANDOVER mục 4.5).
DROP INDEX "stock_document_line_documentId_itemId_key";
CREATE INDEX "stock_document_line_documentId_itemId_idx" ON "stock_document_line"("documentId", "itemId");
