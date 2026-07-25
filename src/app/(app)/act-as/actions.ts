"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ACT_AS_COOKIE, ACT_AS_COOKIE_OPTS, isAdminStaff, signActAs } from "@/lib/current-staff";
import { getAuthenticatedStaffId } from "@/lib/auth-session";
import { ensureTcmFamilyMembership } from "@/lib/chat";
import { requirePermission } from "@/lib/permissions";

/**
 * Xem hệ thống với tư cách nhân sự khác (mạo danh) — CHỈ dành cho ADMIN, phục vụ hỗ trợ/kiểm thử.
 * Truyền staffId rỗng → thoát chế độ này, quay về chính mình.
 *
 * Trước khi có đăng nhập thật đây là công cụ demo ai cũng dùng được; giờ đã có chốt quyền.
 */
export async function setActAsStaff(staffId: string) {
  await requirePermission("system.impersonate");
  const authed = await getAuthenticatedStaffId();
  if (!authed || !(await isAdminStaff(authed))) return; // không phải admin → bỏ qua, im lặng

  const store = await cookies();
  if (!staffId || staffId === authed) {
    store.delete(ACT_AS_COOKIE);
    revalidatePath("/", "layout");
    return;
  }
  const staff = await prisma.staff.findFirst({ where: { id: staffId, isActive: true }, select: { id: true } });
  if (!staff) return;
  store.set(ACT_AS_COOKIE, signActAs(staff.id), ACT_AS_COOKIE_OPTS);
  // Idempotent: auto-join "GIA ĐÌNH TCM" cho nhân sự @tcmbtl.com chưa có trong nhóm.
  await ensureTcmFamilyMembership(staff.id).catch(() => {});
  revalidatePath("/", "layout");
}
