"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { updateStaffStatus, deleteStaff, adminResetPassword, unlockStaffAccount, updateStaffLogin, updateStaffOrg, type StaffFormState } from "./actions";

export type StaffRowData = {
  id: string;
  fullName: string;
  email: string;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  gender: string | null;
  workLocation: string | null;
  managerId: string | null;
  managerName: string | null;
  isPlanningStaff: boolean;
  isActive: boolean;
  payrollExempt: boolean;
  dateOfBirth: Date | null;
  firstWorkDate: Date | null;
  createdAt: Date;
  /** "NEVER_SET" | "EXPIRED" | "OK" — trạng thái mật khẩu, tính ở server. */
  passwordState: "NEVER_SET" | "EXPIRED" | "OK";
  lastLoginAt: Date | null;
  locked: boolean;
};

export function StaffRow({
  staff,
  departments,
  managers,
}: {
  staff: StaffRowData;
  departments: { id: string; name: string }[];
  /** Mọi nhân sự đang hoạt động TRỪ chính người này — ứng viên làm quản lý trực tiếp. */
  managers: { id: string; fullName: string }[];
}) {
  const t = useTranslations("settings.staff");
  const tAuth = useTranslations("auth.admin");
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingLogin, setEditingLogin] = useState(false);
  const [editingOrg, setEditingOrg] = useState(false);

  const orgAction = updateStaffOrg.bind(null, staff.id);
  const [orgState, orgFormAction, orgPending] = useActionState<StaffFormState, FormData>(orgAction, {});

  const loginAction = updateStaffLogin.bind(null, staff.id);
  const [loginState, loginFormAction, loginPending] = useActionState<StaffFormState, FormData>(loginAction, {});

  const resetAction = adminResetPassword.bind(null, staff.id);
  const [resetState, resetFormAction, resetPending] = useActionState<StaffFormState, FormData>(resetAction, {});

  const unlockAction = unlockStaffAccount.bind(null, staff.id);
  const [, unlockFormAction, unlockPending] = useActionState<StaffFormState, FormData>(unlockAction, {});

  const statusAction = updateStaffStatus.bind(null, staff.id);
  const [statusState, statusFormAction, statusPending] = useActionState<StaffFormState, FormData>(statusAction, {});

  const deleteAction = deleteStaff.bind(null, staff.id);
  const [deleteState, deleteFormAction, deletePending] = useActionState<StaffFormState, FormData>(deleteAction, {});

  return (
    <tr>
      <td className="px-3 py-2 font-medium text-foreground">{staff.fullName}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {!editingLogin ? (
          <div className="flex flex-col items-start gap-0.5">
            <span>{staff.email}</span>
            <div className="flex items-center gap-1.5">
              {staff.payrollExempt && (
                <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{t("payrollExemptShort")}</span>
              )}
              <button type="button" onClick={() => setEditingLogin(true)} className="text-[11px] text-brand-600 hover:underline">
                {t("editLogin")}
              </button>
            </div>
            {loginState.success === "SAVED" && <span className="text-[11px] text-success">{t("saved")}</span>}
          </div>
        ) : (
          <form action={loginFormAction} className="flex flex-col gap-1">
            <input
              name="email"
              defaultValue={staff.email}
              autoCapitalize="none"
              spellCheck={false}
              className="h-8 w-48 rounded-md border border-border-strong bg-surface px-2 text-xs"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={orgPending}
                className="h-7 rounded-md bg-brand-600 px-2 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {orgPending ? "..." : t("save")}
              </button>
              <button type="button" onClick={() => setEditingOrg(false)} className="text-[11px] text-muted-foreground hover:underline">
                {t("cancelEdit")}
              </button>
            </div>
            {orgState.error && <span className="text-[11px] text-danger">{orgState.error}</span>}
          </form>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{staff.gender ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{staff.workLocation ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{staff.managerName ?? t("noManager")}</td>
      <td className="px-3 py-2 text-muted-foreground">{staff.dateOfBirth ? formatDate(staff.dateOfBirth) : "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{staff.firstWorkDate ? formatDate(staff.firstWorkDate) : "—"}</td>
      <td className="px-3 py-2">
        <form action={statusFormAction} className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={staff.isActive}
              className="h-3.5 w-3.5 rounded border-border-strong"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            <span className={staff.isActive ? "text-success" : "text-muted-foreground"}>
              {staff.isActive ? t("active") : t("inactive")}
            </span>
          </label>
          {statusPending && <span className="text-[11px] text-muted-foreground">...</span>}
          {statusState.error && <span className="text-[11px] text-danger">{statusState.error}</span>}
        </form>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={
                staff.passwordState === "OK"
                  ? "text-xs text-success"
                  : staff.passwordState === "EXPIRED"
                    ? "text-xs text-warning"
                    : "text-xs text-muted-foreground"
              }
            >
              {staff.passwordState === "OK"
                ? tAuth("statusOk")
                : staff.passwordState === "EXPIRED"
                  ? tAuth("statusExpired")
                  : tAuth("statusNeverSet")}
            </span>
            {staff.locked && <span className="rounded bg-danger-bg px-1.5 text-[10px] text-danger">{tAuth("lockedUntil")}</span>}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {staff.lastLoginAt ? formatDate(staff.lastLoginAt) : tAuth("neverLoggedIn")}
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            <form action={resetFormAction}>
              <input type="hidden" name="mode" value="DEFAULT" />
              <button
                type="submit"
                disabled={resetPending}
                className="h-7 rounded-md border border-border-strong px-2 text-[11px] text-foreground hover:bg-surface-2 disabled:opacity-50"
                title={tAuth("resetToDefaultHint")}
              >
                {tAuth("resetToDefault")}
              </button>
            </form>
            <form action={resetFormAction}>
              <input type="hidden" name="mode" value="LINK" />
              <button
                type="submit"
                disabled={resetPending}
                className="h-7 rounded-md border border-border-strong px-2 text-[11px] text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                {tAuth("createLink")}
              </button>
            </form>
            {staff.locked && (
              <form action={unlockFormAction}>
                <button
                  type="submit"
                  disabled={unlockPending}
                  className="h-7 rounded-md border border-border-strong px-2 text-[11px] text-foreground hover:bg-surface-2 disabled:opacity-50"
                >
                  {tAuth("unlock")}
                </button>
              </form>
            )}
          </div>

          {resetState.success === "DEFAULT" && <span className="text-[11px] text-success">{tAuth("doneReset")}</span>}
          {resetState.success === "EMAIL_SENT" && (
            <span className="text-[11px] text-success">{tAuth("emailSent", { email: staff.email })}</span>
          )}
          {resetState.success === "LINK" && resetState.resetUrl && (
            <div className="rounded-md border border-border bg-surface-2 p-1.5">
              <p className="text-[11px] text-muted-foreground">{tAuth("linkCreated", { minutes: 60 })}</p>
              <input
                readOnly
                value={resetState.resetUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full rounded border border-border-strong bg-surface px-1.5 py-1 text-[10px]"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(resetState.resetUrl!).then(() => setCopied(true));
                }}
                className="mt-1 text-[11px] text-brand-600 hover:underline"
              >
                {copied ? tAuth("copied") : tAuth("copyLink")}
              </button>
            </div>
          )}
          {resetState.error && <span className="text-[11px] text-danger">{resetState.error}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-8 rounded-lg border border-danger/40 px-2.5 text-xs text-danger hover:bg-danger-bg"
          >
            {t("deleteBtn")}
          </button>
        ) : (
          <form action={deleteFormAction} className="flex min-w-[220px] flex-col gap-1.5 rounded-lg border border-danger/30 bg-danger-bg p-2">
            <p className="text-[11px] text-danger">{t("deleteWarning")}</p>
            <input
              type="text"
              name="confirmName"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t("deleteConfirmPlaceholder")}
              className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs outline-none focus:border-danger"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={deletePending || confirmText !== staff.fullName}
                className="h-8 rounded-lg bg-danger px-2.5 text-xs font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletePending ? "..." : t("confirmDeleteBtn")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
                className="h-8 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2"
              >
                {t("cancelBtn")}
              </button>
            </div>
            {deleteState.error && <span className="text-[11px] text-danger">{deleteState.error}</span>}
          </form>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{formatDate(staff.createdAt)}</td>
    </tr>
  );
}
