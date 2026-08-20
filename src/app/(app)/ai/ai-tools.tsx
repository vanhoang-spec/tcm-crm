"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AiResult, RunButton, ToolCard, aiInput, aiTextarea } from "./ai-shared";
import { DOCUMENT_TYPES } from "@/lib/ai/document-types";
import {
  analyzeCostSheet,
  askIndustryTrend,
  brainstormIdeas,
  draftDocument,
  generateBoardReport,
  generateCanvaBrief,
  writeContent,
  type AiState,
} from "./actions";

export type ProjectOption = { id: string; label: string };

const fileInputClass =
  "block w-full text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100";

/** Dòng nhỏ báo kết quả lưu file đính kèm — dùng chung Brainstorm/Content/Canva. */
function AttachSummary({ state, t }: { state: AiState; t: ReturnType<typeof useTranslations> }) {
  if (!state.text) return null;
  return (
    <>
      {!!state.savedFiles && <p className="mt-2 text-[11px] text-success">{t("attachSaved", { count: state.savedFiles })}</p>}
      {!!state.rejectedFiles?.length && (
        <p className="mt-2 text-[11px] text-warning">{t("attachRejected", { names: state.rejectedFiles.join(", ") })}</p>
      )}
    </>
  );
}

// ───────────────────────── Ý tưởng & concept ─────────────────────────

export function BrainstormTool({ projects }: { projects: ProjectOption[] }) {
  const t = useTranslations("ai.brainstorm");
  const [state, action, pending] = useActionState<AiState, FormData>(brainstormIdeas, {});

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="bs-project" className="mb-1 block text-xs font-medium text-foreground">{t("projectLabel")}</label>
          <SearchableSelect
            name="projectId"
            required
            placeholder={t("projectPlaceholder")}
            options={projects.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
        <div>
          <label htmlFor="bs-note" className="mb-1 block text-xs font-medium text-foreground">{t("noteLabel")}</label>
          <textarea id="bs-note" name="note" rows={3} placeholder={t("notePlaceholder")} className={aiTextarea} />
        </div>
        <div>
          <label htmlFor="bs-files" className="mb-1 block text-xs font-medium text-foreground">{t("attachLabel")}</label>
          <input id="bs-files" name="files" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*" className={fileInputClass} />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("attachHint")}</p>
        </div>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      <AiResult doc={state.doc} error={state.error} />
      <AttachSummary state={state} t={t} />
    </ToolCard>
  );
}

// ───────────────────────── Viết bài / Content ─────────────────────────

export function ContentWriterTool({ projects }: { projects: ProjectOption[] }) {
  const t = useTranslations("ai.content");
  const [state, action, pending] = useActionState<AiState, FormData>(writeContent, {});

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="ct-project" className="mb-1 block text-xs font-medium text-foreground">{t("projectLabel")}</label>
          <SearchableSelect
            name="projectId"
            required
            placeholder={t("projectPlaceholder")}
            options={projects.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
        <div>
          <label htmlFor="ct-note" className="mb-1 block text-xs font-medium text-foreground">{t("noteLabel")}</label>
          <textarea id="ct-note" name="note" rows={3} placeholder={t("notePlaceholder")} className={aiTextarea} />
        </div>
        <div>
          <label htmlFor="ct-files" className="mb-1 block text-xs font-medium text-foreground">{t("attachLabel")}</label>
          <input id="ct-files" name="files" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*" className={fileInputClass} />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("attachHint")}</p>
        </div>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      <AiResult doc={state.doc} error={state.error} />
      <AttachSummary state={state} t={t} />
    </ToolCard>
  );
}

// ───────────────────────── Brief thiết kế Canva ─────────────────────────

export function CanvaBriefTool({ projects }: { projects: ProjectOption[] }) {
  const t = useTranslations("ai.canva");
  const [state, action, pending] = useActionState<AiState, FormData>(generateCanvaBrief, {});

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="cv-project" className="mb-1 block text-xs font-medium text-foreground">{t("projectLabel")}</label>
          <SearchableSelect
            name="projectId"
            required
            placeholder={t("projectPlaceholder")}
            options={projects.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
        <div>
          <label htmlFor="cv-deliverable" className="mb-1 block text-xs font-medium text-foreground">{t("deliverableLabel")}</label>
          <input id="cv-deliverable" name="deliverable" required placeholder={t("deliverablePlaceholder")} className={aiInput} />
        </div>
        <div>
          <label htmlFor="cv-note" className="mb-1 block text-xs font-medium text-foreground">{t("noteLabel")}</label>
          <textarea id="cv-note" name="note" rows={3} placeholder={t("notePlaceholder")} className={aiTextarea} />
        </div>
        <div>
          <label htmlFor="cv-files" className="mb-1 block text-xs font-medium text-foreground">{t("attachLabel")}</label>
          <input id="cv-files" name="files" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*" className={fileInputClass} />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("attachHint")}</p>
        </div>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      <AiResult doc={state.doc} error={state.error} />
      <AttachSummary state={state} t={t} />
    </ToolCard>
  );
}

// ───────────────────────── Rà soát CO/CE ─────────────────────────

/**
 * Dùng được ở 2 nơi: trang /ai (có dropdown chọn dự án) và nhúng thẳng vào workspace dự án
 * (truyền `fixedProjectId` — khi đó bỏ dropdown, rà soát đúng dự án đang mở).
 */
export function CostSheetTool({ projects, fixedProjectId }: { projects?: ProjectOption[]; fixedProjectId?: string }) {
  const t = useTranslations("ai.costsheet");
  const [selected, setSelected] = useState(projects?.[0]?.id ?? "");

  if (fixedProjectId) return <CostSheetForm projectId={fixedProjectId} />;

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      <div className="space-y-3">
        <div>
          <label htmlFor="cs-project" className="mb-1 block text-xs font-medium text-foreground">{t("projectLabel")}</label>
          <SearchableSelect
            value={selected}
            onChange={setSelected}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.label }))}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("hint")}</p>
        </div>
        {/* key={selected}: đổi dự án thì reset kết quả cũ, tránh hiểu nhầm kết quả của dự án trước. */}
        {selected && <CostSheetForm key={selected} projectId={selected} />}
      </div>
    </ToolCard>
  );
}

function CostSheetForm({ projectId }: { projectId: string }) {
  const bound = analyzeCostSheet.bind(null, projectId);
  const [state, action, pending] = useActionState<AiState, FormData>(bound, {});
  return (
    <>
      <form action={action}>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      <AiResult doc={state.doc} error={state.error} />
    </>
  );
}

// ───────────────────────── Báo cáo BGĐ ─────────────────────────

export function BoardReportTool() {
  const t = useTranslations("ai.board");
  const [state, action, pending] = useActionState<AiState, FormData>(generateBoardReport, {});

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      <form action={action}>
        <p className="mb-3 text-[11px] text-muted-foreground">{t("hint")}</p>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      <AiResult doc={state.doc} error={state.error} />
    </ToolCard>
  );
}

// ───────────────────────── Xu hướng ngành ─────────────────────────

export function TrendTool({ webSearchOn }: { webSearchOn: boolean }) {
  const t = useTranslations("ai.trend");
  const [state, action, pending] = useActionState<AiState, FormData>(askIndustryTrend, {});

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      {/* Cảnh báo đặt TRƯỚC ô nhập: người dùng phải biết nguồn gốc câu trả lời trước khi đọc,
          không phải sau. Bật tìm kiếm web thì đổi sang thông báo tích cực. */}
      {webSearchOn ? (
        <p className="mb-3 rounded-lg border border-success/40 bg-success-bg px-3 py-2 text-xs text-success">
          {t("searchOn")}
        </p>
      ) : (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
          {t("warning")}
        </p>
      )}
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="tr-q" className="mb-1 block text-xs font-medium text-foreground">{t("questionLabel")}</label>
          <textarea id="tr-q" name="question" rows={3} required placeholder={t("questionPlaceholder")} className={aiTextarea} />
        </div>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      {/* Nhãn nguồn gốc kết quả: người đọc luôn biết câu trả lời có link kiểm chứng hay không. */}
      {state.doc && (
        <p className={`mt-3 text-xs ${state.grounded ? "text-success" : "text-warning"}`}>
          {state.grounded ? t("resultGrounded", { count: state.sourceCount ?? 0 }) : t("resultUngrounded")}
        </p>
      )}
      <AiResult doc={state.doc} error={state.error} />
    </ToolCard>
  );
}

// ───────────────────────── Soạn thảo văn bản (hành chính / nhân sự / kế toán) ──────────────────

/**
 * ⚠ Công cụ này KHÔNG lưu gì: file mẫu đọc xong là bỏ, bản soạn không vào DB (quyết định chủ dự án
 * 20/08/2026). Vì vậy phải nói rõ với người dùng ngay trên form là **phải tải Word/PDF về máy**, và
 * nội dung vẫn đi sang DeepSeek — "không lưu trong app" khác "không rời công ty".
 */
export function DocumentTool() {
  const t = useTranslations("ai.document");
  const locale = useLocale();
  const [state, action, pending] = useActionState<AiState, FormData>(draftDocument, {});
  const [typeCode, setTypeCode] = useState(DOCUMENT_TYPES[0].code);
  const current = DOCUMENT_TYPES.find((d) => d.code === typeCode) ?? DOCUMENT_TYPES[0];

  return (
    <ToolCard title={t("title")} desc={t("desc")}>
      <p className="mb-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">{t("privacyWarning")}</p>
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="doc-type" className="mb-1 block text-xs font-medium text-foreground">{t("typeLabel")}</label>
          <select id="doc-type" name="docType" value={typeCode} onChange={(e) => setTypeCode(e.target.value as typeof typeCode)} className={aiInput}>
            {DOCUMENT_TYPES.map((d) => (
              <option key={d.code} value={d.code}>
                {locale === "en" ? d.labelEn : d.labelVi}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">{locale === "en" ? current.hintEn : current.hintVi}</p>
        </div>
        <div>
          <label htmlFor="doc-subject" className="mb-1 block text-xs font-medium text-foreground">{t("subjectLabel")}</label>
          <input id="doc-subject" name="subject" placeholder={t("subjectPlaceholder")} className={aiInput} />
        </div>
        <div>
          <label htmlFor="doc-brief" className="mb-1 block text-xs font-medium text-foreground">{t("briefLabel")}</label>
          <textarea id="doc-brief" name="brief" rows={5} required placeholder={t("briefPlaceholder")} className={aiTextarea} />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("briefHint")}</p>
        </div>
        <div>
          <label htmlFor="doc-ref" className="mb-1 block text-xs font-medium text-foreground">{t("referenceLabel")}</label>
          <input id="doc-ref" type="file" name="reference" accept=".pdf,.docx,.txt,.md,.csv" className="block w-full text-xs text-muted-foreground file:mr-3 file:h-8 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:text-xs file:text-foreground" />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("referenceHint")}</p>
        </div>
        <RunButton pending={pending} hasResult={!!state.doc} />
      </form>
      <AiResult doc={state.doc} error={state.error} />
    </ToolCard>
  );
}
