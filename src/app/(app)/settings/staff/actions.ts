"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId, isAdminStaff } from "@/lib/current-staff";
import { createPasswordResetToken, isAllowedLoginDomain, normalizeLoginId, RESET_TOKEN_TTL_MIN } from "@/lib/auth-session";
import { isMailConfigured, resetPasswordUrl, sendPasswordResetEmail } from "@/lib/mailer";
import { requirePermission } from "@/lib/permissions";

export type StaffFormState = {
  error?: string;
  /** Mã kết quả để UI dịch: "DEFAULT" | "EMAIL_SENT" | "LINK". */
  success?: string;
  /** Chỉ có khi success === "LINK" — link đặt lại để admin copy gửi tay. */
  resetUrl?: string;
};

const DOB_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Parse "DD/MM/YYYY" → Date, trả null nếu sai định dạng/ngày không hợp lệ/ở tương lai. */
function parseDob(input: string): Date | null {
  const m = DOB_REGEX.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null; // chặn ngày ảo VD 31/02
  if (d.getTime() > Date.now()) return null; // không cho ngày sinh ở tương lai
  if (year < 1940) return null; // chặn giá trị phi thực tế
  return d;
}

/**
 * Parse "DD/MM/YYYY" cho ngày đi làm đầu tiên → Date, trả null nếu sai định dạng/ngày không hợp lệ.
 * KHÔNG chặn tương lai (khác parseDob) — HR có thể tạo tài khoản CRM trước ngày nhân sự thật sự bắt đầu làm.
 */
function parseFirstWorkDate(input: string): Date | null {
  const m = DOB_REGEX.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (year < 1940) return null;
  return d;
}

/** Tạo nhân sự mới — bắt buộc ngày sinh + ngày đi làm đầu tiên (cả 2 DD/MM/YYYY, có thể khác nhau và khác ngày tạo tài khoản). */
export async function createStaff(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const fullName = String(formData.get("fullName") ?? "").trim();
  // Gõ "thukho" → thành "thukho@tcm.local" (tài khoản vận hành không có hộp thư).
  const email = normalizeLoginId(String(formData.get("email") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();
  const payrollExempt = formData.get("payrollExempt") === "on";
  const dobRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const firstWorkDateRaw = String(formData.get("firstWorkDate") ?? "").trim();

  if (!fullName || !email) return { error: t("errorRequired") };
  // Chặn tại nguồn: trước đây tạo được tài khoản email lạ rồi người đó vĩnh viễn không đăng nhập
  // được (login chỉ nhận email công ty / tài khoản nội bộ) mà không có cảnh báo nào.
  if (!isAllowedLoginDomain(email)) return { error: t("errorLoginDomain") };

  const dob = parseDob(dobRaw);
  if (!dob) return { error: t("errorDobFormat") };

  const firstWorkDate = parseFirstWorkDate(firstWorkDateRaw);
  if (!firstWorkDate) return { error: t("errorFirstWorkDateFormat") };

  const existing = await prisma.staff.findUnique({ where: { email } });
  if (existing) return { error: t("errorEmailExists", { email }) };

  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) return { error: t("errorRequired") };
  }

  const staffId = await getCurrentStaffId();
  const staff = await prisma.staff.create({
    data: {
      fullName,
      email,
      title: title || null,
      departmentId: departmentId || null,
      // Không gán nhóm quyền = tập quyền RỖNG, người đó đăng nhập vào không mở được trang nào.
      roleId: roleId || null,
      payrollExempt,
      dateOfBirth: dob,
      firstWorkDate,
    },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "staff",
      entityId: staff.id,
      field: "*",
      newValue: JSON.stringify({ fullName, email, dateOfBirth: dobRaw, firstWorkDate: firstWorkDateRaw }),
      action: "CREATE",
      changedBy: staffId,
    },
  });

  revalidatePath("/settings/staff");
  return {};
}

/**
 * Sửa TÀI KHOẢN ĐĂNG NHẬP + cờ không-trả-lương sau khi đã tạo.
 *
 * Trước đây gõ sai lúc tạo là kẹt vĩnh viễn: không action nào trong app ghi `email`, mà đây lại là
 * thứ gõ tay nhiều nhất (nhất là khi mở điểm kho mới, nhập một loạt tài khoản vận hành).
 * Cố ý CHỈ hai field này — phòng ban/team/quản lý sửa ở `updateStaffOrg`, chức danh vẫn chưa sửa được.
 */
export async function updateStaffLogin(staffId: string, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const email = normalizeLoginId(String(formData.get("email") ?? ""));
  const payrollExempt = formData.get("payrollExempt") === "on";
  if (!email) return { error: t("errorRequired") };
  if (!isAllowedLoginDomain(email)) return { error: t("errorLoginDomain") };

  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { email: true, payrollExempt: true } });
  if (!target) return { error: t("errorRequired") };
  if (email !== target.email) {
    const clash = await prisma.staff.findUnique({ where: { email }, select: { id: true } });
    if (clash && clash.id !== staffId) return { error: t("errorEmailExists", { email }) };
  }

  await prisma.staff.update({ where: { id: staffId }, data: { email, payrollExempt } });
  await prisma.auditLog.create({
    data: {
      entityType: "staff",
      entityId: staffId,
      field: "email,payrollExempt",
      oldValue: JSON.stringify({ email: target.email, payrollExempt: target.payrollExempt }),
      newValue: JSON.stringify({ email, payrollExempt }),
      action: "UPDATE",
      changedBy: await getCurrentStaffId(),
    },
  });
  revalidatePath("/settings/staff");
  revalidatePath("/staff/timesheet");
  return { success: "SAVED" };
}

/**
 * Sửa PHÒNG BAN / TEAM / QUẢN LÝ TRỰC TIẾP + cờ "làm function Planning" sau khi đã tạo.
 *
 * Trước 08/2026 ba field đầu chỉ đặt được lúc `createStaff` — chuyển một người sang phòng/team khác
 * bắt buộc phải sửa tay dưới DB. Cần đường này khi bộ phận Planning giải thể về 2 team Account.
 *
 * `isPlanningStaff` là NGUỒN SỰ THẬT DUY NHẤT cho ô "Giao cho" của tab Planning — đây là chỗ DUY NHẤT
 * trong app bật/tắt được nó (xem chú thích cột trong schema.prisma).
 *
 * ⚠ `managerId` là nguồn DUY NHẤT dựng cây org chart (`org-chart-svg.ts`). Vòng lặp quản lý
 * (A quản B, B quản A) làm cả nhánh đó KHÔNG có gốc → DFS không bao giờ chạm tới → những người
 * liên quan BIẾN MẤT khỏi sơ đồ mà không báo lỗi. Vì vậy chặn cả tự-quản-lý lẫn vòng lặp ở đây.
 */
export async function updateStaffOrg(staffId: string, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;
  const teamId = String(formData.get("teamId") ?? "").trim() || null;
  const managerId = String(formData.get("managerId") ?? "").trim() || null;
  const isPlanningStaff = formData.get("isPlanningStaff") === "on";

  const target = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { departmentId: true, managerId: true, isPlanningStaff: true },
  });
  if (!target) return { error: t("errorRequired") };

  if (departmentId && !(await prisma.department.count({ where: { id: departmentId } }))) return { error: t("errorRequired") };

  if (managerId) {
    if (managerId === staffId) return { error: t("errorManagerSelf") };
    // Đi ngược chuỗi quản lý từ manager mới lên; gặp lại chính mình là vòng lặp.
    // Chặn `seen` để chuỗi hỏng sẵn có trong DB không làm vòng while chạy mãi.
    const seen = new Set<string>([staffId]);
    let cursor: string | null = managerId;
    while (cursor) {
      if (seen.has(cursor)) return { error: t("errorManagerCycle") };
      seen.add(cursor);
      const up: { managerId: string | null } | null = await prisma.staff.findUnique({
        where: { id: cursor },
        select: { managerId: true },
      });
      if (!up) return { error: t("errorRequired") };
      cursor = up.managerId;
    }
  }

  await prisma.staff.update({ where: { id: staffId }, data: { departmentId, managerId, isPlanningStaff } });
  await prisma.auditLog.create({
    data: {
      entityType: "staff",
      entityId: staffId,
      field: "departmentId,managerId,isPlanningStaff",
      oldValue: JSON.stringify(target),
      newValue: JSON.stringify({ departmentId, teamId, managerId, isPlanningStaff }),
      action: "UPDATE",
      changedBy: await getCurrentStaffId(),
    },
  });
  revalidatePath("/settings/staff");
  revalidatePath("/orgchart");
  return { success: "SAVED" };
}

/**
 * Admin cấp lại mật khẩu — 2 cách:
 *  - "DEFAULT": xoá mật khẩu hiện tại, nhân sự đăng nhập lại bằng mật khẩu chung và bị ép đổi ngay.
 *  - "LINK": sinh link đặt lại dùng 1 lần; gửi email nếu đã cấu hình SMTP, nếu chưa thì trả link
 *    ra UI để admin gửi tay qua chat/Zalo.
 * Chỉ ADMIN được gọi (chốt ở đây, không tin UI).
 */
export async function adminResetPassword(staffId: string, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const actingStaffId = await getCurrentStaffId();
  if (!actingStaffId || !(await isAdminStaff(actingStaffId))) return { error: t("errorRequired") };

  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { email: true, fullName: true, isActive: true } });
  if (!target || !target.isActive) return { error: t("errorRequired") };

  const mode = String(formData.get("mode") ?? "DEFAULT");

  if (mode === "LINK") {
    const token = await createPasswordResetToken(staffId, actingStaffId);
    await audit(staffId, "PASSWORD_RESET_LINK");
    revalidate();
    if (isMailConfigured()) {
      const sent = await sendPasswordResetEmail(target.email, target.fullName, token, RESET_TOKEN_TTL_MIN);
      if (sent.sent) return { success: "EMAIL_SENT" };
    }
    // Chưa cấu hình email (hoặc gửi lỗi) → trả link thô để admin chuyển tay.
    return { success: "LINK", resetUrl: resetPasswordUrl(token) };
  }

  await prisma.staff.update({
    where: { id: staffId },
    data: { passwordHash: null, passwordChangedAt: null, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
  });
  await audit(staffId, "PASSWORD_RESET_DEFAULT");
  revalidate();
  return { success: "DEFAULT" };
}

/** Gỡ khoá tài khoản bị chặn do nhập sai mật khẩu quá nhiều lần. */
export async function unlockStaffAccount(staffId: string, _prev: StaffFormState, _formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const actingStaffId = await getCurrentStaffId();
  if (!actingStaffId || !(await isAdminStaff(actingStaffId))) return { error: t("errorRequired") };

  await prisma.staff.update({ where: { id: staffId }, data: { failedLoginCount: 0, lockedUntil: null } });
  await audit(staffId, "ACCOUNT_UNLOCK");
  revalidate();
  return {};
}

async function audit(entityId: string, action: string) {
  const staffId = await getCurrentStaffId();
  await prisma.auditLog.create({ data: { entityType: "staff", entityId, field: "*", action, changedBy: staffId } });
}

function revalidate() {
  revalidatePath("/settings/staff");
  revalidatePath("/orgchart");
}

/** true nếu targetStaffId là ADMIN cuối cùng còn đang hoạt động (không tính chính nó nếu đang bị deactivate/xóa). */
async function isLastActiveAdmin(targetStaffId: string): Promise<boolean> {
  const admin = await prisma.role.findUnique({ where: { code: "ADMIN" } });
  if (!admin) return false;
  const target = await prisma.staff.findUnique({ where: { id: targetStaffId }, select: { roleId: true } });
  if (target?.roleId !== admin.id) return false;
  const otherActiveAdmins = await prisma.staff.count({ where: { roleId: admin.id, isActive: true, id: { not: targetStaffId } } });
  return otherActiveAdmins === 0;
}

/** Bật/tắt hoạt động 1 nhân sự — chặn tự-deactivate và chặn deactivate ADMIN cuối cùng còn hoạt động. */
export async function updateStaffStatus(staffId: string, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const isActive = formData.get("isActive") === "on";
  const actingStaffId = await getCurrentStaffId();

  if (!isActive) {
    if (staffId === actingStaffId) return { error: t("errorCannotDeactivateSelf") };
    if (await isLastActiveAdmin(staffId)) return { error: t("errorLastAdmin") };
  }

  await prisma.staff.update({ where: { id: staffId }, data: { isActive } });
  await audit(staffId, "UPDATE");
  revalidate();
  return {};
}

/**
 * Xóa thật (hard delete) 1 nhân sự — tự dọn 6 bảng có FK RESTRICT trước khi xóa (Notification,
 * ClientTransfer.transferredById, ProjectOrderAttendee, ProjectMember, ConversationMember,
 * ShiftAssignment). ~40 FK còn lại là SET NULL (Project.ownerId, CostSheet.*, Contract.*...) và 4 FK
 * là CASCADE (MessageReaction/MessageDeletion/PollVote/KpiScore) — Prisma/SQLite tự xử lý ở tầng DB.
 * AuditLog.changedBy KHÔNG có FK (String trần) — cố ý để lại tham chiếu "mồ côi", giữ nguyên lịch sử.
 */
export async function deleteStaff(staffId: string, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await requirePermission("settings.staff.manage");
  const t = await getTranslations("settings.staff");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const actingStaffId = await getCurrentStaffId();

  if (staffId === actingStaffId) return { error: t("errorCannotDeleteSelf") };

  const target = await prisma.staff.findUnique({ where: { id: staffId }, select: { fullName: true } });
  if (!target) return {};
  if (confirmName !== target.fullName) return { error: t("errorRequired") };
  if (await isLastActiveAdmin(staffId)) return { error: t("errorLastAdmin") };

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { recipientStaffId: staffId } }),
    prisma.staff.delete({ where: { id: staffId } }),
  ]);
  await audit(staffId, "DELETE");
  revalidate();
  return {};
}
