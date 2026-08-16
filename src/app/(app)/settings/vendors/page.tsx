import { redirect } from "next/navigation";

/**
 * PUR-1 (16/08/2026): hồ sơ NCC chuyển sang sub-module Thu mua (/purchasing/vendors) — một UI NCC
 * duy nhất, kèm nhóm hàng + kho tài liệu HĐ/PO. Giữ route cũ làm redirect để link/bookmark còn sống;
 * quyền `settings.vendors.manage` cũ vẫn mở được trang mới (gác OR ở đó).
 */
export default function SettingsVendorsRedirect() {
  redirect("/purchasing/vendors");
}
