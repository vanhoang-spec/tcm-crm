"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { FileText, Link2, Plus, Trash2, Download, ExternalLink, Search, Settings2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { createKbDocument, deleteKbDocument, type KbActionState } from "./actions";

type KbDoc = {
  id: string;
  title: string;
  description: string | null;
  isFile: boolean;
  fileName: string | null;
  fileSize: number | null;
  linkUrl: string | null;
  uploadedByName: string | null;
  createdAt: string;
};
type KbCategory = { id: string; label: string; documents: KbDoc[] };

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KbPanel({ categories }: { categories: KbCategory[] }) {
  const t = useTranslations("kb");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  const totalCount = categories.reduce((n, c) => n + c.documents.length, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => !activeCategory || c.id === activeCategory)
      .map((c) => ({
        ...c,
        documents: c.documents.filter((d) => !q || d.title.toLowerCase().includes(q)),
      }));
  }, [categories, activeCategory, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface pl-8 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <Link
          href="/settings/options/kb_category"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-xs font-medium text-muted-foreground hover:bg-surface-2"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {t("manageCategoriesLink")}
        </Link>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          {t("addDocument")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            activeCategory === null ? "bg-brand-600 text-white" : "bg-surface-2 text-muted-foreground hover:bg-brand-50"
          }`}
        >
          {t("allCategories")} ({totalCount})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeCategory === c.id ? "bg-brand-600 text-white" : "bg-surface-2 text-muted-foreground hover:bg-brand-50"
            }`}
          >
            {c.label} ({c.documents.length})
          </button>
        ))}
      </div>

      {showForm && (
        <KbDocumentForm categories={categories} onDone={() => setShowForm(false)} />
      )}

      <div className="space-y-5">
        {filtered.every((c) => c.documents.length === 0) ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            {totalCount === 0 ? t("emptyAll") : t("empty")}
          </p>
        ) : (
          filtered
            .filter((c) => c.documents.length > 0)
            .map((c) => (
              <div key={c.id} className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {c.documents.map((d) => (
                    <KbDocumentCard key={d.id} doc={d} />
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

function KbDocumentCard({ doc }: { doc: KbDoc }) {
  const t = useTranslations("kb");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteKbDocument(doc.id);
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {doc.isFile ? <FileText className="h-4.5 w-4.5" /> : <Link2 className="h-4.5 w-4.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{doc.title}</p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="shrink-0 text-muted-foreground hover:text-danger disabled:opacity-50"
            aria-label={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {doc.description && <p className="mt-0.5 text-xs text-muted-foreground">{doc.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={doc.isFile ? "brand" : "neutral"}>{doc.isFile ? t("fileBadge") : t("linkBadge")}</Badge>
          {doc.isFile && doc.fileSize ? <span className="text-[11px] text-muted-foreground">{formatBytes(doc.fileSize)}</span> : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {doc.uploadedByName ? t("uploadedBy", { name: doc.uploadedByName }) : ""}
            {doc.uploadedByName ? " · " : ""}
            {t("uploadedAt", { date: formatDate(doc.createdAt) })}
          </p>
          {doc.isFile ? (
            <a
              href={`/api/kb/${doc.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Download className="h-3.5 w-3.5" />
              {t("download")}
            </a>
          ) : (
            <a
              href={doc.linkUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("openLink")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function KbDocumentForm({ categories, onDone }: { categories: KbCategory[]; onDone: () => void }) {
  const t = useTranslations("kb.form");
  const [source, setSource] = useState<"file" | "link">("file");
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const [state, formAction, pending] = useActionState<KbActionState, FormData>(createKbDocument, {});

  // Đóng + reset form khi transition pending→idle mà thành công — không đọc `state` trong closure của
  // `action` (stale vì đóng gói lúc render trước, sẽ luôn là kết quả của lần submit TRƯỚC đó).
  useEffect(() => {
    if (wasPending.current && !pending && state.success) {
      formRef.current?.reset();
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface-2 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <button type="button" onClick={onDone} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("docTitle")}</label>
          <input
            name="title"
            required
            placeholder={t("docTitlePlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("category")}</label>
          <select
            name="categoryId"
            required
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("description")}</label>
        <input
          name="description"
          placeholder={t("descriptionPlaceholder")}
          className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("sourceType")}</label>
        <div className="mb-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setSource("file")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${source === "file" ? "bg-brand-600 text-white" : "bg-surface text-muted-foreground border border-border-strong"}`}
          >
            {t("sourceFile")}
          </button>
          <button
            type="button"
            onClick={() => setSource("link")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${source === "link" ? "bg-brand-600 text-white" : "bg-surface text-muted-foreground border border-border-strong"}`}
          >
            {t("sourceLink")}
          </button>
        </div>
        {source === "file" ? (
          <input
            key="file-input"
            type="file"
            name="file"
            title={t("filePlaceholder")}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-brand-600"
          />
        ) : (
          <input
            key="link-input"
            name="linkUrl"
            placeholder={t("linkPlaceholder")}
            className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        )}
      </div>

      {state.error && <p className="text-xs text-danger">{state.error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t("submit")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
