import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { hasPermission, requirePermission } from "@/lib/permissions";

/**
 * Lớp kiểm quyền của module Họp Account team (MEET-1). Hai tầng, cố ý (khuôn staff/recruit/access.ts):
 *  (1) MÃ QUYỀN `meetings.view` / `meetings.manage` — BGĐ nhìn/ghi MỌI team (ADMIN là sàn cứng).
 *  (2) THEO BẢN GHI — TRƯỞNG TEAM (`Team.leadStaffId === tôi`) nhìn/ghi ĐÚNG team mình. Ma trận quyền
 *      phẳng toàn cục không diễn đạt được "trưởng của team X", nên trưởng team KHÔNG có mã nào; đừng đi tìm
 *      `requirePermission` tương ứng.
 * Quyết định chủ dự án 17/08/2026: chỉ BGĐ + trưởng team; thành viên team chỉ nhận Notification việc được giao.
 */
export type MeetingAccess = {
  meId: string;
  canViewAll: boolean;
  canManageAll: boolean;
  canAi: boolean;
  /** Team mà tôi đang là trưởng (đang hoạt động). */
  leadTeamIds: string[];
};

export async function getMeetingAccess(): Promise<MeetingAccess | null> {
  const meId = await getCurrentStaffId();
  if (!meId) return null;
  const [canViewAll, canManageAll, canAi, led] = await Promise.all([
    hasPermission("meetings.view"),
    hasPermission("meetings.manage"),
    hasPermission("meetings.ai_import"),
    prisma.team.findMany({ where: { leadStaffId: meId, isActive: true }, select: { id: true } }),
  ]);
  return { meId, canViewAll, canManageAll, canAi, leadTeamIds: led.map((t) => t.id) };
}

/**
 * Cửa vào trang/action: BGĐ hoặc trưởng team thì qua; còn lại rơi vào `requirePermission("meetings.view")`
 * để nó đá về SAFE_LANDING như mọi module (KHÔNG về `/meetings` nên không có vòng lặp 307 — HANDOVER 10.1).
 */
export async function requireMeetingAccess(): Promise<MeetingAccess> {
  const a = await getMeetingAccess();
  if (a && (a.canViewAll || a.leadTeamIds.length > 0)) return a;
  await requirePermission("meetings.view"); // sẽ redirect
  throw new Error("NO_ACCESS");
}

/** Được xem / ghi team này không. `write` = ghi/chốt/giao việc. */
export function canAccessTeam(a: MeetingAccess, teamId: string, write: boolean): boolean {
  if (write ? a.canManageAll : a.canViewAll) return true;
  return a.leadTeamIds.includes(teamId);
}
