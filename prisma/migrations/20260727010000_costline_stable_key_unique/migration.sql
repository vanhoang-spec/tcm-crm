-- Hai dòng cùng stableKey trong một bảng CO/CE sẽ bị module ④ gộp làm một (FinanceCostLine khoá
-- theo lineKey) và tiền của một dòng biến mất im lặng. Ràng buộc này biến lỗi đó thành lỗi nổ ngay.
-- Additive: chỉ thêm chỉ mục, không dựng lại bảng, không đụng dữ liệu.
-- Đã kiểm trước khi tạo: 325 dòng cost_line, 0 khoá trùng, 0 khoá rỗng.

-- CreateIndex
CREATE UNIQUE INDEX "cost_line_costSheetId_stableKey_key" ON "cost_line"("costSheetId", "stableKey");
