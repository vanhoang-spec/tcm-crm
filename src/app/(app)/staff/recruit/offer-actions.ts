"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { requirePermission } from "@/lib/permissions";
import { sendRecruitEmail } from "@/lib/recruit-email-server";
import { DEFAULT_OFFER_BODY, OFFER_DEFAULT_KEY } from "@/lib/recruit-offer";

/**
 * TD-2d — THƯ MỜI NHẬN VIỆC: lập → gửi → ứng viên phản hồi → HR điền ngày đi làm → báo onboarding.
 *
 * ⚠ Gác bằng `recruit.decide` (HR Manager + BGĐ) — offer chứa LƯƠNG và là cam kết của công ty với
 * người ngoài. Không dùng `recruit.interview.manage` (đó là đặt lịch).
 * ⚠ Chỉ dùng `export type Foo = ...` dạng khai báo trong file "use server" (HANDOVER 10.23).
 */

export type OfferState = { error?: string; detail?: string; success?: boolean };

/**
 * Ngày nghiệp vụ theo quy ước UTC-midnight của app (HANDOVER 4.3) — KHÔNG dùng `new Date(y,m,d)`,
 * lệch đúng 7 tiếng và hiển thị lùi một ngày.
 * ⚠ GHI CHÚ CHO NGƯỜI LÀM BƯỚC CHUYỂN ỨNG VIÊN → NHÂN SỰ: `Staff.firstWorkDate` lưu LOCAL midnight
 * (HANDOVER 10.38), khác quy ước ở đây. Chuyển thẳng giá trị sang là lệch ngày.
 */
const dateOrNull = (s: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

const str = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max);
const intOrNull = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

async function audit(candidateId: string, action: string, payload: unknown) {
  await prisma.auditLog.create({
    data: { entityType: "candidate_offer", entityId: candidateId, field: "*", action, newValue: JSON.stringify(payload), changedBy: await getCurrentStaffId() },
  });
}

/** Lập hoặc sửa offer. Đã GỬI rồi thì vẫn sửa được (đàm phán lại) nhưng phải gửi lại bản mới. */
export async function saveOffer(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.decide");
  const candidateId = str(formData.get("candidateId"), 40);
  if (!candidateId) return { error: "BAD_INPUT" };

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { status: true } });
  if (!candidate) return { error: "NOT_FOUND" };

  const salaryRaw = String(formData.get("salaryAmount") ?? "").trim();
  const salary = salaryRaw ? BigInt(Math.max(0, Math.round(Number(salaryRaw) || 0))) : null;
  const data = {
    salaryAmount: salary,
    allowanceText: str(formData.get("allowanceText"), 1000) || null,
    probationMonths: intOrNull(formData.get("probationMonths")),
    probationPct: intOrNull(formData.get("probationPct")),
    startDate: dateOrNull(str(formData.get("startDate"), 10)),
    extraTerms: str(formData.get("extraTerms"), 4000) || null,
  };

  const staffId = await getCurrentStaffId();
  await prisma.candidateOffer.upsert({
    where: { candidateId },
    create: { candidateId, ...data, createdById: staffId },
    update: data,
  });
  await audit(candidateId, "OFFER_SAVE", { salary: salary?.toString() ?? null });
  revalidatePath(`/staff/recruit/candidates/${candidateId}`);
  return { success: true };
}

/**
 * Đánh dấu ĐÃ GỬI offer, và (tuỳ chọn) gửi luôn thư OFFER qua Resend.
 *
 * ⚠ Thư đi qua CHÍNH đường của TD-2b (mẫu đã duyệt, server dựng lại nội dung). Không có mẫu duyệt
 * hoặc chưa khai Resend thì vẫn đánh dấu đã gửi được — HR gửi tay ngoài app là chuyện có thật, chặn
 * ở đây là bắt họ nói dối trạng thái.
 */
export async function sendOffer(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.decide");
  const candidateId = str(formData.get("candidateId"), 40);
  const alsoEmail = String(formData.get("alsoEmail") ?? "") === "1";
  const offer = await prisma.candidateOffer.findUnique({ where: { candidateId }, select: { status: true } });
  if (!offer) return { error: "NO_OFFER" };
  if (offer.status === "ACCEPTED" || offer.status === "DECLINED") return { error: "ALREADY_CLOSED" };

  const staffId = await getCurrentStaffId();
  await prisma.candidateOffer.update({ where: { candidateId }, data: { status: "SENT", sentAt: new Date() } });

  let mailError: string | null = null;
  if (alsoEmail) {
    const res = await sendRecruitEmail(candidateId, "OFFER", staffId, {
      startDate: str(formData.get("startDateText"), 20),
    });
    if (!res.ok) mailError = res.code;
  }
  await audit(candidateId, "OFFER_SEND", { alsoEmail, mailError });
  revalidatePath(`/staff/recruit/candidates/${candidateId}`);
  return mailError ? { success: true, error: "MAIL_FAILED", detail: mailError } : { success: true };
}

/**
 * Ứng viên phản hồi: NHẬN hoặc TỪ CHỐI.
 *
 * ⚠ NHẬN ⇒ hồ sơ chuyển HIRED (đây chính là "chốt kết quả"), TỪ CHỐI ⇒ REJECTED kèm lý do. Không
 * để hai nguồn sự thật: trước TD-2d `decideCandidate` là đường duy nhất đổi status, nay offer cũng
 * đổi — nên cả hai cùng ghi `decidedAt/decidedById` để màn hình đọc một chỗ.
 */
export async function respondOffer(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.decide");
  const candidateId = str(formData.get("candidateId"), 40);
  const accepted = String(formData.get("accepted") ?? "") === "1";
  const reason = str(formData.get("declineReason"), 500);
  if (!accepted && !reason) return { error: "NEED_REASON" };

  const offer = await prisma.candidateOffer.findUnique({ where: { candidateId }, select: { status: true } });
  if (!offer) return { error: "NO_OFFER" };
  if (offer.status === "DRAFT") return { error: "NOT_SENT" };

  const staffId = await getCurrentStaffId();
  const now = new Date();
  await prisma.$transaction([
    prisma.candidateOffer.update({
      where: { candidateId },
      data: { status: accepted ? "ACCEPTED" : "DECLINED", respondedAt: now, declineReason: accepted ? null : reason },
    }),
    prisma.candidate.update({
      where: { id: candidateId },
      data: {
        status: accepted ? "HIRED" : "REJECTED",
        decidedAt: now,
        decidedById: staffId,
        decisionNote: accepted ? "Ứng viên đã nhận offer" : `Ứng viên từ chối offer: ${reason}`,
      },
    }),
  ]);
  await audit(candidateId, accepted ? "OFFER_ACCEPTED" : "OFFER_DECLINED", { reason: accepted ? null : reason });
  revalidatePath(`/staff/recruit/candidates/${candidateId}`);
  revalidatePath("/staff/recruit");
  return { success: true };
}

/**
 * HR điền NGÀY ĐI LÀM ĐẦU TIÊN.
 *
 * ⚠ CHỈ điền được khi offer đã ACCEPTED — ngày đi làm của người chưa nhận việc là dữ liệu bịa, và
 * nó là mốc quyết định phép năm + thâm niên khi hồ sơ chuyển thành nhân sự (HANDOVER 10.38).
 */
export async function setFirstWorkDate(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.decide");
  const candidateId = str(formData.get("candidateId"), 40);
  const date = dateOrNull(str(formData.get("firstWorkDate"), 10));
  if (!date) return { error: "BAD_DATE" };

  const offer = await prisma.candidateOffer.findUnique({ where: { candidateId }, select: { status: true } });
  if (!offer) return { error: "NO_OFFER" };
  if (offer.status !== "ACCEPTED") return { error: "NOT_ACCEPTED" };

  await prisma.candidateOffer.update({ where: { candidateId }, data: { firstWorkDate: date } });
  await audit(candidateId, "OFFER_FIRST_WORK_DATE", { date: date.toISOString().slice(0, 10) });
  revalidatePath(`/staff/recruit/candidates/${candidateId}`);
  return { success: true };
}

/**
 * Báo TRƯỞNG BỘ PHẬN chuẩn bị onboarding — kết thúc luồng tuyển dụng.
 *
 * ⚠ Đi qua mẫu `ONBOARDING_NOTICE` của TD-2b (gửi NỘI BỘ, người nhận lấy từ
 * `JobPosition.hiringManager`). Chặn gửi hai lần bằng `onboardingNotifiedAt`.
 */
export async function notifyOnboarding(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.decide");
  const candidateId = str(formData.get("candidateId"), 40);
  const offer = await prisma.candidateOffer.findUnique({
    where: { candidateId },
    select: { status: true, firstWorkDate: true, onboardingNotifiedAt: true },
  });
  if (!offer) return { error: "NO_OFFER" };
  if (offer.status !== "ACCEPTED") return { error: "NOT_ACCEPTED" };
  if (!offer.firstWorkDate) return { error: "NO_FIRST_DATE" };
  if (offer.onboardingNotifiedAt) return { error: "ALREADY_NOTIFIED" };

  const staffId = await getCurrentStaffId();
  const res = await sendRecruitEmail(candidateId, "ONBOARDING_NOTICE", staffId, {
    startDate: offer.firstWorkDate.toLocaleDateString("vi-VN", { timeZone: "UTC" }),
  });
  if (!res.ok) return { error: "MAIL_FAILED", detail: res.code };

  // ⚠ Chỉ đánh dấu SAU KHI gửi thành công: đánh dấu trước rồi gửi hỏng là trưởng bộ phận không bao
  // giờ biết có người sắp tới, mà màn hình lại báo "đã gửi".
  await prisma.candidateOffer.update({ where: { candidateId }, data: { onboardingNotifiedAt: new Date() } });
  await audit(candidateId, "ONBOARDING_NOTIFIED", {});
  revalidatePath(`/staff/recruit/candidates/${candidateId}`);
  return { success: true };
}

/** Lưu / duyệt mẫu thư mời nhận việc theo phòng ban. Cùng luật với mẫu thư: lưu là gỡ duyệt. */
export async function saveOfferTemplate(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.jd.manage");
  const deptKey = str(formData.get("deptKey"), 30) || OFFER_DEFAULT_KEY;
  const body = str(formData.get("body"), 12000) || DEFAULT_OFFER_BODY;
  const staffId = await getCurrentStaffId();
  await prisma.recruitOfferTemplate.upsert({
    where: { deptKey },
    create: { deptKey, body, updatedById: staffId },
    update: { body, updatedById: staffId, approvedAt: null, approvedById: null },
  });
  await audit(deptKey, "OFFER_TPL_SAVE", { deptKey });
  revalidatePath("/settings/recruit");
  return { success: true };
}

export async function approveOfferTemplate(_prev: OfferState, formData: FormData): Promise<OfferState> {
  await requirePermission("recruit.jd.manage");
  const deptKey = str(formData.get("deptKey"), 30) || OFFER_DEFAULT_KEY;
  const staffId = await getCurrentStaffId();
  await prisma.recruitOfferTemplate.upsert({
    where: { deptKey },
    create: { deptKey, body: DEFAULT_OFFER_BODY, approvedAt: new Date(), approvedById: staffId, updatedById: staffId },
    update: { approvedAt: new Date(), approvedById: staffId },
  });
  await audit(deptKey, "OFFER_TPL_APPROVE", { deptKey });
  revalidatePath("/settings/recruit");
  return { success: true };
}
