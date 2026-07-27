"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateDepartment, type DepartmentFormState } from "./actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function DepartmentRow({
  dept,
  staff,
}: {
  dept: { id: string; code: string; name: string; costPrefix: string | null; leadStaffId: string | null; isActive: boolean };
  staff: { value: string; label: string; sublabel?: string }[];
}) {
  const t = useTranslations("settings.departments");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<DepartmentFormState, FormData>(
    updateDepartment.bind(null, dept.id),
    {},
  );

  return (
    <form action={formAction} className="rounded-lg border border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[80px_1fr_110px] sm:items-center">
        {/* Mã phòng là khoá nghiệp vụ (ORDER, quyền, ma trận) — chỉ đọc, đổi bằng migration. */}
        <span className="text-sm font-semibold text-foreground">{dept.code}</span>
        <input name="name" defaultValue={dept.name} className={input} />
        <input
          name="costPrefix"
          defaultValue={dept.costPrefix ?? ""}
          placeholder={t("prefixPlaceholder")}
          maxLength={5}
          className={input + " uppercase"}
        />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <label className="text-xs text-muted-foreground">
          {t("leadLabel")}
          <SearchableSelect name="leadStaffId" defaultValue={dept.leadStaffId ?? ""} placeholder={t("leadNone")} options={staff} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isActive" defaultChecked={dept.isActive} className="h-3.5 w-3.5 rounded border-border-strong" />
          {t("active")}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          {pending ? "..." : tCommon("save")}
        </button>
      </div>

      {state.error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
