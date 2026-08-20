import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { GroupCreateForm, GroupCard, type GroupRow } from "./group-forms";

/**
 * PUR-3b — NHÓM HÀNG RFQ khai trong app. Gác `settings.vendors.manage` (BGĐ + Trưởng phòng Thu mua),
 * KHÔNG mã quyền mới: đây là danh mục cấu hình của chính người quản lý hồ sơ NCC.
 *
 * ⚠ Đếm NCC / RFQ đang trỏ vào từng nhóm ngay tại đây — người sắp tắt một nhóm phải nhìn thấy nó
 * đang gánh bao nhiêu dữ liệu trước khi bấm. Không có đường XOÁ nhóm (mã nhóm là khoá dữ liệu).
 */
export default async function SettingsRfqGroupsPage() {
  await requirePermission("settings.vendors.manage");
  const [t, groups, vendorCounts, rfqCounts] = await Promise.all([
    getTranslations("settings.rfqGroups"),
    prisma.rfqGroup.findMany({
      orderBy: [{ sort: "asc" }, { labelVi: "asc" }],
      include: { fields: { orderBy: [{ kind: "asc" }, { sort: "asc" }] } },
    }),
    prisma.vendorGroup.groupBy({ by: ["groupCode"], _count: true }),
    prisma.rfq.groupBy({ by: ["groupCode"], _count: true }),
  ]);

  const vc = new Map(vendorCounts.map((x) => [x.groupCode, x._count]));
  const rc = new Map(rfqCounts.map((x) => [x.groupCode, x._count]));
  const rows: GroupRow[] = groups.map((g) => ({
    id: g.id,
    code: g.code,
    labelVi: g.labelVi,
    labelEn: g.labelEn,
    descVi: g.descVi,
    descEn: g.descEn,
    keywords: g.keywords,
    unitPriceLabelVi: g.unitPriceLabelVi,
    unitPriceLabelEn: g.unitPriceLabelEn,
    isSystem: g.isSystem,
    isActive: g.isActive,
    sort: g.sort,
    vendorCount: vc.get(g.code) ?? 0,
    rfqCount: rc.get(g.code) ?? 0,
    fields: g.fields.map((f) => ({
      id: f.id,
      kind: f.kind,
      key: f.key,
      labelVi: f.labelVi,
      labelEn: f.labelEn,
      type: f.type,
      isAmountFactor: f.isAmountFactor,
      isActive: f.isActive,
      sort: f.sort,
    })),
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSettings")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
        <p className="mt-2 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">{t("note")}</p>
      </div>

      <GroupCreateForm />

      <div className="space-y-2">
        {rows.map((g) => (
          <GroupCard key={g.id} g={g} />
        ))}
      </div>
    </div>
  );
}
