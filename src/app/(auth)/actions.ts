"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { attemptLogin, setStaffPassword } from "@/lib/auth";
import {
  clearAuthSession,
  consumeResetTokenLookup,
  createPasswordResetToken,
  getAuthenticatedStaffId,
  isAllowedLoginDomain,
  isMailableDomain,
  normalizeLoginId,
  RESET_TOKEN_TTL_MIN,
  setAuthSession,
} from "@/lib/auth-session";
import { ACT_AS_COOKIE } from "@/lib/current-staff";
import { cookies } from "next/headers";
import { isMailConfigured, sendPasswordResetEmail } from "@/lib/mailer";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordStrength,
  verifyPassword,
  type PasswordIssue,
} from "@/lib/password";

export type AuthFormState = { error?: string; success?: string };

/** Dịch mã lỗi chính sách mật khẩu (mã đầu tiên) sang câu tiếng Việt/Anh. */
async function policyMessage(issues: PasswordIssue[]): Promise<string> {
  const t = await getTranslations("auth.pw");
  return t(issues[0], { n: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
}

// ───────────────────────────── Đăng nhập / Đăng xuất ─────────────────────────────

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const t = await getTranslations("auth.errors");
  // Người dùng có thể gõ email công ty ĐẦY ĐỦ hoặc chỉ tên tài khoản nội bộ ("thukho").
  const email = normalizeLoginId(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: t("required") };
  if (!isAllowedLoginDomain(email)) return { error: t("domain") };

  const result = await attemptLogin(email, password);
  if (!result.ok) {
    if (result.reason === "LOCKED") return { error: t("locked", { minutes: result.lockedMinutes ?? 15 }) };
    if (result.reason === "INACTIVE") return { error: t("inactive") };
    return { error: t("invalidCredentials") };
  }

  await setAuthSession(result.staffId);
  // Cookie act-as còn sót từ phiên trước của người khác — xoá để không vô tình mạo danh.
  (await cookies()).delete(ACT_AS_COOKIE);

  redirect(result.mustChangePassword ? "/change-password" : "/");
}

export async function logoutAction(): Promise<void> {
  await clearAuthSession();
  (await cookies()).delete(ACT_AS_COOKIE);
  redirect("/login");
}

// ───────────────────────────── Đổi mật khẩu (đang đăng nhập) ─────────────────────────────

export async function changePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const t = await getTranslations("auth.errors");
  const staffId = await getAuthenticatedStaffId();
  if (!staffId) return { error: t("notLoggedIn") };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current || !next || !confirm) return { error: t("required") };
  if (next !== confirm) return { error: t("mismatch") };
  if (next === current) return { error: t("sameAsOld") };

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { email: true, fullName: true, passwordHash: true },
  });
  if (!staff) return { error: t("notLoggedIn") };

  // Chưa từng đặt mật khẩu → "mật khẩu hiện tại" chính là mật khẩu chung công ty cấp.
  const currentOk = staff.passwordHash
    ? verifyPassword(current, staff.passwordHash)
    : current === (await (await import("@/lib/auth")).getDefaultPassword());
  if (!currentOk) return { error: t("currentWrong") };

  const issues = validatePasswordStrength(next, { email: staff.email, fullName: staff.fullName });
  if (issues.length) return { error: await policyMessage(issues) };

  await setStaffPassword(staffId, next);
  revalidatePath("/", "layout");
  redirect("/");
}

// ───────────────────────────── Quên mật khẩu ─────────────────────────────

/**
 * Luôn trả cùng một thông báo dù email có tồn tại hay không — không để người ngoài dò xem
 * email nào có trong hệ thống.
 */
export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const [tErr, tForgot] = await Promise.all([getTranslations("auth.errors"), getTranslations("auth.forgot")]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) return { error: tErr("required") };
  // Chỉ tài khoản có hộp thư thật mới tự đặt lại được. Tài khoản nội bộ (thủ kho, bảo vệ) không có
  // hộp thư → nhờ admin cấp lại ở /settings/staff, tránh tạo token rác rồi bắt người ta chờ mail.
  if (!isMailableDomain(email)) return { error: tErr("noMailbox") };

  const staff = await prisma.staff.findUnique({ where: { email }, select: { id: true, fullName: true, isActive: true } });
  if (staff?.isActive) {
    const token = await createPasswordResetToken(staff.id, null);
    if (isMailConfigured()) {
      await sendPasswordResetEmail(email, staff.fullName, token, RESET_TOKEN_TTL_MIN);
    }
    // Chưa cấu hình SMTP: token vẫn được tạo, admin cấp link cho nhân sự ở /settings/staff.
  }

  return { success: isMailConfigured() ? tForgot("sent") : tForgot("noMailConfigured") };
}

// ───────────────────────────── Đặt lại mật khẩu bằng link ─────────────────────────────

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const t = await getTranslations("auth.errors");
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: t("tokenInvalid") };
  if (!next || !confirm) return { error: t("required") };
  if (next !== confirm) return { error: t("mismatch") };

  const record = await consumeResetTokenLookup(token);
  if (!record) return { error: t("tokenExpired") };

  const issues = validatePasswordStrength(next, { email: record.staff.email, fullName: record.staff.fullName });
  if (issues.length) return { error: await policyMessage(issues) };

  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.staff.update({
      where: { id: record.staffId },
      data: {
        passwordHash: (await import("@/lib/password")).hashPassword(next),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
  ]);

  // Đặt lại xong thì đăng nhập luôn — người dùng vừa chứng minh sở hữu email/link.
  await setAuthSession(record.staffId);
  redirect("/");
}
