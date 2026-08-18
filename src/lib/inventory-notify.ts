import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Kho — hai đường fan-out notification dùng chung cho tầng đề xuất (requests/actions.ts) và sổ cái
 * (documents/actions.ts). Tách ra K7 vì phiếu kho (CK/CH/TH/BM) trước đó im lặng hoàn toàn.
 * Gọi SAU transaction (SQLite single-writer — HANDOVER mục 10.9).
 */

/** Fan-out theo MÃ QUYỀN (thay danh sách phòng ban cứng — thủ kho là role mới). */
export async function notifyByPermission(permissionCode: string, type: string, title: string, body: string | null, projectId?: string | null) {
  const recipients = await prisma.staff.findMany({
    where: { isActive: true, role: { permissions: { some: { permissionCode } } } },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((r) => ({ recipientStaffId: r.id, type, title, body, projectId: projectId ?? null })),
  });
}

export async function notifyStaff(staffIds: (string | null | undefined)[], type: string, title: string, body: string | null, projectId?: string | null) {
  const ids = [...new Set(staffIds.filter((s): s is string => !!s))];
  if (ids.length === 0) return;
  await prisma.notification.createMany({
    data: ids.map((id) => ({ recipientStaffId: id, type, title, body, projectId: projectId ?? null })),
  });
}

/**
 * PIC + Leader của dự án — người "cầm" hàng ở hiện trường về phía Account; dự án chưa gán PIC/Leader (21 dự án cũ)
 * thì rơi về TRƯỞNG TEAM, cùng luật với `approverStaffIds` (K6) — không có bước này là thông báo bay vào khoảng không.
 */
export async function projectPicIds(projectId: string): Promise<string[]> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, leaderId: true, ownerTeam: { select: { leadStaffId: true } } } });
  const direct = [...new Set([p?.ownerId, p?.leaderId].filter((x): x is string => !!x))];
  if (direct.length) return direct;
  return p?.ownerTeam?.leadStaffId ? [p.ownerTeam.leadStaffId] : [];
}
