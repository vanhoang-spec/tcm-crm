import { ShieldOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/(auth)/actions";

/**
 * Điểm dừng an toàn cho tài khoản chưa có quyền vào bất kỳ trang nào (vd vừa tạo, chưa gán nhóm
 * quyền). CỐ Ý KHÔNG gọi requirePermission — đây chính là đích redirect của nó, gác ở đây sẽ tạo
 * lại đúng vòng lặp mà trang này sinh ra để phá.
 */
export default async function NoAccessPage() {
  const t = await getTranslations("noAccess");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <ShieldOff className="h-7 w-7" />
      </span>
      <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="h-11 rounded-lg border border-border-strong px-5 text-sm font-medium text-foreground hover:bg-surface-2 sm:h-9"
        >
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
