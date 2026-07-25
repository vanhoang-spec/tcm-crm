"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export async function markNotificationRead(notificationId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  // updateMany + recipientStaffId: chỉ chủ sở hữu mới đánh dấu được thông báo của mình —
  // update theo id thuần cho phép người khác "đọc hộ" (xóa unread của đồng nghiệp).
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientStaffId: meId },
    data: { isRead: true },
  });
  revalidatePath("/reminders");
}
