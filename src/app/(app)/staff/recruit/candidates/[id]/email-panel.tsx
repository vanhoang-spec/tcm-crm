"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Eye, Send, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { previewCandidateEmail, sendCandidateEmail, type SendState } from "../../email-actions";

export type EmailLogRow = {
  id: string;
  templateLabel: string;
  toEmail: string;
  subject: string;
  status: string;
  error: string | null;
  sentAt: string;
  sentByName: string | null;
};
export type EmailChoice = { code: string; label: string; audience: string };

const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnDanger = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50";

const ERR: Record<string, string> = {
  BAD_INPUT: "errGeneric",
  NOT_FOUND: "errGeneric",
  NOT_CONFIGURED: "errNotConfigured",
  NOT_APPROVED: "errNotApproved",
  NO_EMAIL: "errNoEmail",
  MISSING_VARS: "errMissingVars",
  SEND_FAILED: "errSendFailed",
};

/**
 * Gửi thư cho ứng viên (TD-2b) — LUÔN đi hai bước: dựng bản xem trước → đọc → bấm Gửi.
 *
 * ⚠ Quyết định chủ dự án 22/08/2026: KHÔNG bắn thẳng. Thư đã ra khỏi hệ thống thì không thu hồi
 * được; một cú bấm thêm đổi lại việc không bao giờ gửi nhầm người hoặc gửi khi tên/vị trí điền sai.
 * ⚠ Nội dung hiện ở đây CHỈ để đọc. Lúc bấm Gửi, server dựng LẠI từ mẫu đã duyệt — không nhận chuỗi
 * nào từ trình duyệt.
 */
export function EmailPanel({
  candidateId,
  choices,
  logs,
  canSend,
}: {
  candidateId: string;
  choices: EmailChoice[];
  logs: EmailLogRow[];
  canSend: boolean;
}) {
  const t = useTranslations("recruit.email");
  const [prevState, previewAction, previewing] = useActionState<SendState, FormData>(previewCandidateEmail, {});
  const [sendState, sendAction, sending] = useActionState<SendState, FormData>(sendCandidateEmail, {});
  const [code, setCode] = useState(choices[0]?.code ?? "");

  const p = prevState.preview;
  const err = (s: SendState) => (s.error ? t(ERR[s.error] ?? "errGeneric") : null);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{t("panelTitle")}</h2>
      </div>

      {canSend && choices.length > 0 && (
        <form action={previewAction} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="candidateId" value={candidateId} />
          <label className="text-[11px] text-muted-foreground">
            {t("fTemplate")}
            <select
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 block h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400"
            >
              {choices.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={previewing} className={btn}>
            <Eye className="h-3.5 w-3.5" /> {previewing ? "…" : t("previewBtn")}
          </button>
        </form>
      )}
      {!canSend && <p className="text-xs text-muted-foreground">{t("noSendPerm")}</p>}

      {err(prevState) && <p className="text-xs text-danger">{err(prevState)}</p>}

      {p && (
        <div className="space-y-2 rounded-lg border border-border-strong bg-surface-2 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">{t("previewTitle", { label: p.templateLabel })}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t("lblFrom")}</dt>
            <dd className="text-foreground">{p.from || "—"}</dd>
            <dt className="text-muted-foreground">{t("lblTo")}</dt>
            <dd className="font-medium text-foreground">{p.to ?? <span className="text-danger">{t("errNoEmail")}</span>}</dd>
            <dt className="text-muted-foreground">{t("lblSubject")}</dt>
            <dd className="text-foreground">{p.subject}</dd>
          </dl>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed text-foreground">
            {p.body}
          </pre>

          {p.missing.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("missingVars", { vars: p.missing.join(", ") })}
            </p>
          )}
          {p.unknown.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("unknownVars", { vars: p.unknown.join(", ") })}
            </p>
          )}

          {p.blockedBy ? (
            <p className="text-xs text-danger">{t(ERR[p.blockedBy] ?? "errGeneric")}</p>
          ) : (
            <form action={sendAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="candidateId" value={candidateId} />
              <input type="hidden" name="code" value={p.code} />
              <button
                type="submit"
                disabled={sending}
                className={btnDanger}
                onClick={(e) => {
                  if (!window.confirm(t("confirmSend", { to: p.to ?? "" }))) e.preventDefault();
                }}
              >
                <Send className="h-3.5 w-3.5" /> {sending ? t("sending") : t("sendBtn")}
              </button>
              <span className="text-[11px] text-muted-foreground">{t("sendWarning")}</span>
            </form>
          )}
        </div>
      )}

      {err(sendState) && (
        <p className="text-xs text-danger">
          {err(sendState)}
          {sendState.detail && <span className="ml-1 text-muted-foreground">({sendState.detail})</span>}
        </p>
      )}
      {sendState.success && <p className="text-xs text-success">{t("sent")}</p>}

      <div className="border-t border-border pt-3">
        <p className="text-[11px] font-medium text-muted-foreground">{t("logTitle")}</p>
        {logs.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("logEmpty")}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                {l.status === "SENT" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}
                <span className="text-foreground">{l.templateLabel}</span>
                <span className="text-muted-foreground">→ {l.toEmail}</span>
                <span className="text-muted-foreground">{l.sentAt}</span>
                {l.sentByName && <span className="text-muted-foreground">· {l.sentByName}</span>}
                {l.error && <span className="text-danger">· {l.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
