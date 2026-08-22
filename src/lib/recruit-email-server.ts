import "server-only";
import { prisma } from "@/lib/prisma";
import { getStringSetting } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { isResendConfigured, resendFrom, sendEmail } from "@/lib/resend";
import {
  emailTemplateDef,
  hasUnresolvedVars,
  isSendableEmail,
  renderTemplate,
  type RecruitEmailCode,
} from "@/lib/recruit-email";

/**
 * DỰNG + GỬI thư cho ứng viên (TD-2b).
 *
 * ⚠ Hàm KHÔNG gác quyền — người gọi gác (`recruit.email.send`).
 * ⚠ Luồng bắt buộc: DỰNG BẢN XEM TRƯỚC → người đọc → mới GỬI. Quyết định chủ dự án 22/08/2026:
 * thư đã ra khỏi hệ thống thì không thu hồi được, nên phải có đúng một cú bấm nhìn thấy nội dung
 * thật và địa chỉ thật trước khi đi.
 */

export type EmailPreview = {
  code: RecruitEmailCode;
  templateLabel: string;
  to: string | null;
  toName: string | null;
  from: string;
  subject: string;
  body: string;
  /** Biến trong mẫu chưa có giá trị — còn cái nào là CHẶN gửi. */
  missing: string[];
  /** Tên biến gõ sai (không thuộc mẫu này). */
  unknown: string[];
  approved: boolean;
  configured: boolean;
  /** Lý do không gửi được, null = gửi được. */
  blockedBy: "NOT_CONFIGURED" | "NOT_APPROVED" | "NO_EMAIL" | "MISSING_VARS" | null;
};

/** Mẫu đang lưu; chưa có dòng nào trong DB thì rơi về bản mặc định trong code (CHƯA duyệt). */
export async function loadEmailTemplate(code: RecruitEmailCode) {
  const def = emailTemplateDef(code);
  if (!def) return null;
  const row = await prisma.recruitEmailTemplate.findUnique({ where: { code } });
  return {
    def,
    subject: row?.subject ?? def.defaultSubject,
    body: row?.body ?? def.defaultBody,
    approvedAt: row?.approvedAt ?? null,
    exists: !!row,
  };
}

/** Biến dùng chung mọi mẫu — lấy từ hồ sơ ứng viên + setting công ty. */
async function baseVars(candidateId: string, senderStaffId: string | null) {
  const [candidate, companyName, sender] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        fullName: true,
        email: true,
        position: { select: { title: true, department: { select: { name: true } }, hiringManager: { select: { fullName: true, email: true } } } },
      },
    }),
    getStringSetting("company", "legal_name_vi", "Công ty Cổ phần Tiếp thị Tân Cường Minh"),
    senderStaffId ? prisma.staff.findUnique({ where: { id: senderStaffId }, select: { fullName: true } }) : Promise.resolve(null),
  ]);
  if (!candidate) return null;
  return {
    candidate,
    vars: {
      candidateName: candidate.fullName,
      positionTitle: candidate.position.title,
      companyName,
      hrName: sender?.fullName ?? "",
      departmentName: candidate.position.department?.name ?? "",
      managerName: candidate.position.hiringManager?.fullName ?? "",
    } as Record<string, string>,
  };
}

/**
 * Dựng bản xem trước. `extraVars` cho những biến chỉ có ở một số mẫu (lịch phỏng vấn, ngày đi làm).
 * ⚠ `overrideTo` dành cho mẫu gửi NỘI BỘ (báo trưởng bộ phận) — mặc định gửi cho ứng viên.
 */
export async function buildEmailPreview(
  candidateId: string,
  code: RecruitEmailCode,
  senderStaffId: string | null,
  extraVars: Record<string, string> = {},
): Promise<EmailPreview | null> {
  const [tpl, base] = await Promise.all([loadEmailTemplate(code), baseVars(candidateId, senderStaffId)]);
  if (!tpl || !base) return null;

  const vars = { ...base.vars, ...extraVars };
  const subject = renderTemplate(tpl.subject, vars, tpl.def.vars);
  const body = renderTemplate(tpl.body, vars, tpl.def.vars);

  const internal = tpl.def.audience === "INTERNAL";
  const to = internal ? (base.candidate.position.hiringManager?.email ?? null) : base.candidate.email;
  const toName = internal ? (base.candidate.position.hiringManager?.fullName ?? null) : base.candidate.fullName;

  const missing = [...new Set([...subject.missing, ...body.missing])];
  const unknown = [...new Set([...subject.unknown, ...body.unknown])];
  const configured = isResendConfigured();
  const approved = !!tpl.approvedAt;

  // Thứ tự kiểm = thứ tự người dùng phải đi sửa: khai khoá → duyệt mẫu → có địa chỉ → đủ biến.
  const blockedBy = !configured
    ? "NOT_CONFIGURED"
    : !approved
      ? "NOT_APPROVED"
      : !isSendableEmail(to)
        ? "NO_EMAIL"
        : missing.length > 0
          ? "MISSING_VARS"
          : null;

  return {
    code,
    templateLabel: tpl.def.labelVi,
    to,
    toName,
    from: resendFrom(),
    subject: subject.text,
    body: body.text,
    missing,
    unknown,
    approved,
    configured,
    blockedBy,
  };
}

export type SendOutcome = { ok: true; logId: string } | { ok: false; code: string; detail?: string };

/**
 * GỬI THẬT + ghi sổ.
 *
 * ⚠ Dựng LẠI nội dung ở server từ mẫu đã duyệt, KHÔNG nhận nội dung từ client: bản xem trước chỉ để
 * người đọc. Nhận chuỗi từ trình duyệt là ai sửa DevTools cũng gửi được thư bất kỳ dưới danh nghĩa
 * công ty tới địa chỉ bất kỳ.
 * ⚠ Ghi sổ CẢ lượt hỏng — không có dòng nào thì lần sau không ai biết đã thử gửi hay chưa.
 */
export async function sendRecruitEmail(
  candidateId: string,
  code: RecruitEmailCode,
  senderStaffId: string | null,
  extraVars: Record<string, string> = {},
): Promise<SendOutcome> {
  const preview = await buildEmailPreview(candidateId, code, senderStaffId, extraVars);
  if (!preview) return { ok: false, code: "NOT_FOUND" };
  if (preview.blockedBy) return { ok: false, code: preview.blockedBy };
  // Chốt chặn cuối: còn {{...}} nào trong nội dung là KHÔNG gửi, kể cả khi `missing` rỗng (biến gõ
  // sai tên rơi vào `unknown` chứ không vào `missing`).
  if (hasUnresolvedVars(preview.subject) || hasUnresolvedVars(preview.body)) return { ok: false, code: "MISSING_VARS" };
  const to = preview.to!;

  const res = await sendEmail({ to, subject: preview.subject, text: preview.body });

  const log = await prisma.recruitEmailLog.create({
    data: {
      templateCode: code,
      candidateId,
      toEmail: to,
      toName: preview.toName,
      subject: preview.subject,
      body: preview.body,
      status: res.ok ? "SENT" : "FAILED",
      providerId: res.ok ? res.id : null,
      error: res.ok ? null : res.error,
      sentById: senderStaffId,
    },
    select: { id: true },
  });

  if (!res.ok) {
    console.error(`[RECRUIT-MAIL] ${code} → ${to}: ${res.error}`);
    return { ok: false, code: "SEND_FAILED", detail: res.error };
  }
  return { ok: true, logId: log.id };
}

/** Sổ thư của một ứng viên — hiện trên hồ sơ để HR biết đã gửi gì, lúc nào, thành công không. */
export async function loadEmailLog(candidateId: string) {
  const rows = await prisma.recruitEmailLog.findMany({
    where: { candidateId },
    orderBy: { sentAt: "desc" },
    select: { id: true, templateCode: true, toEmail: true, subject: true, status: true, error: true, sentAt: true, sentBy: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    templateCode: r.templateCode,
    templateLabel: emailTemplateDef(r.templateCode)?.labelVi ?? r.templateCode,
    toEmail: r.toEmail,
    subject: r.subject,
    status: r.status,
    error: r.error,
    sentAt: formatDate(r.sentAt),
    sentByName: r.sentBy?.fullName ?? null,
  }));
}
