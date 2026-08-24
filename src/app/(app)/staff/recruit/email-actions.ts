"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { emailTemplateDef, isRecruitEmailCode, type RecruitEmailCode, isOfferStageTemplate } from "@/lib/recruit-email";
import { buildEmailPreview, sendRecruitEmail, type EmailPreview } from "@/lib/recruit-email-server";

/**
 * TD-2b — MẪU THƯ + GỬI THƯ cho ứng viên.
 *
 * ⚠ Chỉ dùng `export type Foo = ...` dạng khai báo trong file "use server" (HANDOVER 10.23).
 */

export type TemplateState = { error?: string; success?: boolean };
export type SendState = { error?: string; detail?: string; success?: boolean; preview?: EmailPreview };

const MAX_SUBJECT = 200;
const MAX_BODY = 8000;

/**
 * Lưu nội dung mẫu.
 *
 * ⚠ LƯU LÀ GỠ DẤU DUYỆT, bắt duyệt lại. Không làm vậy thì một lần sửa nhầm là mọi thư gửi sau đó
 * sai — mà thư đã ra khỏi hệ thống thì không thu hồi được. Đây là lý do tồn tại của bước duyệt.
 */
export async function saveEmailTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  await requirePermission("recruit.jd.manage");
  const code = String(formData.get("code") ?? "");
  if (!isRecruitEmailCode(code)) return { error: "BAD_CODE" };
  const subject = String(formData.get("subject") ?? "").trim().slice(0, MAX_SUBJECT);
  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  if (!subject || !body) return { error: "EMPTY" };

  const staffId = await getCurrentStaffId();
  await prisma.recruitEmailTemplate.upsert({
    where: { code },
    create: { code, subject, body, updatedById: staffId },
    update: { subject, body, updatedById: staffId, approvedAt: null, approvedById: null },
  });
  await prisma.auditLog.create({
    data: { entityType: "recruit_email_template", entityId: code, field: "*", action: "UPDATE", newValue: JSON.stringify({ subject }), changedBy: staffId },
  });
  revalidatePath("/settings/recruit");
  return { success: true };
}

/** Duyệt mẫu — sau bước này mới gửi được. */
export async function approveEmailTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  await requirePermission("recruit.jd.manage");
  const code = String(formData.get("code") ?? "");
  if (!isRecruitEmailCode(code)) return { error: "BAD_CODE" };

  const def = emailTemplateDef(code);
  if (!def) return { error: "BAD_CODE" };
  const staffId = await getCurrentStaffId();

  // Mẫu chưa từng lưu thì duyệt luôn bản mặc định trong code — HR đọc thấy ổn là dùng, không bắt
  // phải bấm Lưu một lần vô nghĩa trước.
  await prisma.recruitEmailTemplate.upsert({
    where: { code },
    create: { code, subject: def.defaultSubject, body: def.defaultBody, approvedAt: new Date(), approvedById: staffId, updatedById: staffId },
    update: { approvedAt: new Date(), approvedById: staffId },
  });
  await prisma.auditLog.create({
    data: { entityType: "recruit_email_template", entityId: code, field: "approvedAt", action: "APPROVE", changedBy: staffId },
  });
  revalidatePath("/settings/recruit");
  return { success: true };
}

/** Gỡ duyệt — dùng khi phát hiện chữ sai mà chưa kịp sửa, để chặn gửi ngay lập tức. */
export async function unapproveEmailTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  await requirePermission("recruit.jd.manage");
  const code = String(formData.get("code") ?? "");
  if (!isRecruitEmailCode(code)) return { error: "BAD_CODE" };
  const staffId = await getCurrentStaffId();
  await prisma.recruitEmailTemplate.updateMany({ where: { code }, data: { approvedAt: null, approvedById: null } });
  await prisma.auditLog.create({
    data: { entityType: "recruit_email_template", entityId: code, field: "approvedAt", action: "UNAPPROVE", changedBy: staffId },
  });
  revalidatePath("/settings/recruit");
  return { success: true };
}

function readExtraVars(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("var_") && typeof v === "string") out[k.slice(4)] = v.trim();
  }
  return out;
}

/**
 * Bước 1 — DỰNG BẢN XEM TRƯỚC. Không gửi gì cả.
 *
 * ⚠ Gác bằng CHÍNH mã `recruit.email.send`, không phải mã xem: bản xem trước chứa địa chỉ email
 * ứng viên và toàn văn thư sắp gửi.
 */
export async function previewCandidateEmail(_prev: SendState, formData: FormData): Promise<SendState> {
  await requirePermission("recruit.email.send");
  const candidateId = String(formData.get("candidateId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!candidateId || !isRecruitEmailCode(code)) return { error: "BAD_INPUT" };
  // ⚠ Thư khâu OFFER đòi ĐẶC QUYỀN THÊM — kiểm bằng hasPermission BÊN TRONG action đã có
  // requirePermission ở đầu (mirror mẫu finance.vendor_payment.over_cap / mkt.generate).
  // Chặn ngay ở BẢN XEM TRƯỚC chứ không chỉ ở bước gửi: bản xem trước là toàn văn thư mời nhận
  // việc, trong đó có MỨC LƯƠNG.
  if (isOfferStageTemplate(code) && !(await hasPermission("recruit.offer.manage"))) return { error: "NO_OFFER_PERM" };

  const preview = await buildEmailPreview(candidateId, code as RecruitEmailCode, await getCurrentStaffId(), readExtraVars(formData));
  if (!preview) return { error: "NOT_FOUND" };
  return { preview };
}

/**
 * Bước 2 — GỬI THẬT.
 *
 * ⚠ Server DỰNG LẠI nội dung từ mẫu đã duyệt, KHÔNG nhận chuỗi từ client. Bản xem trước chỉ để
 * người đọc; nhận nội dung từ trình duyệt là ai mở DevTools cũng gửi được thư bất kỳ dưới danh
 * nghĩa công ty tới địa chỉ bất kỳ.
 */
export async function sendCandidateEmail(_prev: SendState, formData: FormData): Promise<SendState> {
  await requirePermission("recruit.email.send");
  const candidateId = String(formData.get("candidateId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!candidateId || !isRecruitEmailCode(code)) return { error: "BAD_INPUT" };
  // ⚠ Kiểm LẠI ở bước gửi, không tin bước xem trước đã kiểm: hai action là hai endpoint độc lập,
  // gọi thẳng `sendCandidateEmail` mà bỏ qua `previewCandidateEmail` là chuyện làm được.
  if (isOfferStageTemplate(code) && !(await hasPermission("recruit.offer.manage"))) return { error: "NO_OFFER_PERM" };

  const staffId = await getCurrentStaffId();
  const res = await sendRecruitEmail(candidateId, code as RecruitEmailCode, staffId, readExtraVars(formData));
  revalidatePath(`/staff/recruit/candidates/${candidateId}`);
  if (!res.ok) return { error: res.code, detail: res.detail };
  return { success: true };
}
