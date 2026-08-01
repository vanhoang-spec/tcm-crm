import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { isWebSearchConfigured } from "@/lib/ai/websearch";
import { requirePermission } from "@/lib/permissions";

/**
 * Trang trạng thái trợ lý AI.
 *
 * KHÔNG cho nhập/sửa API key qua giao diện — key nằm trong .env trên máy chủ. Lý do: nếu lưu key
 * vào DB rồi hiện lên form, bất kỳ ai vào được Settings đều đọc/đổi được khoá tính tiền, trong khi
 * app chưa có phân quyền thật. Đổi key = sửa .env + khởi động lại CRM.
 */
/** Thẻ <code> cho các bước cấu hình — next-intl rich text, giữ tên file/biến bên trong chuỗi dịch. */
const code = (chunks: React.ReactNode) => <code className="rounded bg-surface-2 px-1">{chunks}</code>;

export default async function SettingsAiPage() {
  await requirePermission("settings.ai.manage");
  const [t, tIdx, tAi] = await Promise.all([
    getTranslations("ai"),
    getTranslations("settings.index"),
    getTranslations("settings.ai"),
  ]);
  const configured = isAiConfigured();
  const searchOn = isWebSearchConfigured();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{tIdx("aiTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tIdx("aiDesc")}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          {configured ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <XCircle className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {configured ? tAi("deepseekOn") : tAi("deepseekOff")}
          </span>
        </div>

        {!configured && <p className="mt-3 text-sm text-muted-foreground">{t("notConfiguredBanner")}</p>}

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          {searchOn ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">
            {searchOn ? tAi("tavilyOn") : tAi("tavilyOff")}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{searchOn ? tAi("tavilyOnHint") : tAi("tavilyOffHint")}</p>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-foreground">{tAi("howTo")}</p>
          <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>{tAi("step1")}</li>
            <li>{tAi.rich("step2", { code })}</li>
            <li>{tAi.rich("step3", { code })}</li>
            <li>{tAi.rich("step4", { code })}</li>
            <li>{tAi.rich("step5", { code })}</li>
          </ol>
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
            {tAi("keyWarning")}
          </p>
        </div>
      </div>
    </div>
  );
}
