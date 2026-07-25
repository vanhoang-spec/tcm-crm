import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ImportClientForm } from "./import-client-form";

export default async function ClientsImportPage() {
  const t = await getTranslations("clients.import");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ImportClientForm />

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("picReviewTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("picReviewDesc")}</p>
        {/* Native form POST thẳng vào route handler — cần trả file tải về, server action chỉ trả state. */}
        <form
          method="POST"
          action="/clients/import/review-pic-export"
          encType="multipart/form-data"
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            aria-label={t("fileLabel")}
            className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:font-medium sm:file:h-9"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-surface-2 sm:h-9"
          >
            {t("picReviewButton")}
          </button>
        </form>
      </div>
    </div>
  );
}
