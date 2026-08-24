import "server-only";
import { prisma } from "@/lib/prisma";
import { getStringSetting } from "@/lib/settings";
import { formatDate, formatNumber, toNum } from "@/lib/utils";
import { renderTemplate } from "@/lib/recruit-email";
import { DEFAULT_OFFER_BODY, OFFER_DEFAULT_KEY, OFFER_VARS, offerBodyToBlocks, probationText } from "@/lib/recruit-offer";

/**
 * Dựng THƯ MỜI NHẬN VIỆC từ mẫu của phòng ban + số liệu trên offer (TD-2d).
 *
 * ⚠ Hàm KHÔNG gác quyền — người gọi gác (`recruit.offer.manage`).
 * ⚠ Có LƯƠNG: mọi đường đọc phải cân nhắc `canSeeExpectedSalary`-tương-đương. Trang gọi hàm này đã
 * gác bằng `recruit.offer.manage` (chỉ Senior HR Manager) nên số lương chỉ tới đúng vai đó.
 */

/** Mẫu của phòng ban, rơi về bản DEFAULT, rơi tiếp về bản mặc định trong code. */
export async function loadOfferTemplate(deptKey: string | null) {
  const keys = [deptKey, OFFER_DEFAULT_KEY].filter((k): k is string => !!k);
  const rows = await prisma.recruitOfferTemplate.findMany({ where: { deptKey: { in: keys } } });
  const exact = deptKey ? rows.find((r) => r.deptKey === deptKey) : undefined;
  const fallback = rows.find((r) => r.deptKey === OFFER_DEFAULT_KEY);
  const row = exact ?? fallback ?? null;
  return {
    deptKey: row?.deptKey ?? OFFER_DEFAULT_KEY,
    body: row?.body ?? DEFAULT_OFFER_BODY,
    approvedAt: row?.approvedAt ?? null,
    /** true = đang dùng mẫu chung vì phòng chưa khai riêng. Màn hình nói rõ để HR biết. */
    usingFallback: !exact,
    exists: !!row,
  };
}

export type OfferView = {
  status: string;
  salaryAmount: number | null;
  allowanceText: string;
  probationMonths: number | null;
  probationPct: number | null;
  startDate: string | null;
  startDateIso: string | null;
  extraTerms: string;
  sentAt: string | null;
  respondedAt: string | null;
  declineReason: string;
  firstWorkDate: string | null;
  firstWorkDateIso: string | null;
  onboardingNotifiedAt: string | null;
  /** Văn bản thư đã thay biến — dùng cho bản xem trước và bản .docx. */
  letter: string;
  letterTitle: string;
  templateApproved: boolean;
  usingFallbackTemplate: boolean;
  missingVars: string[];
};

/** Đọc offer của ứng viên + dựng sẵn văn bản thư. Chưa có offer thì trả null. */
export async function loadOffer(candidateId: string, viewerStaffId: string | null): Promise<OfferView | null> {
  const [offer, candidate, companyName, viewer] = await Promise.all([
    prisma.candidateOffer.findUnique({ where: { candidateId } }),
    prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { fullName: true, position: { select: { title: true, department: { select: { code: true, name: true } } } } },
    }),
    getStringSetting("company", "legal_name_vi", "Công ty Cổ phần Tiếp thị Tân Cường Minh"),
    viewerStaffId ? prisma.staff.findUnique({ where: { id: viewerStaffId }, select: { fullName: true } }) : Promise.resolve(null),
  ]);
  if (!offer || !candidate) return null;

  const tpl = await loadOfferTemplate(candidate.position.department?.code ?? null);
  const salary = toNum(offer.salaryAmount ?? null);
  const vars: Record<string, string> = {
    candidateName: candidate.fullName,
    positionTitle: candidate.position.title,
    departmentName: candidate.position.department?.name ?? "",
    companyName,
    hrName: viewer?.fullName ?? "",
    // ⚠ Tiền hiển thị theo chuẩn vi-VN chốt cứng của app (HANDOVER 10.19) — thư gửi ứng viên Việt Nam.
    salaryText: salary ? `${formatNumber(salary)} đ/tháng` : "",
    allowanceText: offer.allowanceText ?? "",
    probationText: probationText(offer.probationMonths, offer.probationPct),
    startDate: offer.startDate ? formatDate(offer.startDate) : "",
    extraTerms: offer.extraTerms ?? "",
  };
  const rendered = renderTemplate(tpl.body, vars, [...OFFER_VARS]);

  return {
    status: offer.status,
    salaryAmount: salary,
    allowanceText: offer.allowanceText ?? "",
    probationMonths: offer.probationMonths,
    probationPct: offer.probationPct,
    startDate: offer.startDate ? formatDate(offer.startDate) : null,
    startDateIso: offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null,
    extraTerms: offer.extraTerms ?? "",
    sentAt: offer.sentAt ? formatDate(offer.sentAt) : null,
    respondedAt: offer.respondedAt ? formatDate(offer.respondedAt) : null,
    declineReason: offer.declineReason ?? "",
    firstWorkDate: offer.firstWorkDate ? formatDate(offer.firstWorkDate) : null,
    firstWorkDateIso: offer.firstWorkDate ? offer.firstWorkDate.toISOString().slice(0, 10) : null,
    onboardingNotifiedAt: offer.onboardingNotifiedAt ? formatDate(offer.onboardingNotifiedAt) : null,
    letter: rendered.text,
    letterTitle: `Thu moi nhan viec - ${candidate.fullName}`,
    templateApproved: !!tpl.approvedAt,
    usingFallbackTemplate: tpl.usingFallback,
    missingVars: rendered.missing,
  };
}

/** Khối tài liệu để dựng .docx — tách ra để route xuất file không phải biết cách thay biến. */
export async function buildOfferDoc(candidateId: string, viewerStaffId: string | null) {
  const offer = await loadOffer(candidateId, viewerStaffId);
  if (!offer) return null;
  return offerBodyToBlocks(offer.letterTitle, offer.letter);
}
