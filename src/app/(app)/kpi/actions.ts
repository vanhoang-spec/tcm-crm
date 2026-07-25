"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getKpiReport } from "@/lib/kpi";

export type KpiActionState = { error?: string; success?: boolean };

function revalidateKpi() {
  revalidatePath("/kpi");
}

async function audit(entityId: string, field: string, oldValue: string | null, newValue: string, staffId: string | null) {
  await prisma.auditLog.create({
    data: { entityType: "kpi_period", entityId, field, oldValue, newValue, action: "UPDATE", changedBy: staffId },
  });
}

/**
 * Lưu điểm 1 pool × 1 kỳ — bulk matrix `score_<staffId>_<criterionId>`.
 * Ô rỗng → xóa dòng điểm (cho phép gỡ nhầm); ô số → upsert. Kỳ CLOSED → từ chối.
 */
export async function saveKpiScores(poolKey: string, periodCode: string, _prev: KpiActionState, formData: FormData): Promise<KpiActionState> {
  const [t, tSet] = await Promise.all([getTranslations("kpi"), getTranslations("settings.kpi")]);
  const existing = await prisma.kpiPeriod.findUnique({ where: { periodCode_poolKey: { periodCode, poolKey } } });
  if (existing?.status === "CLOSED") return { error: t("periodClosed") };

  const staffId = await getCurrentStaffId();
  const ops: { staffId: string; criterionId: string; score: number | null }[] = [];
  for (const [key, raw] of formData.entries()) {
    const m = /^score_([^_]+)_(.+)$/.exec(key);
    if (!m) continue;
    const val = String(raw).trim();
    if (val === "") {
      ops.push({ staffId: m[1], criterionId: m[2], score: null });
      continue;
    }
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return { error: tSet("errorInvalid") };
    ops.push({ staffId: m[1], criterionId: m[2], score: n });
  }

  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      if (op.score == null) {
        await tx.kpiScore.deleteMany({ where: { criterionId: op.criterionId, staffId: op.staffId, periodCode } });
      } else {
        await tx.kpiScore.upsert({
          where: { criterionId_staffId_periodCode: { criterionId: op.criterionId, staffId: op.staffId, periodCode } },
          update: { score: op.score, scoredById: staffId },
          create: { criterionId: op.criterionId, staffId: op.staffId, periodCode, score: op.score, scoredById: staffId },
        });
      }
    }
  });

  revalidateKpi();
  return { success: true };
}

/**
 * Chốt kỳ: tính report live, CHẶN nếu còn cảnh báo blocking (NV chưa chấm điểm), rồi snapshot
 * từng pool vào KpiPeriod (CLOSED + resultJson) — số đã chốt đóng băng vĩnh viễn.
 */
export async function closeKpiPeriod(periodCode: string, _prev: KpiActionState, _formData: FormData): Promise<KpiActionState> {
  const t = await getTranslations("kpi");
  const data = await getKpiReport(periodCode);
  if (!data) return { error: t("closeBlocked") };

  const openPools = data.report.pools.filter((p) => data.statusMap[p.poolKey]?.status !== "CLOSED");
  if (openPools.some((p) => p.blocking)) return { error: t("closeBlocked") };

  const staffId = await getCurrentStaffId();
  const now = new Date();
  for (const pool of openPools) {
    await prisma.kpiPeriod.upsert({
      where: { periodCode_poolKey: { periodCode, poolKey: pool.poolKey } },
      update: {
        status: "CLOSED",
        teamFactor: pool.teamFactor,
        poolAmount: BigInt(pool.poolAmount),
        marginWeighted: pool.marginWeighted,
        resultJson: JSON.stringify(pool),
        closedAt: now,
        closedById: staffId,
      },
      create: {
        periodCode,
        poolKey: pool.poolKey,
        status: "CLOSED",
        teamFactor: pool.teamFactor,
        poolAmount: BigInt(pool.poolAmount),
        marginWeighted: pool.marginWeighted,
        resultJson: JSON.stringify(pool),
        closedAt: now,
        closedById: staffId,
      },
    });
    await audit(`${periodCode}|${pool.poolKey}`, "status", "OPEN", "CLOSED", staffId);
  }
  revalidateKpi();
  return { success: true };
}

/** Mở lại kỳ (đã chốt nhầm) — xóa snapshot, tính live trở lại. Có audit. */
export async function reopenKpiPeriod(periodCode: string): Promise<void> {
  const staffId = await getCurrentStaffId();
  const rows = await prisma.kpiPeriod.findMany({ where: { periodCode, status: "CLOSED" } });
  for (const row of rows) {
    await prisma.kpiPeriod.update({
      where: { id: row.id },
      data: { status: "OPEN", resultJson: null, closedAt: null, closedById: null },
    });
    await audit(`${periodCode}|${row.poolKey}`, "status", "CLOSED", "OPEN", staffId);
  }
  revalidateKpi();
}
