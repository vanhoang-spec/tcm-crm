import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EXECUTION_STATUS_CODES } from "@/lib/projects";
import { toNum } from "@/lib/utils";
import { suggestRfqTemplate } from "@/lib/rfq-templates";
import type { Locale } from "@/i18n/locales";
import { RfqNewForm, type NewRfqLine, type NewRfqVendor } from "./rfq-new-form";

/**
 * Tạo RFQ (PUR-1): chọn dự án → tick dòng CO đủ điều kiện (QTY_PRICE/FIXED, không % , không dòng kho)
 * → mẫu (gợi ý từ tên dòng) → NCC (lọc theo nhóm mẫu). Gác `purchasing.rfq.manage`. Số CO đưa xuống là
 * đơn giá TRƯỚC THUẾ — PUR có view_paycap nên được thấy (HANDOVER 10.26).
 */
export default async function RfqNewPage({ searchParams }: { searchParams: Promise<{ project?: string; task?: string }> }) {
  await requirePermission("purchasing.rfq.manage");
  const { project: projectParam, task: taskParam } = await searchParams;
  const [t, locale, projects, vendors] = await Promise.all([
    getTranslations("purchasing.rfq"),
    getLocale() as Promise<Locale>,
    prisma.project.findMany({
      where: { status: { code: { in: [...EXECUTION_STATUS_CODES, "BIDDING", "PENDING"] } } },
      select: { id: true, code: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, groups: { select: { groupCode: true } } } }),
  ]);
  const projectId = projectParam && projects.some((p) => p.id === projectParam) ? projectParam : null;

  const lines: NewRfqLine[] = [];
  let taskId: string | null = null;
  let taskTitle: string | null = null;
  if (projectId) {
    const sheet = await prisma.costSheet.findFirst({
      where: { projectId, version: "CTRACT" },
      orderBy: { createdAt: "desc" },
      select: {
        sections: {
          orderBy: { sort: "asc" },
          select: { id: true, code: true, nameVi: true, isProxy: true, parentSectionId: true, lines: { orderBy: { sort: "asc" } } },
        },
      },
    });
    if (sheet) {
      for (const s of sheet.sections) {
        for (const l of s.lines) {
          if (!l.stableKey || l.lineType === "PERCENT_OF_TOTAL" || l.stockResvLineId) continue;
          const ref = l.lineType === "FIXED" ? Math.round(toNum(l.fixedAmount ?? BigInt(0)) / (l.quantity || 1)) : toNum(l.unitPrice);
          lines.push({ stableKey: l.stableKey, sectionCode: s.code, sectionName: s.nameVi, itemName: l.itemName, specs: l.specs, unit: l.unit, quantity: l.quantity, refUnitPrice: ref, isProxy: s.isProxy });
        }
      }
    }
    if (taskParam) {
      const task = await prisma.departmentTask.findFirst({ where: { id: taskParam, projectId, department: "PCC" }, select: { id: true, title: true } });
      if (task) {
        taskId = task.id;
        taskTitle = task.title;
      }
    }
  }
  const suggested = lines.length ? suggestRfqTemplate(lines.map((l) => l.itemName)) : null;
  const vendorOpts: NewRfqVendor[] = vendors.map((v) => ({ id: v.id, name: v.name, code: v.code, groupCodes: v.groups.map((g) => g.groupCode) }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/purchasing" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("backToList")}
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">{t("newTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("newDesc")}</p>
      </div>

      <form method="get" className="flex items-end gap-2">
        {taskId && <input type="hidden" name="task" value={taskId} />}
        <SearchableSelect name="project" defaultValue={projectId ?? ""} placeholder={t("pickProject")} className="w-80" options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
        <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium hover:bg-surface-2">
          OK
        </button>
      </form>

      {!projectId ? (
        <p className="text-sm text-muted-foreground">{t("pickProjectHint")}</p>
      ) : lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">{t("noCostLines")}</p>
      ) : (
        <RfqNewForm projectId={projectId} taskId={taskId} taskTitle={taskTitle} lines={lines} vendors={vendorOpts} suggestedTemplate={suggested} locale={locale} />
      )}
    </div>
  );
}
