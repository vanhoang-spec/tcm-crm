import { redirect } from "next/navigation";

/**
 * Trang chủ bản mini = bảng task Creative.
 *
 * Bản TCM đầy đủ có Dashboard đa module (doanh thu theo team, dòng tiền, tiến độ bộ phận) — toàn
 * bộ nguồn số đó nằm ở các module đã cắt, nên dựng lại một Dashboard rỗng chỉ để có trang chủ là
 * vô nghĩa. Đưa thẳng vào chỗ người dùng thật sự làm việc.
 *
 * ⚠ KHÔNG gác `requirePermission` ở đây — `/creative` tự gác `creative.view`, và người không có
 * quyền đó sẽ được `requirePermission` đẩy tiếp về trang hạ cánh hợp vai (`SAFE_LANDING`). Gác cả
 * hai đầu là dựng lại đúng vòng lặp chuyển hướng vô hạn đã từng làm không ai vào được app.
 */
export default function HomePage() {
  redirect("/creative");
}
