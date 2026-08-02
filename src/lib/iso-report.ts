/**
 * Chấm trạng thái 25 loại hồ sơ ISO cho MỘT dự án — HÀM THUẦN, không gọi Prisma
 * (quy ước HANDOVER 4.1, tiền lệ src/lib/pnl.ts). IO nạp dữ liệu nằm ở src/lib/iso-data.ts.
 *
 * ⚠ Trạng thái AUTO được TÍNH LÚC ĐỌC, KHÔNG lưu xuống DB. Lưu là báo cáo nói dối: xoá bản CO/CE
 * hay gỡ link brief xong mà bảng vẫn báo "đã có" thì kiểm toán ISO đọc ra số sai mà không ai biết.
 * Bảng `ProjectIsoDoc` chỉ giữ phần CON NGƯỜI làm: đính file, dán link, đánh "không áp dụng".
 */

import { ISO_DOCS, type IsoDocDef } from "./iso-catalog";

/** Ảnh chụp dữ liệu dự án đủ để chấm 14 mục AUTO. Nạp một lượt ở iso-data.ts. */
export type IsoProjectSnapshot = {
  briefLinkUrl: string | null;
  /** Có ít nhất 1 PlanningProposalVersion status = "FINAL". */
  hasFinalProposal: boolean;
  /** CostSheet version = "CTRACT" / "LIQUID". */
  hasBudgetSheet: boolean;
  hasLiquidSheet: boolean;
  timelineCount: number;
  /** TimelineItem sinh từ template viewMode = "CHECKLIST". */
  checklistCount: number;
  contract: {
    fileUrl: string | null;
    contractNo: string | null;
    poNo: string | null;
    acceptanceDocsConfirmedAt: Date | null;
  } | null;
  /** ClientInvoice chưa bị huỷ. */
  invoiceCount: number;
  /** department của ProjectOrder đã gửi (isDraft = false). */
  sentOrderDepartments: string[];
  /** CreativeTask status = "DELIVERED" và có deliverableLinkUrl. */
  deliveredDesignCount: number;
};

/** Phần con người đã làm — một dòng ProjectIsoDoc. */
export type IsoManualEntry = {
  docCode: string;
  status: "PRESENT" | "NA";
  linkUrl: string | null;
  projectFileId: string | null;
  fileName: string | null;
  naReason: string | null;
  note: string | null;
};

export type IsoDocStatus = "PRESENT" | "MISSING" | "NA";

export type IsoDocState = {
  code: string;
  status: IsoDocStatus;
  /** Vì sao app chấm như vậy — hiện ngay trên bảng để người dùng tin được con số. */
  evidenceVi: string | null;
  /** Nguồn kết luận: app tự suy hay người đính vào. */
  source: "AUTO" | "MANUAL" | null;
  linkUrl: string | null;
  projectFileId: string | null;
  fileName: string | null;
  naReason: string | null;
  note: string | null;
  optional: boolean;
};

/** Chấm 1 mục AUTO. Trả null nghĩa là "app không tự kết luận được". */
function autoEvidence(def: IsoDocDef, s: IsoProjectSnapshot): string | null {
  switch (def.code) {
    case "ISO-01":
      return s.briefLinkUrl ? "Link brief trên hồ sơ dự án" : null;
    case "ISO-02":
      return s.hasFinalProposal ? "Proposal đã chốt FINAL ở tab Planning" : null;
    case "ISO-04":
      return s.hasBudgetSheet ? "Bảng CO/CE dự toán" : null;
    case "ISO-05":
      return s.contract?.poNo ? `PO số ${s.contract.poNo}` : null;
    case "ISO-06": {
      const c = s.contract;
      if (!c) return null;
      if (c.fileUrl) return "File hợp đồng đã đính";
      return c.contractNo ? `Hợp đồng số ${c.contractNo} (chưa đính file)` : null;
    }
    case "ISO-07":
      return s.timelineCount > 0 ? `Master timeline ${s.timelineCount} dòng` : null;
    case "ISO-08":
      return s.checklistCount > 0 ? `Checklist ${s.checklistCount} hạng mục` : null;
    case "ISO-11":
      return s.sentOrderDepartments.includes("CREATIVE") ? "Đã gửi ORDER Creative" : null;
    case "ISO-12":
      return s.sentOrderDepartments.includes("PRO") ? "Đã gửi ORDER Sản xuất" : null;
    case "ISO-13":
      return s.sentOrderDepartments.includes("PCC") ? "Đã gửi ORDER Thu mua" : null;
    case "ISO-14":
      return s.sentOrderDepartments.includes("OPE") ? "Đã gửi ORDER Vận hành" : null;
    case "ISO-19":
      return s.deliveredDesignCount > 0 ? `${s.deliveredDesignCount} thiết kế đã bàn giao` : null;
    case "ISO-23": {
      const ok = !!s.contract?.acceptanceDocsConfirmedAt && s.invoiceCount > 0;
      return ok ? `Kế toán đã xác nhận đủ hồ sơ · ${s.invoiceCount} hoá đơn` : null;
    }
    case "ISO-24":
      return s.hasLiquidSheet ? "Bảng CO/CE nghiệm thu" : null;
    default:
      return null;
  }
}

/**
 * Ghép AUTO với phần người dùng đính vào.
 *
 * Thứ tự ưu tiên CỐ Ý:
 *  1. Người đánh "không áp dụng" → NA. Đây là kết luận của con người, app không được ghi đè.
 *  2. App tự thấy CÓ, hoặc người đã đính file/link → PRESENT.
 *  3. Còn lại → MISSING.
 *
 * Nghĩa là đính file chỉ THÊM bằng chứng, không bao giờ làm mất bằng chứng app đã tự thấy.
 */
export function resolveIsoDocs(snapshot: IsoProjectSnapshot, manual: IsoManualEntry[]): IsoDocState[] {
  const byCode = new Map(manual.map((m) => [m.docCode, m]));
  return ISO_DOCS.map((def) => {
    const m = byCode.get(def.code);
    const base = {
      code: def.code,
      optional: def.optional === true,
      linkUrl: m?.linkUrl ?? null,
      projectFileId: m?.projectFileId ?? null,
      fileName: m?.fileName ?? null,
      naReason: m?.naReason ?? null,
      note: m?.note ?? null,
    };

    if (m?.status === "NA") {
      return { ...base, status: "NA" as const, evidenceVi: m.naReason, source: "MANUAL" as const };
    }

    const auto = def.kind === "AUTO" ? autoEvidence(def, snapshot) : null;
    if (auto) return { ...base, status: "PRESENT" as const, evidenceVi: auto, source: "AUTO" as const };

    if (m?.status === "PRESENT") {
      const label = m.fileName ?? m.linkUrl ?? "Đã đính kèm";
      return { ...base, status: "PRESENT" as const, evidenceVi: label, source: "MANUAL" as const };
    }

    return { ...base, status: "MISSING" as const, evidenceVi: null, source: null };
  });
}

export type IsoSummary = {
  total: number;
  present: number;
  na: number;
  missing: number;
  /** MISSING mà KHÔNG phải mục "nếu có" — đây mới là phần thực sự thiếu khi kiểm ISO. */
  blockingMissing: number;
  /** (present + na) / total — NA tính là đã xử lý vì đã có lý do giải trình. */
  completionPct: number;
};

export function summarizeIso(states: IsoDocState[]): IsoSummary {
  const present = states.filter((s) => s.status === "PRESENT").length;
  const na = states.filter((s) => s.status === "NA").length;
  const missing = states.filter((s) => s.status === "MISSING").length;
  const blockingMissing = states.filter((s) => s.status === "MISSING" && !s.optional).length;
  const total = states.length;
  return {
    total,
    present,
    na,
    missing,
    blockingMissing,
    completionPct: total === 0 ? 0 : Math.round(((present + na) / total) * 100),
  };
}
