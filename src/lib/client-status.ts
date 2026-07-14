import { prisma } from "./prisma";

// Tính "Tình trạng khách hàng" tự động từ lịch sử hợp đồng.
// Hiện chỉ dùng dữ liệu Contract (module ②) — khi module ④ có Invoice, mở rộng hàm này
// để cân nhắc cả invoice_date mà không đổi chữ ký gọi.

const ACTIVE_WINDOW_MONTHS = 24;

export type StatusCode = "POTENTIAL" | "ACTIVE" | "INACTIVE";

/**
 * suggestion = null nghĩa là giữ nguyên trạng thái hiện tại (chưa có mốc nào để tính, vd
 * khách mới hoàn toàn chưa từng có hợp đồng — vẫn là Tiềm năng cho tới khi có hợp đồng đầu tiên).
 */
export function computeSuggestedStatus(latestContractDate: Date | null, now: Date = new Date()): StatusCode | null {
  if (!latestContractDate) return null;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - ACTIVE_WINDOW_MONTHS);
  return latestContractDate >= cutoff ? "ACTIVE" : "INACTIVE";
}

/**
 * Tính lại tình trạng của 1 khách hàng dựa trên hợp đồng mới nhất của tất cả dự án thuộc khách đó.
 * Gọi mỗi khi lưu Contract (module ②). Không đổi Tiềm năng thành gì nếu chưa từng có hợp đồng nào.
 */
export async function recomputeClientStatus(clientId: string, staffId: string | null) {
  const latest = await prisma.contract.findFirst({
    where: { project: { clientId }, OR: [{ contractDate: { not: null } }, { confirmEmailAt: { not: null } }] },
    orderBy: [{ contractDate: "desc" }, { confirmEmailAt: "desc" }],
  });
  const latestDate = latest?.contractDate ?? latest?.confirmEmailAt ?? null;
  const suggested = computeSuggestedStatus(latestDate);
  if (!suggested) return;

  const [client, statusSet] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, include: { status: true } }),
    prisma.optionSet.findUnique({ where: { code: "client_status" }, include: { items: true } }),
  ]);
  if (!client || !statusSet) return;
  const targetItem = statusSet.items.find((i) => i.code === suggested);
  if (!targetItem || targetItem.id === client.statusId) return;

  await prisma.$transaction([
    prisma.client.update({ where: { id: clientId }, data: { statusId: targetItem.id } }),
    prisma.auditLog.create({
      data: {
        entityType: "client",
        entityId: clientId,
        field: "statusId",
        oldValue: client.status.code,
        newValue: suggested,
        action: "UPDATE",
        changedBy: staffId,
        reason: "auto recompute from contract date",
      },
    }),
  ]);
}
