"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import { createClientGroup, toggleClientGroup, updateClientGroup, type GroupFormState } from "./actions";

const input =
  "h-11 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:h-9";

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(createClientGroup, {});
  const t = useTranslations("clients.groups");
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
      <label className="space-y-1 text-xs text-muted-foreground">
        {t("colCode")}
        <input name="code" required placeholder="AEON" className={input + " w-28 uppercase"} />
      </label>
      <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
        {t("colName")}
        <input name="name" required placeholder={t("namePlaceholder")} className={input + " w-full"} />
      </label>
      <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
        {t("colNote")}
        <input name="note" className={input + " w-full"} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-9"
      >
        {pending ? "..." : t("addBtn")}
      </button>
      {state.error && <span className="w-full text-xs font-medium text-danger">{state.error}</span>}
    </form>
  );
}

export function GroupRow({
  group,
  memberCount,
}: {
  group: { id: string; code: string; name: string; note: string | null; isActive: boolean };
  memberCount: number;
}) {
  const t = useTranslations("clients.groups");
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(updateClientGroup.bind(null, group.id), {});
  const [, toggleAction, toggling] = useActionState<GroupFormState, FormData>(toggleClientGroup.bind(null, group.id), {});

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={5} className="px-4 py-2.5">
          <form action={formAction} className="flex flex-wrap items-end gap-2">
            <input name="code" defaultValue={group.code} required className={input + " w-28 uppercase"} />
            <input name="name" defaultValue={group.name} required className={input + " min-w-0 flex-1"} />
            <input name="note" defaultValue={group.note ?? ""} className={input + " min-w-0 flex-1"} />
            <button type="submit" disabled={pending} className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white sm:h-9">
              {pending ? "..." : t("saveBtn")}
            </button>
            <button type="button" onClick={() => setEditing(false)} aria-label={t("cancelBtn")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
            {state.error && <span className="w-full text-xs text-danger">{state.error}</span>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={"border-b border-border last:border-0 hover:bg-surface-2" + (group.isActive ? "" : " opacity-50")}>
      <td className="px-4 py-2.5 font-mono font-medium text-foreground">{group.code}</td>
      <td className="px-4 py-2.5 text-foreground">{group.name}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{group.note ?? "—"}</td>
      <td className="px-4 py-2.5 text-right text-muted-foreground">{t("memberCount", { count: memberCount })}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setEditing(true)} aria-label={t("editBtn")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
            <Pencil className="h-4 w-4" />
          </button>
          <form action={toggleAction}>
            <button type="submit" disabled={toggling} className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50">
              {group.isActive ? t("deactivateBtn") : t("activateBtn")}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
