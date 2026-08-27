"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createDraftProject, updateDraftProject, applyDraftMapping } from "./actions";

/**
 * CR-2 — DỰ ÁN NHÁP: chỗ neo tạm cho task Creative khi Account chưa kịp nhập dự án vào app.
 * Khối này chỉ render cho người có `creative.task.manage` (page.tsx quyết định), vì đây là 3 vai
 * điều phối đang nhận việc từ Account ngoài app.
 *
 * ⚠ Nháp đã GÁN về dự án thật thì biến khỏi danh sách này (page lọc `mappedAt: null`) — bản ghi
 * vẫn còn trong DB làm dấu vết, không có đường xoá.
 */

export type DraftRow = {
  id: string;
  name: string;
  clientName: string | null;
  phase: string;
  taskCount: number;
};
type Opt = { id: string; label: string };

// ⚠ text-base (16px) trên MOBILE — iOS Safari tự phóng to trang khi focus ô nhập dưới 16px
// (HANDOVER mục 4.4). Từ sm trở lên mới về text-xs cho gọn lưới.
const input =
  "h-8 rounded-lg border border-border-strong bg-surface px-2 text-base sm:text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function PhaseSelect({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations("creative");
  return (
    <select name="phase" defaultValue={defaultValue ?? "BIDDING"} className={input}>
      <option value="BIDDING">{t("phaseBIDDING")}</option>
      <option value="WORKING">{t("phaseWORKING")}</option>
    </select>
  );
}

function DraftRowView({ draft, projects }: { draft: DraftRow; projects: Opt[] }) {
  const t = useTranslations("creative");
  const [mode, setMode] = useState<null | "edit" | "map">(null);

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{draft.name}</span>
        {draft.clientName && <Badge tone="neutral">{draft.clientName}</Badge>}
        <Badge tone={draft.phase === "WORKING" ? "success" : "brand"}>{t(`phase${draft.phase === "WORKING" ? "WORKING" : "BIDDING"}`)}</Badge>
        <Badge tone="warning">{t("draft.taskCount", { count: draft.taskCount })}</Badge>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setMode(mode === "edit" ? null : "edit")} className="h-7 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
            {t("draft.btnEdit")}
          </button>
          <button type="button" onClick={() => setMode(mode === "map" ? null : "map")} className="h-7 rounded-lg bg-brand-500 px-2.5 text-xs font-medium text-white hover:bg-brand-600">
            {t("draft.btnMap")}
          </button>
        </div>
      </div>

      {mode === "edit" && (
        <form action={updateDraftProject.bind(null, draft.id)} onReset={(e) => e.preventDefault()} className="mt-2 flex flex-wrap items-end gap-2">
          <input name="name" required defaultValue={draft.name} maxLength={200} className={`${input} min-w-[160px] flex-1`} />
          <input name="clientName" defaultValue={draft.clientName ?? ""} placeholder={t("draft.clientPlaceholder")} className={`${input} min-w-[140px]`} />
          <PhaseSelect defaultValue={draft.phase} />
          <button type="submit" className="h-8 rounded-lg border border-border-strong px-3 text-xs text-foreground hover:bg-surface-2">
            {t("draft.btnSave")}
          </button>
        </form>
      )}

      {mode === "map" && (
        <form action={applyDraftMapping.bind(null, draft.id)} onReset={(e) => e.preventDefault()} className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-end gap-2">
            <SearchableSelect
              name="projectId"
              required
              placeholder={t("draft.selectRealProject")}
              className="min-w-[220px]"
              options={projects.map((p) => ({ value: p.id, label: p.label }))}
            />
            <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
              {t("draft.btnMapConfirm", { count: draft.taskCount })}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("draft.mapHint")}</p>
        </form>
      )}
    </div>
  );
}

export function DraftPanel({ drafts, projects }: { drafts: DraftRow[]; projects: Opt[] }) {
  const t = useTranslations("creative");
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("draft.panelTitle", { count: drafts.length })}</h2>
        <button type="button" onClick={() => setShowCreate((v) => !v)} className="ml-auto h-7 rounded-lg border border-border-strong px-2.5 text-xs text-foreground hover:bg-surface-2">
          {t("draft.btnNew")}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("draft.panelSubtitle")}</p>

      {showCreate && (
        <form action={createDraftProject} onReset={(e) => e.preventDefault()} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border-strong p-3">
          <input name="name" required maxLength={200} placeholder={t("draft.namePlaceholder")} className={`${input} min-w-[160px] flex-1`} />
          <input name="clientName" placeholder={t("draft.clientPlaceholder")} className={`${input} min-w-[140px]`} />
          <PhaseSelect />
          <button type="submit" className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">
            {t("draft.btnCreate")}
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2">
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t("draft.empty")}</p>
        ) : (
          drafts.map((d) => <DraftRowView key={d.id} draft={d} projects={projects} />)
        )}
      </div>
    </section>
  );
}
