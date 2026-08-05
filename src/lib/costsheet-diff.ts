// So sánh 2 phiên bản CO/CE (CostSheetRevision.snapshotJson) — item nào thêm/xóa/sửa, chênh bao nhiêu tiền.
// Hàm thuần, dùng ở tab CO/CE (module ③).
//
// Khớp dòng theo `stableKey` — KHÔNG theo (mã hạng mục + tên): builder gán cứng mã "SECTION" cho
// mọi hạng mục mới, nên hai dòng trùng tên ở hai hạng mục khác nhau sẽ chồng lên nhau và màn so
// sánh báo sai chênh lệch. Snapshot cũ (trước khi có stableKey) rơi về khoá cũ để vẫn đọc được.

export type SnapshotLine = {
  /** Khoá bền của dòng. Rỗng ở snapshot cũ → rơi về khoá (mã hạng mục ‖ tên). */
  stableKey?: string;
  itemName: string;
  lineType: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  fixedAmount?: number | null;
  percentVal?: number | null;
  /** Cờ "TCM hỗ trợ" — snapshot đã ghi từ đợt BM02, nay khai kiểu để bộ xuất nghiệm thu bỏ trống tiền. */
  isSponsored?: boolean;
  /** K3 — giá tham chiếu hàng kho; vào TRỌNG SỐ chia tiền khách, không vào tiền. Đã ghi từ đợt K3. */
  stockRefUnitPrice?: number | null;
  /** LOF-V1 — nhãn chặng (tỉnh/điểm/đợt). Snapshot cũ không có → undefined. */
  legCode?: string | null;
  amount: number;
  /**
   * CO/CE v3 — GIÁ BÁN theo dòng. saveCostSheet đã ghi các trường này vào snapshot từ CE-1, nhưng
   * bộ diff trước CE-5 KHÔNG khai và KHÔNG so ⇒ khách sửa giá bán mà giữ giá vốn thì mọi dòng bị
   * xếp "unchanged" và màn So sánh báo "không có thay đổi" trong khi tổng CE đã lệch. Đã tái hiện
   * bằng số: đổi ceUnitPrice 9.112.279 → 7.000.000 cho ra 0 dòng changed, tổng CE lệch −2.112.279.
   * Đây đúng là ca dùng hằng ngày của vòng thương lượng với khách — ĐỪNG bỏ trường nào khỏi lineEqual.
   */
  ceQuantity?: number | null;
  ceUnitPrice?: number | null;
  ceGroupKey?: string | null;
  ceName?: string | null;
  vatPct?: number | null;
  taxType?: string | null;
  customTaxAmount?: number | null;
  /** CE-5 — dòng khách yêu cầu BỎ: còn trong bảng, gạch ngang, CE = 0 cho tới khi Account quyết. */
  ceDropped?: boolean;
};

/** Tiền khách trả của một dòng — dòng bị khách gạch bỏ hoặc dòng tài trợ đều bằng 0. */
export function snapshotLineCeAmount(l: SnapshotLine): number {
  if (l.ceDropped || l.isSponsored) return 0;
  if (l.ceUnitPrice == null) return 0;
  return Math.round((l.ceQuantity ?? 0) * l.ceUnitPrice);
}

export type SnapshotSection = {
  code: string;
  nameVi: string;
  isProxy?: boolean;
  /** Mã hạng mục cha — snapshot đã ghi từ lâu, nay khai kiểu để bộ xuất nghiệm thu suy Chi hộ kế thừa. */
  parentCode?: string | null;
  lines: SnapshotLine[];
};

export type CostSheetSnapshot = {
  sections: SnapshotSection[];
  totals: { coTotal: number; ceTotal: number; chiHo: number; marginPct: number };
};

export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export type LineDiff = {
  sectionCode: string;
  sectionName: string;
  itemName: string;
  kind: DiffKind;
  before: SnapshotLine | null;
  after: SnapshotLine | null;
  amountDelta: number; // after.amount - before.amount (VND) — GIÁ VỐN
  /** CE-5 — chênh lệch TIỀN KHÁCH TRẢ; đây mới là số của vòng thương lượng. */
  ceDelta: number;
  /**
   * Hướng thay đổi để tô màu, ưu tiên theo TIỀN KHÁCH TRẢ (vòng review với khách nói về số này);
   * dòng chỉ đổi giá vốn thì rơi về hướng của giá vốn. Cùng bảng màu với `import-panel.tsx`:
   * tăng = xanh · giảm = cam · xoá = đỏ · thêm mới = xanh dương.
   */
  direction: "up" | "down" | "same";
};

export type SnapshotDiff = {
  lines: LineDiff[];
  totalsDelta: { coTotal: number; ceTotal: number; chiHo: number; marginPct: number };
  addedCount: number;
  removedCount: number;
  changedCount: number;
};

/** Parse an toàn snapshotJson → CostSheetSnapshot (rỗng nếu lỗi). */
export function parseSnapshot(json: string | null | undefined): CostSheetSnapshot {
  if (!json) return { sections: [], totals: { coTotal: 0, ceTotal: 0, chiHo: 0, marginPct: 0 } };
  try {
    const obj = JSON.parse(json) as CostSheetSnapshot;
    return {
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      totals: obj.totals ?? { coTotal: 0, ceTotal: 0, chiHo: 0, marginPct: 0 },
    };
  } catch {
    return { sections: [], totals: { coTotal: 0, ceTotal: 0, chiHo: 0, marginPct: 0 } };
  }
}

export type SnapshotEntry = { sectionCode: string; sectionName: string; line: SnapshotLine };
export type SnapshotPair = { key: string; before: SnapshotEntry | null; after: SnapshotEntry | null };

const nameKey = (sectionCode: string, line: SnapshotLine) => `n:${sectionCode}‖${line.itemName}`;

function flatten(snap: CostSheetSnapshot): SnapshotEntry[] {
  return snap.sections.flatMap((s) => s.lines.map((l) => ({ sectionCode: s.code, sectionName: s.nameVi, line: l })));
}

/**
 * GHÉP CẶP dòng giữa hai snapshot — HAI LƯỢT, và thứ tự hai lượt là điều cốt lõi.
 *
 * Lượt 1 khớp theo `stableKey` khi CẢ HAI bên đều có. Lượt 2 khớp phần còn lại theo (mã hạng mục ‖
 * tên dòng).
 *
 * ⚠ Vì sao KHÔNG dùng một khoá duy nhất "stableKey nếu có, không thì tên": snapshot cũ (trước khi
 * khoá bền đi vào snapshot) không có `stableKey`, snapshot mới thì có. Khoá một lượt sinh ra `n:…`
 * ở một bên và `k:…` ở bên kia ⇒ MỌI dòng hiện thành "xoá hết + thêm lại" dù không đổi một đồng.
 * Đây đúng là ca dùng hằng ngày: bản HỢP ĐỒNG ký từ lâu đem so với bản NGHIỆM THU vừa lưu. Đã tái
 * hiện trên T002 trước khi sửa: 0 changed / 2 added / 2 removed, chênh CO báo −61.100.000 giả.
 *
 * Dùng chung cho màn So sánh và bộ xuất nghiệm thu — hai màn hình phải nói cùng một chuyện về cùng
 * một dòng tiền.
 */
export function pairSnapshotLines(before: CostSheetSnapshot, after: CostSheetSnapshot): SnapshotPair[] {
  const bRest = flatten(before);
  const aRest = flatten(after);
  const pairs: SnapshotPair[] = [];

  const aByStable = new Map<string, SnapshotEntry>();
  for (const e of aRest) if (e.line.stableKey) aByStable.set(e.line.stableKey, e);

  const bLeft: SnapshotEntry[] = [];
  const takenA = new Set<SnapshotEntry>();
  for (const b of bRest) {
    const a = b.line.stableKey ? aByStable.get(b.line.stableKey) : undefined;
    if (a) {
      pairs.push({ key: `k:${b.line.stableKey}`, before: b, after: a });
      takenA.add(a);
    } else bLeft.push(b);
  }

  // Lượt 2 — phần chưa khớp, theo tên. Một tên chỉ ghép được một lần: hai dòng trùng tên trong cùng
  // hạng mục thì dòng thứ hai rơi về added/removed thay vì ghép bừa vào nhau.
  const aLeftByName = new Map<string, SnapshotEntry[]>();
  for (const a of aRest) {
    if (takenA.has(a)) continue;
    const k = nameKey(a.sectionCode, a.line);
    if (!aLeftByName.has(k)) aLeftByName.set(k, []);
    aLeftByName.get(k)!.push(a);
  }
  for (const b of bLeft) {
    const k = nameKey(b.sectionCode, b.line);
    const a = aLeftByName.get(k)?.shift();
    if (a) takenA.add(a);
    pairs.push({ key: k, before: b, after: a ?? null });
  }
  for (const a of aRest) {
    if (takenA.has(a)) continue;
    pairs.push({ key: a.line.stableKey ? `k:${a.line.stableKey}` : nameKey(a.sectionCode, a.line), before: null, after: a });
  }
  return pairs;
}

function lineEqual(a: SnapshotLine, b: SnapshotLine): boolean {
  return (
    a.lineType === b.lineType &&
    (a.quantity ?? null) === (b.quantity ?? null) &&
    (a.unit ?? null) === (b.unit ?? null) &&
    (a.unitPrice ?? null) === (b.unitPrice ?? null) &&
    (a.fixedAmount ?? null) === (b.fixedAmount ?? null) &&
    (a.percentVal ?? null) === (b.percentVal ?? null) &&
    // Đổi nhãn chặng KHÔNG đổi một đồng nào, nhưng nó đổi cách bản xuất nghiệm thu gom khối — gán
    // nhầm tỉnh mà màn So sánh báo "không đổi" thì không còn đường nào phát hiện.
    (a.legCode ?? null) === (b.legCode ?? null) &&
    a.amount === b.amount &&
    // CO/CE v3 — GIÁ BÁN + thuế theo dòng. Thiếu khối này là bộ diff mù với đúng loại thay đổi mà
    // vòng thương lượng với khách sinh ra (xem chú thích ở SnapshotLine).
    (a.ceQuantity ?? null) === (b.ceQuantity ?? null) &&
    (a.ceUnitPrice ?? null) === (b.ceUnitPrice ?? null) &&
    (a.ceGroupKey ?? null) === (b.ceGroupKey ?? null) &&
    (a.ceName ?? null) === (b.ceName ?? null) &&
    (a.vatPct ?? null) === (b.vatPct ?? null) &&
    (a.taxType ?? null) === (b.taxType ?? null) &&
    (a.customTaxAmount ?? null) === (b.customTaxAmount ?? null) &&
    !!a.ceDropped === !!b.ceDropped
  );
}

/**
 * So sánh before → after. Khớp dòng theo `stableKey` (snapshot cũ: mã hạng mục ‖ tên).
 * added = chỉ có ở after; removed = chỉ có ở before; changed = khác giá trị; unchanged = giống hệt.
 */
export function diffSnapshots(before: CostSheetSnapshot, after: CostSheetSnapshot): SnapshotDiff {
  const lines: LineDiff[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;

  for (const pair of pairSnapshotLines(before, after)) {
    const b = pair.before;
    const a = pair.after;
    const sectionCode = (a ?? b)!.sectionCode;
    const sectionName = (a ?? b)!.sectionName;
    const itemName = (a ?? b)!.line.itemName;

    let kind: DiffKind;
    if (b && a) kind = lineEqual(b.line, a.line) ? "unchanged" : "changed";
    else if (a) kind = "added";
    else kind = "removed";

    if (kind === "added") addedCount++;
    else if (kind === "removed") removedCount++;
    else if (kind === "changed") changedCount++;

    const amountDelta = (a?.line.amount ?? 0) - (b?.line.amount ?? 0);
    const ceDelta = (a ? snapshotLineCeAmount(a.line) : 0) - (b ? snapshotLineCeAmount(b.line) : 0);
    // Hướng theo TIỀN KHÁCH TRẢ trước; dòng chỉ đổi giá vốn thì mới rơi về hướng của giá vốn.
    const ref = ceDelta !== 0 ? ceDelta : amountDelta;
    lines.push({
      sectionCode,
      sectionName,
      itemName,
      kind,
      before: b?.line ?? null,
      after: a?.line ?? null,
      amountDelta,
      ceDelta,
      direction: ref > 0 ? "up" : ref < 0 ? "down" : "same",
    });
  }

  // Sắp xếp: thay đổi (added/removed/changed) lên trước, theo section rồi tên item.
  const rank: Record<DiffKind, number> = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  lines.sort((x, y) => rank[x.kind] - rank[y.kind] || x.sectionCode.localeCompare(y.sectionCode) || x.itemName.localeCompare(y.itemName));

  return {
    lines,
    totalsDelta: {
      coTotal: after.totals.coTotal - before.totals.coTotal,
      ceTotal: after.totals.ceTotal - before.totals.ceTotal,
      chiHo: after.totals.chiHo - before.totals.chiHo,
      marginPct: after.totals.marginPct - before.totals.marginPct,
    },
    addedCount,
    removedCount,
    changedCount,
  };
}
