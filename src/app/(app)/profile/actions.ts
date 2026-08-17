"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { AVATAR_MIME_TYPES, MAX_AVATAR_BYTES, saveStaffAvatar, deleteStaffAvatar } from "@/lib/staff-avatar-storage";
import { parseDob, parseFirstWorkDate } from "@/lib/staff-dates";
import { formatDate } from "@/lib/utils";

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

export type DatesFormState = { error?: string; success?: boolean };

/**
 * Nhân sự TỰ BỔ SUNG ngày sinh / ngày đi làm đầu tiên khi HR để trống lúc tạo tài khoản
 * (quyết định chủ dự án 17/08/2026). CHỈ điền được ô CÒN TRỐNG — ngày đã có thì bỏ qua dù form có gửi
 * (ngày đi làm đầu tiên quyết định phép năm + thâm niên, tự sửa lùi ngày là tự cộng phép); sửa sai thì
 * HR làm ở /settings/staff ("Sửa tài khoản").
 */
export async function updateMyDates(_prev: DatesFormState, formData: FormData): Promise<DatesFormState> {
  const t = await getTranslations("profile");
  const staffId = await getCurrentStaffId();
  if (!staffId) return { error: t("errorNoSession") };
  const me = await prisma.staff.findUnique({ where: { id: staffId }, select: { dateOfBirth: true, firstWorkDate: true } });
  if (!me) return { error: t("errorNoSession") };

  const dobRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const firstRaw = String(formData.get("firstWorkDate") ?? "").trim();
  const data: { dateOfBirth?: Date; firstWorkDate?: Date } = {};
  if (!me.dateOfBirth && dobRaw) {
    const d = parseDob(dobRaw);
    if (!d) return { error: t("errorDob") };
    data.dateOfBirth = d;
  }
  if (!me.firstWorkDate && firstRaw) {
    const d = parseFirstWorkDate(firstRaw);
    if (!d) return { error: t("errorFirstWorkDate") };
    data.firstWorkDate = d;
  }
  if (Object.keys(data).length === 0) return { error: t("errorNothingToSave") };

  await prisma.staff.update({ where: { id: staffId }, data });
  await prisma.auditLog.create({
    data: {
      entityType: "staff",
      entityId: staffId,
      field: Object.keys(data).join(","),
      // dd/mm/yyyy địa phương — cột lưu local-midnight, toISOString() sẽ lùi 1 ngày.
      newValue: JSON.stringify(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, formatDate(v)]))),
      action: "UPDATE",
      changedBy: staffId,
    },
  });
  revalidatePath("/profile");
  revalidatePath("/settings/staff");
  return { success: true };
}
