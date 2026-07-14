"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function markNotificationRead(notificationId: string) {
  await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  revalidatePath("/reminders");
}
