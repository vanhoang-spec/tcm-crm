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
export default async function SettingsAiPage() {
  await requirePermission("settings.ai.manage");
  const [t, tIdx] = await Promise.all([getTranslations("ai"), getTranslations("settings.index")]);
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
            {configured ? "DeepSeek: đã kết nối" : "DeepSeek: chưa cấu hình"}
          </span>
        </div>

        {!configured && <p className="mt-3 text-sm text-muted-foreground">{t("notConfiguredBanner")}</p>}

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          {searchOn ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">
            {searchOn ? "Tìm kiếm web (Tavily): đã bật" : "Tìm kiếm web (Tavily): chưa cấu hình"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {searchOn
            ? "Mục “Xu hướng ngành” sẽ đọc nguồn thật trên internet rồi tổng hợp, kèm link kiểm chứng."
            : "Chưa bật thì mục “Xu hướng ngành” chỉ trả lời bằng kiến thức chung của mô hình, KHÔNG có link kiểm chứng và không biết tin mới."}
        </p>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-foreground">Cách cấu hình</p>
          <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>1. Tạo khoá API tại platform.deepseek.com → API keys.</li>
            <li>2. Mở file <code className="rounded bg-surface-2 px-1">.env</code> trong thư mục CRM trên máy chủ.</li>
            <li>3. Thêm dòng <code className="rounded bg-surface-2 px-1">DEEPSEEK_API_KEY=&quot;sk-...&quot;</code></li>
            <li>
              4. (Tuỳ chọn) Đăng ký miễn phí tại tavily.com rồi thêm{" "}
              <code className="rounded bg-surface-2 px-1">TAVILY_API_KEY=&quot;tvly-...&quot;</code> để bật tìm kiếm web.
            </li>
            <li>5. Khởi động lại CRM (chạy lại <code className="rounded bg-surface-2 px-1">scripts\2-CHAY-CRM.bat</code>).</li>
          </ol>
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
            Khoá API tính tiền theo lượng sử dụng. Không chia sẻ khoá ra ngoài, không đưa vào ảnh chụp màn hình.
          </p>
        </div>
      </div>
    </div>
  );
}
