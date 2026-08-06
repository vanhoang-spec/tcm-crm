import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, pickLabel, toNum } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RECRUIT_CRITERIA_SET } from "@/lib/recruit";
import type { Locale } from "@/i18n/locales";
import { getRecruitPerms, gateCandidate } from "../../access";
import { CandidateForm } from "./candidate-form";
import { InterviewPanel } from "./interview-panel";
import { DecisionForm } from "./decision-form";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  NEW: "warning",
  INTERVIEWING: "neutral",
  HIRED: "success",
  REJECTED: "danger",
};

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perms = await getRecruitPerms();
  if (!perms.meId) redirect("/login");

  const gate = await gateCandidate(id, perms);
  if (!gate) notFound();
  if (!gate.canOpen) redirect("/no-access");

  const [t, locale] = await Promise.all([getTranslations("recruit"), getLocale() as Promise<Locale>]);

  // ⚠ GATE Ở TẦNG TRUY VẤN: `expectedSalary` chỉ được select khi người xem đủ điều kiện. Ẩn ở JSX
  // là con số vẫn nằm nguyên trong HTML thô — bài học KB-H2 (HANDOVER 10.13).
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      dob: true,
      phone: true,
      email: true,
      summaryWork: true,
      summarySkills: true,
      summaryOther: true,
      status: true,
      aiParsedAt: true,
      decisionNote: true,
      decidedAt: true,
      cvFileName: true,
      createdAt: true,
      ...(gate.canSeeSalary ? { expectedSalary: true } : {}),
      decidedBy: { select: { fullName: true } },
      position: {
        select: {
          id: true,
          title: true,
          department: { select: { name: true } },
          team: { select: { code: true } },
          hiringManager: { select: { fullName: true } },
          jdSummary: true,
          jdResponsibilities: true,
          jdRequirements: true,
          jdBenefits: true,
        },
      },
      interviews: {
        orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
        select: {
          id: true,
          round: true,
          scheduledAt: true,
          durationMin: true,
          location: true,
          status: true,
          declineReason: true,
          recommendation: true,
          strengths: true,
          concerns: true,
          note: true,
          interviewerStaffId: true,
          interviewer: { select: { fullName: true } },
          scores: { select: { criterionCode: true, score: true, note: true } },
        },
      },
    },
  });
  if (!candidate) notFound();

  const [criteriaSet, staff] = await Promise.all([
    prisma.optionSet.findUnique({
      where: { code: RECRUIT_CRITERIA_SET },
      select: { items: { where: { isActive: true }, orderBy: { sort: "asc" }, select: { code: true, labelVi: true, labelEn: true } } },
    }),
    // Danh sách người có thể phỏng vấn — chỉ nạp khi có quyền đặt lịch, tránh gửi danh bạ nhân sự
    // xuống trình duyệt của người chỉ vào xem hồ sơ.
    perms.canInterview
      ? prisma.staff.findMany({
          where: { isActive: true },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const criteria = (criteriaSet?.items ?? []).map((i) => ({ code: i.code, label: pickLabel(i, locale) }));
  const pos = candidate.position;
  const jdBlocks = [
    { key: "jdSummary" as const, text: pos.jdSummary },
    { key: "jdResponsibilities" as const, text: pos.jdResponsibilities },
    { key: "jdRequirements" as const, text: pos.jdRequirements },
    { key: "jdBenefits" as const, text: pos.jdBenefits },
  ].filter((b) => b.text);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/staff/recruit" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("backToList")}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
            {candidate.fullName}
            <Badge tone={STATUS_TONE[candidate.status] ?? "neutral"}>{t(`status${candidate.status}`)}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {pos.title}
            {" · "}
            {[pos.department?.name, pos.team?.code, pos.hiringManager?.fullName].filter(Boolean).join(" · ") || t("noAnchor")}
          </p>
        </div>
        <a
          href={`/api/recruit-cv/${candidate.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
        >
          <FileText className="h-3.5 w-3.5" />
          {t("openCv")}
          <span className="font-normal text-muted-foreground">({candidate.cvFileName})</span>
        </a>
      </div>

      <CandidateForm
        candidate={{
          id: candidate.id,
          fullName: candidate.fullName,
          dob: candidate.dob ? candidate.dob.toISOString().slice(0, 10) : "",
          phone: candidate.phone ?? "",
          email: candidate.email ?? "",
          summaryWork: candidate.summaryWork ?? "",
          summarySkills: candidate.summarySkills ?? "",
          summaryOther: candidate.summaryOther ?? "",
          expectedSalary: gate.canSeeSalary ? toNum(candidate.expectedSalary ?? null) : null,
        }}
        canEdit={perms.canManage}
        canSeeSalary={gate.canSeeSalary}
        canAiParse={perms.canAiParse}
        aiParsedAt={candidate.aiParsedAt ? formatDate(candidate.aiParsedAt) : null}
      />

      {jdBlocks.length > 0 && (
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">{t("jdTitle")}</summary>
          <div className="mt-3 space-y-3">
            {jdBlocks.map((b) => (
              <div key={b.key}>
                <p className="text-xs font-medium text-muted-foreground">{t(b.key)}</p>
                {/* Văn bản thuần, xuống dòng giữ nguyên — repo cố ý không có bộ render markdown. */}
                <p className="whitespace-pre-wrap text-sm text-foreground">{b.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <InterviewPanel
        candidateId={candidate.id}
        meId={perms.meId}
        canSchedule={perms.canInterview && candidate.status !== "HIRED" && candidate.status !== "REJECTED"}
        criteria={criteria}
        staff={staff.map((s) => ({ id: s.id, label: s.title ? `${s.fullName} — ${s.title}` : s.fullName }))}
        interviews={candidate.interviews.map((i) => ({
          id: i.id,
          round: i.round,
          scheduledAtIso: i.scheduledAt.toISOString(),
          durationMin: i.durationMin,
          location: i.location ?? "",
          status: i.status,
          declineReason: i.declineReason ?? "",
          recommendation: i.recommendation ?? "",
          strengths: i.strengths ?? "",
          concerns: i.concerns ?? "",
          note: i.note ?? "",
          interviewerStaffId: i.interviewerStaffId,
          interviewerName: i.interviewer.fullName,
          scores: i.scores.map((s) => ({ criterionCode: s.criterionCode, score: s.score, note: s.note ?? "" })),
        }))}
      />

      {perms.canDecide && (
        <DecisionForm
          candidateId={candidate.id}
          status={candidate.status}
          decisionNote={candidate.decisionNote ?? ""}
          decidedBy={candidate.decidedBy?.fullName ?? null}
          decidedAt={candidate.decidedAt ? formatDate(candidate.decidedAt) : null}
        />
      )}
    </div>
  );
}
