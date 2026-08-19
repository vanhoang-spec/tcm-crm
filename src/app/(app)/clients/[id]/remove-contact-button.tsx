"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { removeContact } from "../actions";

/**
 * Xoá một người liên hệ phía khách (người đã nghỉ / đổi vai trò).
 *
 * Xoá CỨNG, không có đường khôi phục → hỏi lại đúng như các nút xoá khác trong repo
 * (kb-panel.tsx, delete-lesson-button.tsx, chat). Ảnh chụp tên/ĐT/email ghi vào AuditLog trước khi
 * xoá để còn tra lại "hồi đó ai là đầu mối".
 */
export function RemoveContactButton({ clientId, contactId, name }: { clientId: string; contactId: string; name: string }) {
  const t = useTranslations("clients.detail");
  const [state, formAction, pending] = useActionState(removeContact.bind(null, clientId, contactId), { error: undefined } as { error?: string });
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(t("removeContactConfirm", { name }))) e.preventDefault();
      }}
      className="shrink-0"
    >
      <button
        type="submit"
        disabled={pending}
        aria-label={t("removeContact")}
        title={t("removeContact")}
        className="rounded-lg p-2 text-muted-foreground hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {state.error && <span className="ml-1 text-xs text-danger">{state.error}</span>}
    </form>
  );
}
