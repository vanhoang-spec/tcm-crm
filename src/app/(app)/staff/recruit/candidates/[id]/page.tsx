import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, FileText, Link2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, pickLabel, toNum } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { loadCriteria } from "@/lib/recruit-score-server";
import { scopeForPosition } from "@/lib/recruit-scoring";
import type { Locale } from "@/i18n/locales";
import { EMAIL_TEMPLATES, isOfferStageTemplate } from "@/lib/recruit-email";
import { loadEmailLog, loadEmailTemplate } from "@/lib/recruit-email-server";
import { loadOffer } from "@/lib/recruit-offer-server";
import { probationWarning } from "@/lib/recruit-offer";
import { getRecruitPerms, gateCandidate } from "../../access";
import { EmailPanel } from "./email-panel";
import { OfferPanel } from "./offer-panel";
import { DeleteCandidateForm } from "./delete-candidate-form";
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
      cvUrl: true,
      createdAt: true,
      ...(gate.canSeeSalary ? { expectedSalary: true } : {}),
      decidedBy: { select: { fullName: true } },
      position: {
        select: {
          isManagerial: true,
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
      aiReviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { totalScore: true, maxScore: true, recommendation: true, summary: true, concerns: true },
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
          scoredAt: true,
          totalScore: true,
          maxScore: true,
          interviewer: { select: { fullName: true } },
          scores: { select: { criterionCode: true, score: true, note: true } },
        },
      },
    },
  });
  if (!candidate) notFound();

  // Thư (TD-2b): chỉ liệt kê mẫu ĐÃ DUYỆT — mẫu chưa duyệt bấm vào cũng bị server chặn, đưa vào ô
  // chọn chỉ để người dùng bấm rồi nhận lỗi là thiết kế tồi.
  // ⚠ Offer chứa LƯƠNG — chỉ nạp khi người xem có `recruit.offer.manage` (từ 24/08/2026 là mã
  // riêng, chỉ Senior HR Manager). Không nạp thì không có đường nào lọt vào HTML (bài học gate ở
  // TẦNG TRUY VẤN, HANDOVER 10.13).
  const [emailLogs, emailTpls, offerRaw] = await Promise.all([
    loadEmailLog(id),
    Promise.all(EMAIL_TEMPLATES.map((d) => loadEmailTemplate(d.code))),
    perms.canOffer ? loadOffer(id, perms.meId) : Promise.resolve(null),
  ]);
  const offerView = offerRaw ? { ...offerRaw, probationBelowLegal: probationWarning(offerRaw.probationPct) } : null;
  // ⚠ Đọc ĐỘC LẬP với offerView: người có quyền XOÁ (recruit.manage) chưa chắc có recruit.decide,
  // mà offerView chỉ được nạp khi có recruit.decide — dựa vào nó là HR_STAFF luôn thấy "không có
  // offer" và nút xoá mở ra oan. Chỉ đếm, không đọc số liệu lương.
  const offerExists = (await prisma.candidateOffer.count({ where: { candidateId: id } })) > 0;
  // ⚠ Ô chọn mẫu thư CHỈ liệt kê mẫu người này gửi được: hai mẫu khâu OFFER đòi `recruit.offer.manage`.
  // Để chúng trong danh sách rồi để người dùng bấm và nhận lỗi là thiết kế tồi — và bản xem trước
  // của thư OFFER có MỨC LƯƠNG, nên đây cũng là một lớp chặn chứ không chỉ là dọn giao diện.
  const emailChoices = emailTpls.flatMap((tpl) =>
    tpl && tpl.approvedAt && (perms.canOffer || !isOfferStageTemplate(tpl.def.code))
      ? [{ code: tpl.def.code, label: tpl.def.labelVi, audience: tpl.def.audience }]
      : [],
  );

  // TD-2c: bộ tiêu chí PHỎNG VẤN có trọng số, chọn theo cờ quản lý của vị trí.
  const [interviewCriteria, staff] = await Promise.all([
    loadCriteria("INTERVIEW", scopeForPosition(candidate.position.isManagerial)),
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

  const criteria = interviewCriteria.map((c) => ({
    code: c.code,
    label: pickLabel({ labelVi: c.label, labelEn: c.labelEn }, locale),
    weight: c.weight,
    hint: c.hint,
  }));

  // TỰ ĐIỀN cho phiếu chấm (TD-2c). ⚠ KHÔNG đưa lương mong muốn vào đây: ô đó có cổng riêng theo
  // bản ghi (canSeeExpectedSalary), còn khối này hiện cho MỌI người phỏng vấn được phân công.
  const latestAi = candidate.aiReviews[0] ?? null;
  const interviewContext = {
    fullName: candidate.fullName,
    dob: candidate.dob ? formatDate(candidate.dob) : null,
    positionTitle: candidate.position.title,
    isManagerial: candidate.position.isManagerial,
    summaryWork: candidate.summaryWork ?? "",
    summarySkills: candidate.summarySkills ?? "",
    summaryOther: candidate.summaryOther ?? "",
    aiReview: latestAi
      ? {
          totalScore: latestAi.totalScore,
          maxScore: latestAi.maxScore,
          recommendation: latestAi.recommendation,
          summary: latestAi.summary,
          concerns: latestAi.concerns,
        }
      : null,
  };

  // Vòng ĐÃ CHẤM — vòng sau nhìn thấy vòng trước.
  const priorRounds = candidate.interviews
    .filter((i) => i.scoredAt)
    .sort((a, b) => a.round - b.round)
    .map((i) => ({
      round: i.round,
      interviewerName: i.interviewer.fullName,
      recommendation: i.recommendation,
      totalScore: i.totalScore,
      maxScore: i.maxScore,
      strengths: i.strengths ?? "",
      concerns: i.concerns ?? "",
      scoredAt: i.scoredAt ? formatDate(i.scoredAt) : null,
    }));
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
        {/* Link portfolio ứng viên gửi. `rel` phải có `noopener noreferrer` — trang đích là web
            NGOÀI, mở bằng target=_blank mà thiếu noopener là trang đó điều khiển được tab gốc. */}
        {candidate.cvUrl && (
          <a
            href={candidate.cvUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-semibold text-foreground hover:bg-surface-2"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("openCvUrl")}</span>
          </a>
        )}
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

      <OfferPanel candidateId={candidate.id} offer={offerView} canOffer={perms.canOffer} />

      <EmailPanel candidateId={candidate.id} choices={emailChoices} logs={emailLogs} canSend={perms.canEmail} />

      <InterviewPanel
        candidateId={candidate.id}
        meId={perms.meId}
        context={interviewContext}
        priorRounds={priorRounds}
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

      {/* Xoá vĩnh viễn — chỉ HR (recruit.manage); ADMIN qua được nhờ sàn cứng trong code.
          Chốt chặn tính Ở SERVER, hai cờ dưới đây chỉ để giải thích cho người dùng vì sao khoá. */}
      {perms.canManage && (
        <DeleteCandidateForm
          candidateId={candidate.id}
          fullName={candidate.fullName}
          blocked={candidate.interviews.length > 0 ? "HAS_INTERVIEWS" : offerExists ? "HAS_OFFER" : null}
        />
      )}
    </div>
  );
}
