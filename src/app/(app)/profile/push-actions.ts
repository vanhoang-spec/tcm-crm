"use server";

import { getCurrentStaffId } from "@/lib/current-staff";
import { prisma } from "@/lib/prisma";
import { isPushConfigured, sendPushToStaff } from "@/lib/push";

/**
 * Lưu / gỡ đăng ký thông báo đẩy của MỘT THIẾT BỊ.
 *
 * ⚠ CỐ Ý không gác `requirePermission`: đây là thiết lập của CHÍNH người dùng cho chính thiết bị của
 * họ, cùng nhóm với đổi avatar và tắt/bật thông báo (HANDOVER mục 10.1 — 11 action cố ý không gác).
 * Vẫn phải đăng nhập: `staffId` lấy từ phiên, KHÔNG nhận từ client.
 */

export type PushActionResult = { ok: true } | { ok: false; error: string };

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<PushActionResult> {
  const staffId = await getCurrentStaffId();
  if (!staffId) return { ok: false, error: "NOT_LOGGED_IN" };
  if (!isPushConfigured()) return { ok: false, error: "NOT_CONFIGURED" };

  const endpoint = String(input.endpoint ?? "").trim();
  const p256dh = String(input.p256dh ?? "").trim();
  const auth = String(input.auth ?? "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return { ok: false, error: "BAD_SUBSCRIPTION" };

  // Cùng thiết bị bật lại thì trình duyệt trả về ĐÚNG endpoint cũ ⇒ upsert, không đẻ dòng trùng.
  // Cập nhật cả staffId: một máy có thể được người khác đăng nhập sau đó, push phải theo người mới.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { staffId, p256dh, auth, userAgent: input.userAgent?.slice(0, 300) ?? null, failCount: 0 },
    create: { staffId, endpoint, p256dh, auth, userAgent: input.userAgent?.slice(0, 300) ?? null },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<PushActionResult> {
  const staffId = await getCurrentStaffId();
  if (!staffId) return { ok: false, error: "NOT_LOGGED_IN" };
  // Chỉ xoá đăng ký CỦA MÌNH — không cho gỡ push của người khác bằng cách đoán endpoint.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: String(endpoint ?? ""), staffId } });
  return { ok: true };
}

/** Gửi thử về chính thiết bị vừa bật — để người dùng thấy ngay là nó chạy. */
export async function sendTestPush(): Promise<PushActionResult> {
  const staffId = await getCurrentStaffId();
  if (!staffId) return { ok: false, error: "NOT_LOGGED_IN" };
  const sent = await sendPushToStaff([staffId], {
    title: "TCM — thông báo thử",
    body: "Thiết bị này đã bật thông báo đẩy thành công.",
    url: "/profile",
    tag: "test",
  });
  return sent > 0 ? { ok: true } : { ok: false, error: "NO_DEVICE" };
}
