"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { dissolveDirectConversation } from "./actions";

/** Nút giải tán chat 1-1 ở header — 1 trong 2 người tham gia đều bấm được. Mirror handleDisband (group-manager.tsx). */
export function DissolveDirectButton({ conversationId }: { conversationId: string }) {
  const t = useTranslations("chat");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDissolve() {
    if (!window.confirm(t("dissolveDirectConfirm"))) return;
    setError(null);
    setPending(true);
    const res = await dissolveDirectConversation(conversationId);
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleDissolve}
        title={t("dissolveDirect")}
        className="rounded-lg p-2 text-muted-foreground hover:bg-danger-bg hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </>
  );
}
