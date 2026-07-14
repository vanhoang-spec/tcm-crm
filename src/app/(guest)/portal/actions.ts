"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getGuestSession, clearGuestSession } from "@/lib/guest-session";
import { CLIENT_TIMELINE_STATUSES } from "@/lib/projects";

/** Item guest được thao tác: phải thuộc đúng dự án phiên, đã share + đã publish. */
async function loadEditableItem(itemId: string) {
  const session = await getGuestSession();
  if (!session) return null;
  const item = await prisma.timelineItem.findUnique({ where: { id: itemId } });
  if (!item || item.projectId !== session.projectId || !item.isShared || !item.externalPublished) return null;
  return { session, item };
}

/** Guest cập nhật xác nhận/ghi chú — CHỈ ở item clientEditable. Enforce hoàn toàn server-side. */
export async function guestUpdateItem(itemId: string, formData: FormData) {
  const loaded = await loadEditableItem(itemId);
  if (!loaded || !loaded.item.clientEditable) return;
  const { session, item } = loaded;

  const rawStatus = String(formData.get("clientStatus") ?? "");
  const clientStatus = (CLIENT_TIMELINE_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : item.clientStatus;
  const clientNote = String(formData.get("clientNote") ?? "").trim() || null;

  await prisma.timelineItem.update({ where: { id: item.id }, data: { clientStatus, clientNote } });

  // Báo Account Owner + Leader biết khách vừa cập nhật.
  const project = await prisma.project.findUnique({ where: { id: session.projectId } });
  const recipients = new Set<string>();
  if (project?.ownerId) recipients.add(project.ownerId);
  if (project?.leaderId) recipients.add(project.leaderId);
  if (recipients.size > 0) {
    await prisma.notification.createMany({
      data: Array.from(recipients).map((recipientStaffId) => ({
        recipientStaffId,
        type: "EXTERNAL_TIMELINE_UPDATED",
        title: `Khách cập nhật timeline — dự án ${project?.code ?? ""}`,
        body: item.title,
        projectId: session.projectId,
      })),
    });
  }
  revalidatePath("/portal");
}

/** Guest bình luận trên item đã chia sẻ (không cần clientEditable). */
export async function guestAddComment(itemId: string, formData: FormData) {
  const loaded = await loadEditableItem(itemId);
  if (!loaded) return;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.timelineComment.create({
    data: { itemId, authorType: "GUEST", authorGuestId: loaded.session.inviteId, body },
  });
  revalidatePath("/portal");
}

export async function guestLogout() {
  await clearGuestSession();
  redirect("/portal");
}
