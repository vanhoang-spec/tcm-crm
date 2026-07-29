"use client";

import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { DeleteSourceButton, useSourceKindLabel } from "./manage-panels";

export type SourceRow = {
  id: string;
  kind: string;
  fileName: string;
  fileSize: number;
  note: string | null;
  uploadedByName: string | null;
  /** Đã định dạng ở server — 3 file cùng tên "Brief AEON Tet" thì ngày là thứ duy nhất phân biệt. */
  uploadedAt: string;
};

/** KB dùng nhãn loại tài liệu ở cả danh sách lẫn form upload — gom vào client component để dùng chung 1 map nhãn. */
export function SourceList({ clientId, sources, canManage }: { clientId: string; sources: SourceRow[]; canManage: boolean }) {
  const t = useTranslations("clients.kb");
  const label = useSourceKindLabel();

  if (sources.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{t("sourcesEmpty")}</p>;

  return (
    <ul className="mt-3 divide-y divide-border">
      {sources.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <a
              href={`/api/client-kb/${s.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-brand-600"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{s.fileName}</span>
            </a>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {label(s.kind)} · {(s.fileSize / 1024 / 1024).toFixed(2)} MB · {s.uploadedAt}
              {s.uploadedByName ? ` · ${s.uploadedByName}` : ""}
              {s.note ? ` · ${s.note}` : ""}
            </p>
          </div>
          {canManage && <DeleteSourceButton clientId={clientId} sourceId={s.id} />}
        </li>
      ))}
    </ul>
  );
}
