"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { saveJdTemplate, deleteJdTemplate, type TemplateState } from "./actions";
import type { JdBlock } from "./position-editor";

const input =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const area =
  "w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export type TemplateData = JdBlock & { id: string; name: string };

const EMPTY: JdBlock = { jdSummary: "", jdResponsibilities: "", jdRequirements: "", jdBenefits: "" };

/** Một mẫu JD — dùng cho cả tạo mới (template = null) và sửa. Ô chữ CONTROLLED, xem PositionEditor. */
function TemplateForm({ template }: { template: TemplateData | null }) {
  const t = useTranslations("settings.recruit");
  const [state, formAction, pending] = useActionState<TemplateState, FormData>(saveJdTemplate, {});
  const [name, setName] = useState(template?.name ?? "");
  const [jd, setJd] = useState<JdBlock>(template ?? EMPTY);

  const field = (key: keyof JdBlock, rows: number) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t(key)}</span>
      <textarea
        name={key}
        rows={rows}
        value={jd[key]}
        onChange={(e) => setJd({ ...jd, [key]: e.target.value })}
        className={area}
      />
    </label>
  );

  return (
    <form action={formAction} className="space-y-2">
      {template && <input type="hidden" name="templateId" value={template.id} />}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("templateName")}</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} className={input} required />
      </label>
      {field("jdSummary", 2)}
      {field("jdResponsibilities", 4)}
      {field("jdRequirements", 4)}
      {field("jdBenefits", 2)}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "..." : template ? t("save") : t("create")}
        </button>
        {state.error && <span className="text-xs text-danger">{t("errGeneric")}</span>}
        {state.ok && <span className="text-xs text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

function DeleteTemplateButton({ template }: { template: TemplateData }) {
  const t = useTranslations("settings.recruit");
  const [, formAction, pending] = useActionState<TemplateState, FormData>(deleteJdTemplate, {});
  return (
    <form
      action={formAction}
      // Hỏi lại trước khi xoá — theo tiền lệ kb-panel.tsx. Mẫu JD là công sức soạn tay, mất là gõ lại.
      onSubmit={(e) => {
        if (!window.confirm(t("confirmDeleteTemplate", { name: template.name }))) e.preventDefault();
      }}
    >
      <input type="hidden" name="templateId" value={template.id} />
      <button
        type="submit"
        disabled={pending}
        title={t("deleteTemplate")}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-danger hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

export function JdTemplates({ templates }: { templates: TemplateData[] }) {
  const t = useTranslations("settings.recruit");
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("templatesTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("templatesHint")}</p>
      </div>

      {templates.map((tpl) => (
        <details key={tpl.id} className="rounded-lg border border-border bg-surface-2 p-3">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium text-foreground">
            <span>{tpl.name}</span>
          </summary>
          <div className="mt-3 space-y-3">
            <TemplateForm template={tpl} />
            <DeleteTemplateButton template={tpl} />
          </div>
        </details>
      ))}

      <details className="rounded-lg border border-dashed border-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">{t("newTemplate")}</summary>
        <div className="mt-3">
          <TemplateForm template={null} />
        </div>
      </details>
    </section>
  );
}
