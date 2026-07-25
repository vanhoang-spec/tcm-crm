"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { AVATAR_MIME_TYPES, MAX_AVATAR_BYTES, saveStaffAvatar, deleteStaffAvatar } from "@/lib/staff-avatar-storage";

export type AvatarFormState = { error?: string; success?: boolean };

function revalidateAvatar() {
  revalidatePath("/profile");
  // Avatar hiện ở header/act-as-switcher trên MỌI trang — cần bust cache toàn layout, không chỉ /profile.
  revalidatePath("/", "layout");
}

/** User tự đổi ảnh đại diện của chính mình — chỉ tác động staff đang "act as", không sửa được người khác. */
export async function updateMyAvatar(_prev: AvatarFormState, formData: FormData): Promise<AvatarFormState> {
  const t = await getTranslations("profile");
  const staffId = await getCurrentStaffId();
  if (!staffId) return { error: t("errorNoSession") };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: t("errorNoFile") };
  if (!AVATAR_MIME_TYPES.includes(file.type)) return { error: t("errorInvalidType") };
  if (file.size > MAX_AVATAR_BYTES) return { error: t("errorTooLarge") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await saveStaffAvatar(buffer, file.type);

  const prevStaff = await prisma.staff.findUnique({ where: { id: staffId }, select: { avatarKey: true } });
  await prisma.staff.update({ where: { id: staffId }, data: { avatarKey: key } });
  if (prevStaff?.avatarKey) await deleteStaffAvatar(prevStaff.avatarKey); // best-effort, không throw

  revalidateAvatar();
  return { success: true };
}

/** Gỡ ảnh đại diện — rơi về initials. */
export async function removeMyAvatar(_formData: FormData): Promise<void> {
  const staffId = await getCurrentStaffId();
  if (!staffId) return;
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { avatarKey: true } });
  if (!staff?.avatarKey) return;

  await prisma.staff.update({ where: { id: staffId }, data: { avatarKey: null } });
  await deleteStaffAvatar(staff.avatarKey);
  revalidateAvatar();
}
