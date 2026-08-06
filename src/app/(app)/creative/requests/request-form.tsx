"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { REQUEST_ITEM_CODES } from "@/lib/creative";
import { createCreativeRequest, type RequestFormState } from "./actions";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/**
 * Mã lỗi → key i18n, khai TƯỜNG MINH.
 * ⚠ Cố ý không ghép chuỗi `t("err" + code)`: key ghép lúc chạy không được script kiểm parity bắt.
 */
const ERR_KEY: Record<string, string> = {
  NO_ITEM: "errNoItem",
  NO_DEADLINE: "errNoDeadline",
  NO_PROJECT: "errNoProject",
  NO_CLIENT: "errNoClient",
  NO_CLIENT_STATUS: "errGeneric",
  NO_OPTION_SET: "errGeneric",
};

export type Opt = { id: string; label: string };

/**
 * Phiếu NHẬN VIỆC. Người đặt việc tick hạng mục cần làm + hạn, hệ thống sinh task và tự đưa về
 * đúng team nhỏ.
 *
 * ⚠ Mọi ô CHỮ đều CONTROLLED: React 19 gọi `requestFormReset` sau MỌI lần chạy action — kể cả khi
 * action TRẢ LỖI — nên để `defaultValue` thì phần vừa gõ bị xoá đúng lúc người dùng phải sửa lỗi.
 */
export function RequestForm({ projects, clients }: { projects: Opt[]; clients: Opt[] }) {
  const t = useTranslations("creativeRequest");
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(createCreativeRequest, {});

  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [brief, setBrief] = useState("");
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, string>>({});

  const creatingProject = projectId === "";
  const creatingClient = clientId === "";

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("formTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("formHint")}</p>
      </div>

      {/* ── Công việc ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("project")}</span>
          <select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
            <option value="">{t("projectNew")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {creatingProject && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("newProjectName")}</span>
            <input
              name="newProjectName"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className={input}
              placeholder={t("newProjectPlaceholder")}
            />
          </label>
        )}

        {creatingProject && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("client")}</span>
              <select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
                <option value="">{t("clientNew")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {creatingClient && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("newClientName")}</span>
                <input
                  name="newClientName"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className={input}
                />
              </label>
            )}
          </>
        )}
      </div>

      {/* ── Brief ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("briefLink")}</span>
          <input name="briefLinkUrl" value={brief} onChange={(e) => setBrief(e.target.value)} className={input} placeholder="https://" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("deadline")}</span>
          {/* Hạn BẮT BUỘC — chốt chặn thật nằm ở server (cột NOT NULL), đây chỉ là lớp nhắc. */}
          <DateField name="deadline" required className={input} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("note")}</span>
        <textarea name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={area} />
      </label>

      {/* ── Hạng mục cần làm ── */}
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("items")}</span>
        <div className="space-y-1.5 rounded-lg border border-border-strong p-3">
          {REQUEST_ITEM_CODES.map((code) => (
            <div key={code} className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name={`item_${code}`}
                  checked={!!ticked[code]}
                  onChange={(e) => setTicked({ ...ticked, [code]: e.target.checked })}
                  className="h-4 w-4 rounded border-border-strong"
                />
                {t(`item${code}`)}
              </label>
              {ticked[code] && (
                <input
                  name={`detail_${code}`}
                  value={details[code] ?? ""}
                  onChange={(e) => setDetails({ ...details, [code]: e.target.value })}
                  className={input}
                  placeholder={t("itemDetailPlaceholder")}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {pending ? "..." : t("submit")}
        </button>
        <span className="text-xs text-muted-foreground">{t("submitHint")}</span>
        {state.error && <span className="text-xs text-danger">{t(ERR_KEY[state.error] ?? "errGeneric")}</span>}
      </div>
    </form>
  );
}
