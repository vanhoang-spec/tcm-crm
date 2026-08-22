import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EMAIL_TEMPLATES } from "@/lib/recruit-email";
import { loadEmailTemplate } from "@/lib/recruit-email-server";
import { isResendConfigured } from "@/lib/resend";
import { PositionEditor, type Option } from "./position-editor";
import { JdTemplates } from "./jd-templates";
import { PositionStatusForm } from "./position-status-form";
import { EmailTemplates, type EmailTemplateView } from "./email-templates";

const TONE: Record<string, "success" | "warning" | "neutral"> = {
  OPEN: "success",
  PAUSED: "warning",
  CLOSED: "neutral",
};

/**
 * Quản trị VỊ TRÍ TUYỂN DỤNG + JD + MẪU JD.
 *
 * Để ở Settings theo đúng yêu cầu "gắn sát org chart, cho phép điều chỉnh theo thời gian": vị trí
 * neo vào phòng ban / team / người quản lý trực tiếp, và cơ cấu đó đổi thì sửa ở đây. Tab Tuyển
 * dụng bên Nhân sự là nơi LÀM VIỆC hằng ngày (nhận CV, phỏng vấn), không phải nơi định nghĩa.
 */
export default async function RecruitSettingsPage() {
  await requirePermission("recruit.jd.manage");
  const t = await getTranslations("settings.recruit");

  const [positions, departments, teams, staff, templates] = await Promise.all([
    prisma.jobPosition.findMany({
      orderBy: [{ status: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        status: true,
        departmentId: true,
        teamId: true,
        hiringManagerStaffId: true,
        jdSummary: true,
        jdResponsibilities: true,
        jdRequirements: true,
        jdBenefits: true,
        jdUpdatedAt: true,
        department: { select: { name: true } },
        team: { select: { code: true } },
        hiringManager: { select: { fullName: true } },
        _count: { select: { candidates: true } },
      },
    }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, title: true },
    }),
    prisma.jdTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  const departmentOptions: Option[] = departments.map((d) => ({ id: d.id, label: d.name }));
  const teamOptions: Option[] = teams.map((x) => ({ id: x.id, label: `${x.code} — ${x.name}` }));
  const staffOptions: Option[] = staff.map((s) => ({
    id: s.id,
    label: s.title ? `${s.fullName} — ${s.title}` : s.fullName,
  }));
  const templateData = templates.map((x) => ({
    id: x.id,
    name: x.name,
    jdSummary: x.jdSummary ?? "",
    jdResponsibilities: x.jdResponsibilities ?? "",
    jdRequirements: x.jdRequirements ?? "",
    jdBenefits: x.jdBenefits ?? "",
  }));

  // Mẫu thư (TD-2b) — đọc song song, mỗi mẫu rơi về bản mặc định trong code khi DB chưa có dòng.
  const emailTemplates: EmailTemplateView[] = (
    await Promise.all(EMAIL_TEMPLATES.map((d) => loadEmailTemplate(d.code)))
  ).flatMap((tpl) => {
    if (!tpl) return [];
    return [
      {
        code: tpl.def.code,
        label: tpl.def.labelVi,
        audience: tpl.def.audience,
        vars: tpl.def.vars,
        subject: tpl.subject,
        body: tpl.body,
        approvedAt: tpl.approvedAt ? formatDate(tpl.approvedAt) : null,
        approvedByName: null,
      },
    ];
  });

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="space-y-2">
        {positions.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {positions.map((p) => (
          <details key={p.id} className="rounded-xl border border-border bg-surface p-4">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span>{p.title}</span>
              <Badge tone={TONE[p.status] ?? "neutral"}>{t(`status${p.status}`)}</Badge>
              <span className="text-xs font-normal text-muted-foreground">
                {[p.department?.name, p.team?.code, p.hiringManager?.fullName].filter(Boolean).join(" · ") || t("noAnchor")}
              </span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {t("candidateCount", { n: p._count.candidates })}
                {p.jdUpdatedAt ? ` · ${t("jdUpdatedAt", { date: formatDate(p.jdUpdatedAt) })}` : ` · ${t("noJd")}`}
              </span>
            </summary>
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <PositionEditor
                position={{
                  id: p.id,
                  title: p.title,
                  departmentId: p.departmentId ?? "",
                  teamId: p.teamId ?? "",
                  hiringManagerStaffId: p.hiringManagerStaffId ?? "",
                  jdSummary: p.jdSummary ?? "",
                  jdResponsibilities: p.jdResponsibilities ?? "",
                  jdRequirements: p.jdRequirements ?? "",
                  jdBenefits: p.jdBenefits ?? "",
                }}
                departments={departmentOptions}
                teams={teamOptions}
                staff={staffOptions}
                templates={templateData}
              />
              <PositionStatusForm positionId={p.id} status={p.status} />
            </div>
          </details>
        ))}
      </section>

      <details className="rounded-xl border border-dashed border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">{t("newPosition")}</summary>
        <div className="mt-3">
          <PositionEditor
            position={null}
            departments={departmentOptions}
            teams={teamOptions}
            staff={staffOptions}
            templates={templateData}
          />
        </div>
      </details>

      <EmailTemplates templates={emailTemplates} resendConfigured={isResendConfigured()} />

      <JdTemplates templates={templateData} />
    </div>
  );
}
