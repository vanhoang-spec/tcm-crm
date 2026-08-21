"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { encryptToken, isChannelCryptoConfigured, tokenHint } from "@/lib/mkt-secret";
import { testConnection } from "@/lib/mkt-publish-server";
import { isMktChannel } from "@/lib/mkt";

/**
 * MKT-2b — NỐI / GỠ KÊNH ĐĂNG BÀI. Gác `mkt.channel.manage` (Senior HR Manager + BGĐ).
 *
 * ⚠ TOKEN CHỈ ĐI MỘT CHIỀU VÀO. Không action nào ở đây trả token ra ngoài, không trang nào select
 * cột `tokenCipher`, audit chỉ ghi 4 ký tự cuối. Người dùng muốn đổi token thì dán token mới — không
 * có đường "xem token đang dùng".
 * ⚠ Ô dán token là ô của NGƯỜI DÙNG tự nhập giá trị của chính công ty họ; app không tự lấy token ở
 * đâu cả (không có OAuth flow trong app — quyết định phạm vi 2b).
 */

export type ChannelState = { error?: string; success?: boolean; message?: string };

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

async function audit(channel: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: { entityType: "mkt_channel", entityId: channel, field: "*", action, newValue: JSON.stringify(payload), changedBy: await getCurrentStaffId() },
  });
}

export async function saveChannel(_prev: ChannelState, formData: FormData): Promise<ChannelState> {
  await requirePermission("mkt.channel.manage");
  if (!isChannelCryptoConfigured()) return { error: "NO_SECRET" };

  const channel = str(formData.get("channel"), 20);
  if (!isMktChannel(channel)) return { error: "BAD_CHANNEL" };
  const targetId = str(formData.get("targetId"), 200);
  if (!targetId) return { error: "NO_TARGET" };
  // LinkedIn cần URN đầy đủ; sai khuôn thì mọi lời gọi sau đều 400 mà thông báo rất khó hiểu.
  if (channel === "LINKEDIN" && !/^urn:li:organization:\d+$/.test(targetId)) return { error: "BAD_URN" };
  if (channel === "FANPAGE" && !/^\d{5,}$/.test(targetId)) return { error: "BAD_PAGE_ID" };

  const token = str(formData.get("token"), 4000);
  const expRaw = str(formData.get("tokenExpiresAt"), 10);
  const tokenExpiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expRaw) ? new Date(expRaw + "T00:00:00.000Z") : null;

  const existing = await prisma.mktChannelConnection.findUnique({ where: { channel }, select: { id: true } });
  // Sửa mà để trống ô token = GIỮ token cũ. Bắt dán lại mỗi lần đổi tên trang là mời người dùng
  // copy token qua lại nhiều lần hơn mức cần thiết.
  if (!existing && !token) return { error: "NO_TOKEN" };

  const data = {
    targetId,
    tokenExpiresAt,
    // Dán token mới thì reset thang cảnh báo — nếu không, token mới 60 ngày vẫn im vì mức 0 đã bắn.
    ...(token ? { tokenCipher: encryptToken(token), expiryWarnLevel: null, lastError: null, lastCheckOk: null } : {}),
    isActive: formData.get("isActive") === "on",
    connectedById: await getCurrentStaffId(),
  };
  if (existing) await prisma.mktChannelConnection.update({ where: { id: existing.id }, data });
  else await prisma.mktChannelConnection.create({ data: { channel, ...data, tokenCipher: encryptToken(token) } });

  await audit(channel, existing ? "UPDATE" : "CREATE", { targetId, tokenChanged: !!token, tokenHint: token ? tokenHint(token) : null, expires: expRaw || null });
  revalidatePath("/settings/mkt-channels");
  revalidatePath("/mkt");
  return { success: true };
}

export async function checkChannel(channel: string, _prev: ChannelState, _formData: FormData): Promise<ChannelState> {
  await requirePermission("mkt.channel.manage");
  if (!isMktChannel(channel)) return { error: "BAD_CHANNEL" };
  const r = await testConnection(channel);
  revalidatePath("/settings/mkt-channels");
  if (!r.ok) return { error: r.code, message: r.message };
  return { success: true, message: r.name };
}

export async function disconnectChannel(channel: string): Promise<void> {
  await requirePermission("mkt.channel.manage");
  if (!isMktChannel(channel)) return;
  // XOÁ HẲN bản ghi (kèm token) chứ không chỉ tắt: gỡ kênh là để token không còn nằm trong DB nữa.
  await prisma.mktChannelConnection.deleteMany({ where: { channel } });
  await audit(channel, "DELETE", { disconnected: true });
  revalidatePath("/settings/mkt-channels");
  revalidatePath("/mkt");
}
