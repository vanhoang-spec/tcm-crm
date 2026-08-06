"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function done() {
  revalidatePath("/settings/creative-squads");
  revalidatePath("/creative");
}

export type SquadFormState = { error?: string; success?: boolean };

/**
 * Sửa MỘT team nhỏ Creative: tên, trưởng team, bật/tắt.
 *
 * KHÔNG có create/delete: 3 team là quyết định chủ dự án 06/08/2026, seed dựng sẵn; `isActive`
 * đủ để tắt. Xoá team đang có người/task trỏ vào là mất dấu điều phối (mirror ClientGroup).
 */
export async function updateCreativeSquad(squadId: string, _prev: SquadFormState, formData: FormData): Promise<SquadFormState> {
  await requirePermission("settings.creative.manage");
  const name = str(formData.get("name"));
  if (!name) return { error: "NO_NAME" };

  const leadStaffId = str(formData.get("leadStaffId")) || null;
  if (leadStaffId) {
    // Trưởng team phải là nhân sự CREATIVE đang hoạt động — lead là người GIAO việc trong team.
    const lead = await prisma.staff.findFirst({
      where: { id: leadStaffId, isActive: true, department: { code: "CREATIVE" } },
      select: { id: true },
    });
    if (!lead) return { error: "BAD_LEAD" };
  }

  await prisma.creativeSquad.update({
    where: { id: squadId },
    data: { name: name.slice(0, 120), leadStaffId, isActive: formData.get("isActive") === "on" },
  });
  done();
  return { success: true };
}

/** Gán MỘT nhân sự Creative vào một team nhỏ (hoặc gỡ — squadId rỗng). Mỗi người đúng 1 team. */
export async function setStaffSquad(staffId: string, _prev: SquadFormState, formData: FormData): Promise<SquadFormState> {
  await requirePermission("settings.creative.manage");

  // Chỉ nhận nhân sự phòng CREATIVE — bảng phân người phía client cũng chỉ liệt kê họ, nhưng
  // server là chốt (đừng tin form).
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, isActive: true, department: { code: "CREATIVE" } },
    select: { id: true },
  });
  if (!staff) return { error: "BAD_STAFF" };

  const squadId = str(formData.get("squadId")) || null;
  if (squadId) {
    const squad = await prisma.creativeSquad.findFirst({ where: { id: squadId, isActive: true }, select: { id: true } });
    if (!squad) return { error: "BAD_SQUAD" };
  }

  await prisma.staff.update({ where: { id: staffId }, data: { creativeSquadId: squadId } });
  done();
  return { success: true };
}
