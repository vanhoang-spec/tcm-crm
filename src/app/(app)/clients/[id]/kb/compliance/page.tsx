import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/permissions";
import { loadCompliance, loadKbClient } from "@/lib/client-kb-data";

/**
 * BẢNG TUÂN THỦ — ai đã học xong kho kiến thức của khách này, ai chưa.
 *
 * Đây là CẢNH BÁO MỀM theo quyết định của chủ dự án: không chỗ nào trong app chặn thao tác vì
 * chưa học xong. Bảng để Account leader biết cần nhắc ai trước khi giao việc.
 *
 * Phạm vi người: mọi nhân sự đang làm việc. Chưa lọc theo "ai thực sự chạy dự án cho khách này"
 * vì việc phân công nhân sự theo dự án + ngày (task C2) chưa làm — card trên trang dự án mới là
 * chỗ thu hẹp đúng người.
 */
export default async function KbCompliancePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("clients.kb.compliance");
  const { id } = await params;

  const [t, loaded] = await Promise.all([getTranslations("clients.kb"), loadKbClient(id)]);
  if (!loaded) notFound();

  const staff = await prisma.staff.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, title: true, department: { select: { code: true } } },
  });

  const { topics, rows } = await loadCompliance(
    loaded.anchor,
    staff.map((s) => s.id),
  );
  const requiredTopics = topics.filter((x) => x.required);
  const byStaff = new Map(rows.map((r) => [r.staffId, r]));
  const passedCount = rows.filter((r) => r.status === "PASS").length;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href={`/clients/${id}/kb`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToKb")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("complianceTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("complianceHint")}</p>
      </div>

      {requiredTopics.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          {t("complianceNoRequired")}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("complianceSummary", { passed: passedCount, total: rows.length, topics: requiredTopics.length })}
          </p>

          <div className="overflow-x-auto overflow-y-auto rounded-xl border border-border bg-surface max-h-[70vh]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("colStaff")}</th>
                  <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
                  {requiredTopics.map((tp) => (
                    <th key={tp.topicId} className="px-3 py-2 font-medium">
                      {tp.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staff.map((s) => {
                  const row = byStaff.get(s.id);
                  const missing = new Set(row?.missingTopicIds ?? []);
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{s.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {[s.title, s.department?.code].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row?.status === "PASS" ? (
                          <Badge tone="success">{t("statusPass")}</Badge>
                        ) : (
                          <Badge tone="warning">
                            {t("statusPending", { passed: row?.passed ?? 0, required: row?.required ?? 0 })}
                          </Badge>
                        )}
                      </td>
                      {requiredTopics.map((tp) => (
                        <td key={tp.topicId} className="px-3 py-2 text-center">
                          {missing.has(tp.topicId) ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="font-semibold text-success">✓</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
