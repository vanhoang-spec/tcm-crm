import "server-only";
import { prisma } from "@/lib/prisma";
import { SYSTEM_RFQ_TEMPLATES, buildRfqTemplate, type RfqTemplate } from "@/lib/rfq-templates";

/**
 * DANH MỤC NHÓM HÀNG RFQ — nạp từ DB, ghép với phần ở CODE.
 *
 * PUR-3b (21/08/2026): trước đó danh mục 8 nhóm nằm hoàn toàn ở `lib/rfq-templates.ts`, thêm nhóm
 * là phải deploy. Nay admin khai thêm nhóm ở `/settings/rfq-groups`.
 *
 * ⚠ MỘT NGUỒN SỰ THẬT cho mọi chỗ cần danh mục. Đừng import thẳng `SYSTEM_RFQ_TEMPLATES` ở trang
 * hay action rồi tưởng là đủ — nhóm admin tự tạo sẽ không hiện, và tệ hơn là `createRfq` sẽ từ chối
 * đúng những nhóm admin vừa khai.
 *
 * ⚠ `loadRfqTemplates()` trả CẢ nhóm đã tắt: RFQ cũ và báo giá cũ phải mở + tính tiền được sau khi
 * admin tắt nhóm. Chỉ các Ô CHỌN mới lọc bằng `activeOnly`.
 *
 * ⚠ Nhóm hệ thống chưa có dòng DB (DB chưa seed, hoặc seed lỗi) vẫn phải xuất hiện — nếu không thì
 * một lần deploy quên seed là mọi RFQ đang chạy mất mẫu và không ai báo giá được. Vì vậy hàm này
 * LUÔN nối phần code còn thiếu vào kết quả.
 */

export type RfqGroupWithFields = Awaited<ReturnType<typeof loadRfqGroupRows>>[number];

async function loadRfqGroupRows() {
  return prisma.rfqGroup.findMany({
    orderBy: [{ sort: "asc" }, { labelVi: "asc" }],
    include: { fields: { orderBy: [{ sort: "asc" }, { labelVi: "asc" }] } },
  });
}

/** Toàn bộ danh mục (mặc định gồm cả nhóm đã tắt — xem ghi chú đầu file). */
export async function loadRfqTemplates(opts?: { activeOnly?: boolean }): Promise<RfqTemplate[]> {
  const rows = await loadRfqGroupRows();
  const out: RfqTemplate[] = [];
  for (const r of rows) {
    if (opts?.activeOnly && !r.isActive) continue;
    out.push(buildRfqTemplate(r, r.fields));
  }
  // Lưới an toàn: nhóm hệ thống chưa có dòng DB thì lấy thẳng bản trong code.
  const seen = new Set(out.map((t) => t.code));
  for (const t of SYSTEM_RFQ_TEMPLATES) if (!seen.has(t.code)) out.push(t);
  return out;
}

/** Một mẫu theo mã — dùng ở đường ĐỌC (mở RFQ cũ, tính tiền), nên KHÔNG lọc theo isActive. */
export async function loadRfqTemplate(code: string | null | undefined): Promise<RfqTemplate | null> {
  if (!code) return null;
  const row = await prisma.rfqGroup.findUnique({ where: { code }, include: { fields: true } });
  if (row) return buildRfqTemplate(row, row.fields);
  return SYSTEM_RFQ_TEMPLATES.find((t) => t.code === code) ?? null;
}
