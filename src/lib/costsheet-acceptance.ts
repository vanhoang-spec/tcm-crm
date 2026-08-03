import { quotationChain } from "@/lib/costsheet-quotation";
import { pairSnapshotLines, type CostSheetSnapshot, type SnapshotLine } from "@/lib/costsheet-diff";

/**
 * BẢN NGHIỆM THU GỬI KHÁCH — đặt hai bản snapshot HỢP ĐỒNG và NGHIỆM THU cạnh nhau, chênh lệch
 * từng dòng, gom theo CHẶNG (tỉnh/điểm/đợt).
 *
 * Đây là thứ team Account đang làm tay: file `LOF x TCM_Nghiem thu phase 1_Kun_5 tinh.xlsx` có 78
 * cột — mỗi tỉnh một cụm HỢP ĐỒNG + một cụm NGHIỆM THU + cột "Chênh lệch". Số trong app đã khớp
 * tuyệt đối với file đó (HĐ 7.270.970.056 · NT 7.557.818.278 · chênh 286.848.222); thiếu duy nhất
 * cách BÀY nó ra.
 *
 * HÀM THUẦN, không gọi Prisma (quy ước HANDOVER mục 4.1) — cùng khuôn `costsheet-quotation.ts`.
 *
 * ⚠ BẤT BIẾN: KHÔNG sinh hệ thống tổng tiền thứ hai (HANDOVER mục 6). Giá khách từng dòng ở đây
 * suy ra bằng ĐÚNG chuỗi và ĐÚNG phép phân bổ của bản báo giá BM02 — dùng lại `quotationChain`,
 * chia theo trọng số, dư làm tròn dồn vào dòng lớn nhất. Nhờ vậy Σ dòng của mỗi bên = đúng
 * `serviceSubtotal` của bên đó, và cộng ngược lên vẫn ra `ceTotal` của chính snapshot đó.
 */

export type AcceptanceSide = {
  /** Số lượng và đơn giá GỐC (giá vốn) — để người đọc đối chiếu khối lượng, không phải tiền khách. */
  quantity: number;
  unit: string | null;
  /** Tiền KHÁCH của dòng, đã phân bổ. null = dòng "TCM hỗ trợ" (bày đơn giá, bỏ trống thành tiền). */
  total: number | null;
};

export type AcceptanceLine = {
  key: string;
  sectionCode: string;
  sectionName: string;
  itemName: string;
  isProxy: boolean;
  contract: AcceptanceSide | null;
  acceptance: AcceptanceSide | null;
  /** NT − HĐ theo tiền khách. Dòng chỉ có một bên thì bên vắng tính bằng 0. */
  delta: number;
  status: "same" | "changed" | "added" | "removed";
};

export type AcceptanceLeg = {
  /** null = dòng chưa gắn nhãn chặng. */
  legCode: string | null;
  label: string;
  lines: AcceptanceLine[];
  contractTotal: number;
  acceptanceTotal: number;
  delta: number;
};

export type AcceptanceFooter = {
  serviceSubtotal: number;
  feeAmt: number;
  vatAmt: number;
  /** = ceTotal của snapshot. */
  grandTotal: number;
  chiHo: number;
  /** = ceTotal + chiHo — cùng định nghĩa `clientBillableTotal`. */
  billable: number;
};

export type AcceptanceModel = {
  projectCode: string;
  projectName: string;
  clientName: string;
  agencyFeePct: number;
  vatPct: number;
  legs: AcceptanceLeg[];
  contract: AcceptanceFooter;
  acceptance: AcceptanceFooter;
  /** Chênh lệch từng dòng footer (NT − HĐ). */
  delta: AcceptanceFooter;
};

export type AcceptanceInput = {
  projectCode: string;
  projectName: string;
  clientName: string;
  vatPct: number;
  agencyFeePct: number;
  contract: CostSheetSnapshot;
  acceptance: CostSheetSnapshot;
};

/** Nhãn của khối dòng chưa gắn chặng. Để hằng vì cả bộ xuất Excel lẫn màn hình dùng chung. */
export const UNASSIGNED_LEG_LABEL = "Chung (chưa gắn chặng)";

/** Tiền khách đã phân bổ cho từng dòng của một bản; null = dòng tài trợ (bỏ trống Thành tiền). */
type Allocation = { totalOf: Map<SnapshotLine, number | null>; proxyOf: Map<SnapshotLine, boolean>; footer: AcceptanceFooter };

/**
 * Chi hộ KẾ THỪA xuống hạng mục con — đúng như `flattenSectionTree`. Snapshot chỉ ghi cờ trên
 * chính hạng mục đó, nên phải leo `parentCode` mà suy; quên bước này là dòng Chi hộ cấp 2 bị đem
 * chia tiền khách như dòng thường.
 */
function effectiveProxyByCode(snap: CostSheetSnapshot): Map<string, boolean> {
  const byCode = new Map(snap.sections.map((s) => [s.code, s]));
  const memo = new Map<string, boolean>();
  const resolve = (code: string, seen: Set<string>): boolean => {
    const cached = memo.get(code);
    if (cached !== undefined) return cached;
    const s = byCode.get(code);
    // Vòng lặp cha-con chỉ có thể đến từ snapshot hỏng; coi như không phải Chi hộ và dừng lại,
    // KHÔNG đệ quy tiếp — thà bày sai một dòng còn hơn treo tiến trình xuất file.
    if (!s || seen.has(code)) return false;
    seen.add(code);
    const val = Boolean(s.isProxy) || (s.parentCode ? resolve(s.parentCode, seen) : false);
    memo.set(code, val);
    return val;
  };
  for (const s of snap.sections) resolve(s.code, new Set());
  return memo;
}

/**
 * Phân bổ tiền khách cho từng dòng của MỘT snapshot.
 *
 * Sao đúng phép của `buildQuotationModel`: trọng số = amount (CO đã gross-up, snapshot lưu sẵn) +
 * giá tham chiếu hàng kho; chỉ dòng non-proxy KHÔNG tài trợ mới được chia; dư làm tròn dồn vào
 * dòng lớn nhất ⇒ Σ = serviceSubtotal TUYỆT ĐỐI.
 */
function allocate(snap: CostSheetSnapshot, vatPct: number, agencyFeePct: number): Allocation {
  const proxyByCode = effectiveProxyByCode(snap);
  const totalOf = new Map<SnapshotLine, number | null>();
  const proxyOf = new Map<SnapshotLine, boolean>();
  const all: SnapshotLine[] = [];
  for (const s of snap.sections) {
    const isProxy = proxyByCode.get(s.code) ?? Boolean(s.isProxy);
    for (const l of s.lines) {
      proxyOf.set(l, isProxy);
      totalOf.set(l, null);
      all.push(l);
    }
  }

  const chain = quotationChain(snap.totals.ceTotal, vatPct, agencyFeePct);
  const weight = (l: SnapshotLine) => l.amount + (l.stockRefUnitPrice ? Math.round((l.quantity ?? 0) * l.stockRefUnitPrice) : 0);
  const chargeable = all.filter((l) => !proxyOf.get(l) && !l.isSponsored);
  const totalWeight = chargeable.reduce((a, l) => a + weight(l), 0);

  if (chargeable.length > 0 && totalWeight > 0) {
    const factor = chain.serviceSubtotal / totalWeight;
    let allocated = 0;
    for (const l of chargeable) {
      const tt = Math.round(weight(l) * factor);
      totalOf.set(l, tt);
      allocated += tt;
    }
    const residual = chain.serviceSubtotal - allocated;
    if (residual !== 0) {
      const largest = chargeable.reduce((a, b) => ((totalOf.get(a) ?? 0) >= (totalOf.get(b) ?? 0) ? a : b));
      totalOf.set(largest, (totalOf.get(largest) ?? 0) + residual);
    }
  }
  // Chi hộ: khách trả đúng chi phí thực, không qua phân bổ. Dòng tài trợ giữ null (bỏ trống tiền).
  for (const l of all) if (proxyOf.get(l)) totalOf.set(l, l.amount);

  return {
    totalOf,
    proxyOf,
    footer: {
      serviceSubtotal: chain.serviceSubtotal,
      feeAmt: chain.feeAmt,
      vatAmt: chain.vatAmt,
      grandTotal: snap.totals.ceTotal,
      chiHo: snap.totals.chiHo,
      billable: snap.totals.ceTotal + snap.totals.chiHo,
    },
  };
}

function sideOf(line: SnapshotLine | null | undefined, alloc: Allocation): AcceptanceSide | null {
  if (!line) return null;
  return { quantity: line.quantity ?? 0, unit: line.unit ?? null, total: alloc.totalOf.get(line) ?? null };
}

const deltaFooter = (a: AcceptanceFooter, b: AcceptanceFooter): AcceptanceFooter => ({
  serviceSubtotal: a.serviceSubtotal - b.serviceSubtotal,
  feeAmt: a.feeAmt - b.feeAmt,
  vatAmt: a.vatAmt - b.vatAmt,
  grandTotal: a.grandTotal - b.grandTotal,
  chiHo: a.chiHo - b.chiHo,
  billable: a.billable - b.billable,
});

export function buildAcceptanceModel(input: AcceptanceInput): AcceptanceModel {
  const c = allocate(input.contract, input.vatPct, input.agencyFeePct);
  const a = allocate(input.acceptance, input.vatPct, input.agencyFeePct);

  const legs = new Map<string, AcceptanceLeg>();
  // Ghép cặp bằng ĐÚNG bộ của màn So sánh — hai màn hình phải nói cùng một chuyện về một dòng tiền.
  for (const pair of pairSnapshotLines(input.contract, input.acceptance)) {
    const ref = pair.after ?? pair.before!;
    const cTotal = c.totalOf.get(pair.before?.line as SnapshotLine) ?? 0;
    const aTotal = a.totalOf.get(pair.after?.line as SnapshotLine) ?? 0;

    const status: AcceptanceLine["status"] = !pair.before ? "added" : !pair.after ? "removed" : cTotal === aTotal ? "same" : "changed";
    // Nhãn lấy từ bản NGHIỆM THU khi có: đó là bản khách đang đọc, và chặng có thể được gắn lại
    // giữa hai bản (dòng chuyển từ tỉnh này sang tỉnh khác).
    const legCode = (ref.line.legCode ?? "").trim() || null;
    const legKey = legCode ?? "";
    if (!legs.has(legKey)) {
      legs.set(legKey, { legCode, label: legCode ?? UNASSIGNED_LEG_LABEL, lines: [], contractTotal: 0, acceptanceTotal: 0, delta: 0 });
    }
    const leg = legs.get(legKey)!;
    leg.lines.push({
      key: pair.key,
      sectionCode: ref.sectionCode,
      sectionName: ref.sectionName,
      itemName: ref.line.itemName,
      isProxy: (pair.after ? a.proxyOf.get(pair.after.line) : c.proxyOf.get(pair.before!.line)) ?? false,
      contract: sideOf(pair.before?.line, c),
      acceptance: sideOf(pair.after?.line, a),
      delta: aTotal - cTotal,
      status,
    });
    leg.contractTotal += cTotal;
    leg.acceptanceTotal += aTotal;
    leg.delta += aTotal - cTotal;
  }

  // Khối "Chung" xuống cuối; các chặng có nhãn giữ thứ tự xuất hiện (= thứ tự người dùng dựng bảng).
  const legList = [...legs.values()].sort((x, y) => (x.legCode === null ? 1 : 0) - (y.legCode === null ? 1 : 0));

  return {
    projectCode: input.projectCode,
    projectName: input.projectName,
    clientName: input.clientName,
    agencyFeePct: input.agencyFeePct,
    vatPct: input.vatPct,
    legs: legList,
    contract: c.footer,
    acceptance: a.footer,
    delta: deltaFooter(a.footer, c.footer),
  };
}
