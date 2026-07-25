// So sánh 2 phiên bản CO/CE (CostSheetRevision.snapshotJson) — item nào thêm/xóa/sửa, chênh bao nhiêu tiền.
// Hàm thuần, dùng ở tab CO/CE (module ③). Khớp dòng theo (sectionCode, itemName).

export type SnapshotLine = {
  itemName: string;
  lineType: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  fixedAmount?: number | null;
  percentVal?: number | null;
  amount: number;
};

export type SnapshotSection = {
  code: string;
  nameVi: string;
  isProxy?: boolean;
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
  amountDelta: number; // after.amount - before.amount (VND)
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

function lineEqual(a: SnapshotLine, b: SnapshotLine): boolean {
  return (
    a.lineType === b.lineType &&
    (a.quantity ?? null) === (b.quantity ?? null) &&
    (a.unit ?? null) === (b.unit ?? null) &&
    (a.unitPrice ?? null) === (b.unitPrice ?? null) &&
    (a.fixedAmount ?? null) === (b.fixedAmount ?? null) &&
    (a.percentVal ?? null) === (b.percentVal ?? null) &&
    a.amount === b.amount
  );
}

/**
 * So sánh before → after. Khớp dòng theo key (sectionCode ‖ itemName).
 * added = chỉ có ở after; removed = chỉ có ở before; changed = khác giá trị; unchanged = giống hệt.
 */
export function diffSnapshots(before: CostSheetSnapshot, after: CostSheetSnapshot): SnapshotDiff {
  type Entry = { sectionCode: string; sectionName: string; line: SnapshotLine };
  const index = (snap: CostSheetSnapshot) => {
    const m = new Map<string, Entry>();
    for (const s of snap.sections) {
      for (const l of s.lines) {
        m.set(`${s.code}‖${l.itemName}`, { sectionCode: s.code, sectionName: s.nameVi, line: l });
      }
    }
    return m;
  };
  const bMap = index(before);
  const aMap = index(after);
  const keys = new Set([...bMap.keys(), ...aMap.keys()]);

  const lines: LineDiff[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;

  for (const key of keys) {
    const b = bMap.get(key);
    const a = aMap.get(key);
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

    lines.push({
      sectionCode,
      sectionName,
      itemName,
      kind,
      before: b?.line ?? null,
      after: a?.line ?? null,
      amountDelta: (a?.line.amount ?? 0) - (b?.line.amount ?? 0),
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
