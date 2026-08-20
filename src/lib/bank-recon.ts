/**
 * ĐỐI CHIẾU KẾ HOẠCH CHI ↔ SAO KÊ NGÂN HÀNG — phần THUẦN (không IO, không exceljs).
 *
 * ⚠ VÌ SAO PHẦN KHỚP DO CODE LÀM, KHÔNG PHẢI AI: đây là bài toán khớp SỐ, và sai một chiều nào cũng
 * mất tiền thật — báo nhầm "đã chi" thì NCC không nhận được tiền, báo nhầm "rớt" thì kế toán lập lại
 * lệnh và TRẢ TRÙNG. Model ngôn ngữ không đảm bảo được điều đó, còn sao kê một ngày có thể vài trăm
 * dòng (quá trần ký tự gửi sang AI). Đúng tiền lệ bảng so sánh báo giá NCC (HANDOVER 10.36): số tính
 * bằng code, AI chỉ nhận xét phần mập mờ.
 *
 * ⚠ BA CA CÓ THẬT trong file mẫu 17.08.2026 — thuật toán phải xử lý được cả ba, nếu không là báo sai:
 *  1. **GỘP LỆNH**: 22.900.000 (T041ACA26A1) + 8.450.000 (T042ACA26A1) đi thành MỘT giao dịch
 *     31.350.000, nội dung ghi cả hai mã. Khớp theo số tiền đơn thuần sẽ báo hai khoản này "rớt".
 *  2. **MÃ LỆCH**: kế hoạch ghi T039JLB26A3, sao kê ghi T036JLB26A3 (7.000.000). Vẫn khớp được theo
 *     số tiền, nhưng phải NÊU RA — có thể là gõ sai nội dung chuyển khoản.
 *  3. **TIỀN VÀO**: sao kê có dòng thu tiền khách (Colgate 48.988.800) — chỉ xét cột RÚT RA.
 */

import type { DocBlock } from "./doc-blocks";

export type PlanRow = {
  /** Số thứ tự trên bảng kế hoạch — để kế toán dò lại đúng dòng. */
  stt: string;
  /** Mã tìm hồ sơ (vd "KHC 825"). */
  docCode: string | null;
  /** Ngày duyệt lệnh — suy từ TÊN SHEET / tiêu đề bảng, KHÔNG phải cột "Ngày nhận hồ sơ". */
  approvedDate: string;
  description: string;
  beneficiary: string;
  bankAccount: string | null;
  bankName: string | null;
  /** Mã dự án ở cột "Code" — khoá khớp phụ, vì sao kê không có tên bên thụ hưởng. */
  projectCode: string | null;
  amount: number;
};

export type StatementRow = {
  /** Số GD của ngân hàng. */
  ref: string | null;
  date: string | null;
  content: string;
  /** Số tiền RÚT RA. Dòng chỉ có tiền vào không được đưa vào đây. */
  amount: number;
};

export type MatchKind = "EXACT" | "CODE_GROUP" | "ACCOUNT_GROUP" | "SPLIT";

export type MatchedGroup = {
  kind: MatchKind;
  plan: PlanRow[];
  statement: StatementRow[];
  /** Cảnh báo cần kế toán liếc qua dù đã khớp (vd mã dự án lệch). */
  warnings: string[];
};

export type ReconResult = {
  matched: MatchedGroup[];
  /** Khoản trong kế hoạch KHÔNG tìm thấy trên sao kê — thứ kế toán cần lập lại lệnh. */
  missing: PlanRow[];
  /** Giao dịch rút ra trên sao kê không giải thích được bằng kế hoạch chi. */
  unexpected: StatementRow[];
  totals: { planTotal: number; statementTotal: number; matchedTotal: number; missingTotal: number; unexpectedTotal: number };
};

/** Bỏ dấu + hoa thường + gom khoảng trắng, để so text nội dung giao dịch. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rút mã dự án từ nội dung giao dịch. Mã dự án TCM có khuôn `T` + 3 số + 3 chữ + 2 số + team
 * (vd T016LOF26A3), và nội dung có thể mang nhiều mã ("CODE T041ACA26A1, T042ACA26A1").
 * `TCM26` (chi phí văn phòng) cũng là một "mã" hợp lệ ở cột Code.
 */
export function extractProjectCodes(text: string): string[] {
  const up = foldText(text);
  const found = new Set<string>();
  for (const m of up.matchAll(/\bT\d{3}[A-Z0-9]{3}\d{2}[A-Z0-9]{0,2}\b/g)) found.add(m[0]);
  for (const m of up.matchAll(/\bTCM\d{2}\b/g)) found.add(m[0]);
  return [...found];
}

/** Làm tròn về đồng — cột tiền trong Excel hay có đuôi thập phân do công thức. */
const vnd = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/** Tập con kích thước 2..max có tổng bằng target. Trả chỉ số, null nếu không có. */
function subsetSum(values: number[], target: number, maxSize: number): number[] | null {
  const n = values.length;
  const pick = (start: number, remain: number, size: number, acc: number[]): number[] | null => {
    if (remain === 0 && acc.length >= 2) return acc;
    if (size === 0 || remain < 0) return null;
    for (let i = start; i < n; i++) {
      const r = pick(i + 1, remain - values[i], size - 1, [...acc, i]);
      if (r) return r;
    }
    return null;
  };
  return pick(0, target, maxSize, []);
}

/**
 * Đối chiếu. Thứ tự các bước là CÓ CHỦ Ý, đi từ chắc chắn nhất tới suy đoán nhiều nhất — bước sau
 * chỉ được đụng vào phần bước trước chưa giải thích được:
 *  1. Số tiền DUY NHẤT ở cả hai bên → khớp 1-1, chắc chắn nhất.
 *  2. Giao dịch mang NHIỀU mã dự án → gom đúng các dòng kế hoạch có mã đó, tổng khớp ⇒ gộp lệnh.
 *     (Bằng chứng nằm ngay trong nội dung giao dịch, không phải đoán.)
 *  3. Số tiền TRÙNG NHAU giữa nhiều khoản → ghép 1-1 theo thứ tự, ưu tiên khớp mã dự án.
 *  4. Cùng SỐ TÀI KHOẢN thụ hưởng → thử tập con có tổng khớp (gộp lệnh không ghi mã).
 *  5. Một dòng kế hoạch = tổng NHIỀU giao dịch (tách lệnh).
 * Còn lại: kế hoạch chưa khớp = RỚT, giao dịch chưa khớp = ngoài kế hoạch.
 */
export function reconcile(plan: PlanRow[], statement: StatementRow[]): ReconResult {
  const p = plan.map((r) => ({ ...r, amount: vnd(r.amount) }));
  const s = statement.map((r) => ({ ...r, amount: vnd(r.amount) }));
  const planUsed = new Set<number>();
  const stUsed = new Set<number>();
  const matched: MatchedGroup[] = [];

  const warnCode = (pr: PlanRow[], st: StatementRow[]): string[] => {
    const w: string[] = [];
    const codes = new Set(st.flatMap((x) => extractProjectCodes(x.content)));
    if (codes.size === 0) return w;
    for (const row of pr) {
      if (!row.projectCode) continue;
      if (!codes.has(foldText(row.projectCode))) {
        w.push(`Mã dự án lệch: kế hoạch ghi "${row.projectCode}", nội dung chuyển khoản ghi "${[...codes].join(", ")}"`);
      }
    }
    return w;
  };

  // ── 1. Số tiền duy nhất ở CẢ HAI bên ──────────────────────────────────────────────────────────
  const countBy = (arr: { amount: number }[]) => {
    const m = new Map<number, number>();
    for (const x of arr) m.set(x.amount, (m.get(x.amount) ?? 0) + 1);
    return m;
  };
  const planCount = countBy(p);
  const stCount = countBy(s);
  for (let i = 0; i < p.length; i++) {
    if (planUsed.has(i)) continue;
    const amt = p[i].amount;
    if (planCount.get(amt) !== 1 || stCount.get(amt) !== 1) continue;
    const j = s.findIndex((x, k) => !stUsed.has(k) && x.amount === amt);
    if (j < 0) continue;
    planUsed.add(i);
    stUsed.add(j);
    matched.push({ kind: "EXACT", plan: [p[i]], statement: [s[j]], warnings: warnCode([p[i]], [s[j]]) });
  }

  // ── 2. Gộp lệnh có BẰNG CHỨNG: nội dung giao dịch mang nhiều mã dự án ─────────────────────────
  for (let j = 0; j < s.length; j++) {
    if (stUsed.has(j)) continue;
    const codes = extractProjectCodes(s[j].content);
    if (codes.length < 2) continue;
    const idx = p
      .map((row, i) => ({ row, i }))
      .filter(({ row, i }) => !planUsed.has(i) && row.projectCode && codes.includes(foldText(row.projectCode)))
      .map(({ i }) => i);
    if (idx.length < 2) continue;
    const sum = idx.reduce((t, i) => t + p[i].amount, 0);
    if (sum !== s[j].amount) continue;
    idx.forEach((i) => planUsed.add(i));
    stUsed.add(j);
    matched.push({
      kind: "CODE_GROUP",
      plan: idx.map((i) => p[i]),
      statement: [s[j]],
      warnings: [`Ngân hàng gộp ${idx.length} khoản thành 1 lệnh (nội dung giao dịch ghi đủ ${codes.length} mã dự án).`],
    });
  }

  // ── 3. Số tiền TRÙNG NHAU: khớp 1-1 theo thứ tự, ưu tiên khớp được mã dự án ───────────────────
  // ⚠ Bước này bắt buộc phải có: danh sách chi thật hay có nhiều khoản cùng số tiền (hai bạn part
  // time cùng 800.000). Bỏ qua thì cả hai rơi vào "rớt" ⇒ kế toán chi lại ⇒ TRẢ TRÙNG. Nhưng ghép
  // cặp nào với cặp nào là suy đoán, nên luôn kèm cảnh báo cho kế toán xác nhận.
  for (let i = 0; i < p.length; i++) {
    if (planUsed.has(i)) continue;
    const amt = p[i].amount;
    const free = s.map((row, j) => ({ row, j })).filter(({ row, j }) => !stUsed.has(j) && row.amount === amt);
    if (free.length === 0) continue;
    const code = p[i].projectCode ? foldText(p[i].projectCode!) : null;
    const best = (code && free.find(({ row }) => extractProjectCodes(row.content).includes(code))) || free[0];
    planUsed.add(i);
    stUsed.add(best.j);
    const many = planCount.get(amt)! > 1 || stCount.get(amt)! > 1;
    matched.push({
      kind: "EXACT",
      plan: [p[i]],
      statement: [best.row],
      warnings: [
        ...warnCode([p[i]], [best.row]),
        ...(many ? [`Có nhiều khoản cùng số tiền ${amt.toLocaleString("vi-VN")}đ — ghép theo thứ tự, kế toán xác nhận lại cho chắc.`] : []),
      ],
    });
  }

  // ── 4. Gộp lệnh cùng SỐ TÀI KHOẢN thụ hưởng ──────────────────────────────────────────────────
  for (let j = 0; j < s.length; j++) {
    if (stUsed.has(j)) continue;
    const byAcc = new Map<string, number[]>();
    p.forEach((row, i) => {
      if (planUsed.has(i) || !row.bankAccount) return;
      const key = row.bankAccount.replace(/\D/g, "");
      if (!key) return;
      byAcc.set(key, [...(byAcc.get(key) ?? []), i]);
    });
    for (const idxs of byAcc.values()) {
      if (idxs.length < 2) continue;
      const hit = subsetSum(idxs.map((i) => p[i].amount), s[j].amount, Math.min(4, idxs.length));
      if (!hit) continue;
      const chosen = hit.map((k) => idxs[k]);
      chosen.forEach((i) => planUsed.add(i));
      stUsed.add(j);
      matched.push({
        kind: "ACCOUNT_GROUP",
        plan: chosen.map((i) => p[i]),
        statement: [s[j]],
        warnings: [`Gộp ${chosen.length} khoản cùng số tài khoản thụ hưởng thành 1 lệnh — kế toán xác nhận lại cho chắc.`],
      });
      break;
    }
  }

  // ── 5. Tách lệnh: 1 khoản kế hoạch = tổng nhiều giao dịch ─────────────────────────────────────
  for (let i = 0; i < p.length; i++) {
    if (planUsed.has(i)) continue;
    const free = s.map((row, j) => ({ row, j })).filter(({ j }) => !stUsed.has(j));
    if (free.length < 2) continue;
    const hit = subsetSum(free.map((x) => x.row.amount), p[i].amount, Math.min(4, free.length));
    if (!hit) continue;
    const chosen = hit.map((k) => free[k].j);
    planUsed.add(i);
    chosen.forEach((j) => stUsed.add(j));
    matched.push({
      kind: "SPLIT",
      plan: [p[i]],
      statement: chosen.map((j) => s[j]),
      warnings: [`Khoản này được chia thành ${chosen.length} giao dịch trên sao kê — kế toán xác nhận lại cho chắc.`],
    });
  }

  const missing = p.filter((_, i) => !planUsed.has(i));
  const unexpected = s.filter((_, j) => !stUsed.has(j));
  const sum = (arr: { amount: number }[]) => arr.reduce((t, x) => t + x.amount, 0);

  return {
    matched,
    missing,
    unexpected,
    totals: {
      planTotal: sum(p),
      statementTotal: sum(s),
      matchedTotal: sum(matched.flatMap((m) => m.plan)),
      missingTotal: sum(missing),
      unexpectedTotal: sum(unexpected),
    },
  };
}

const money = (n: number) => n.toLocaleString("vi-VN");

/**
 * Dựng BẢNG KẾT QUẢ bằng CODE, không qua AI.
 *
 * ⚠ Chủ ý: AI hỏng (hết hạn mức, timeout, trả sai khuôn) thì kế toán VẪN có bảng đúng để lập lại
 * lệnh. Phần AI chỉ là mấy khối nhận xét nối thêm phía sau — mất cũng không mất việc.
 *
 * Bảng "khoản rớt" mang đúng 4 thứ kế toán cần để dò: ngày duyệt lệnh · bên thụ hưởng · số tiền ·
 * nội dung khoản (kèm STT và mã hồ sơ để mở đúng dòng trên file kế hoạch).
 */
export function buildReconBlocks(r: ReconResult, meta: { planFile: string; statementFile: string; dates: string[] }): DocBlock[] {
  const blocks: DocBlock[] = [];
  const okCount = r.matched.reduce((t, m) => t + m.plan.length, 0);

  blocks.push({
    type: "paragraph",
    text:
      `Đối chiếu ${meta.planFile} với ${meta.statementFile}${meta.dates.length ? ` — ngày duyệt lệnh: ${meta.dates.join(", ")}` : ""}. ` +
      `Kế hoạch ${okCount + r.missing.length} khoản / ${money(r.totals.planTotal)}đ; sao kê ${money(r.totals.statementTotal)}đ. ` +
      (r.missing.length === 0
        ? "Tất cả các khoản đều tìm thấy giao dịch tương ứng trên sao kê."
        : `CÓ ${r.missing.length} KHOẢN CHƯA THẤY TRÊN SAO KÊ, tổng ${money(r.totals.missingTotal)}đ — cần lập lại lệnh.`),
  });

  if (r.missing.length) {
    blocks.push({ type: "heading", level: 1, text: "Khoản chưa thanh toán được — cần lập lại lệnh" });
    blocks.push({
      type: "table",
      headers: ["STT", "Mã HS", "Ngày duyệt lệnh", "Bên thụ hưởng", "Số tiền", "Nội dung"],
      rows: r.missing.map((m) => [m.stt, m.docCode ?? "", m.approvedDate, m.beneficiary, money(m.amount), m.description]),
    });
  }

  if (r.unexpected.length) {
    blocks.push({ type: "heading", level: 1, text: "Giao dịch trên sao kê không có trong kế hoạch chi" });
    blocks.push({
      type: "table",
      headers: ["Số GD", "Ngày", "Số tiền", "Nội dung giao dịch"],
      rows: r.unexpected.map((u) => [u.ref ?? "", u.date ?? "", money(u.amount), u.content]),
    });
  }

  const warns = r.matched.filter((m) => m.warnings.length);
  if (warns.length) {
    blocks.push({ type: "heading", level: 1, text: "Đã khớp nhưng cần kế toán xác nhận lại" });
    blocks.push({
      type: "bullets",
      items: warns.map(
        (m) =>
          `${m.plan.map((x) => `${x.beneficiary} ${money(x.amount)}đ`).join(" + ")} ↔ GD ${m.statement.map((x) => `${money(x.amount)}đ`).join(" + ")}: ${m.warnings.join(" | ")}`,
      ),
    });
  }

  blocks.push({ type: "heading", level: 1, text: "Các khoản đã thanh toán thành công" });
  blocks.push({
    type: "table",
    headers: ["Bên thụ hưởng", "Số tiền", "Số GD", "Cách khớp"],
    rows: r.matched.flatMap((m) =>
      m.plan.map((x, k) => [
        x.beneficiary,
        money(x.amount),
        k === 0 ? m.statement.map((t) => t.ref ?? "").join(", ") : "",
        k === 0 ? MATCH_LABEL[m.kind] : "(cùng lệnh)",
      ]),
    ),
  });

  return blocks;
}

const MATCH_LABEL: Record<MatchKind, string> = {
  EXACT: "Khớp số tiền",
  CODE_GROUP: "Gộp lệnh (theo mã dự án)",
  ACCOUNT_GROUP: "Gộp lệnh (cùng số TK)",
  SPLIT: "Tách thành nhiều GD",
};

/**
 * Tóm tắt gọn để gửi sang AI xin nhận xét.
 * ⚠ CHE SỐ TÀI KHOẢN và KHÔNG gửi cả sao kê — chỉ gửi phần chưa khớp và phần cần xác nhận. Sao kê
 * đầy đủ mang số dư và toàn bộ dòng tiền của công ty, không có lý do gì để nó rời khỏi app.
 */
export function reconSummaryForAi(r: ReconResult): string {
  const parts: string[] = [
    `Tổng kế hoạch: ${money(r.totals.planTotal)}đ. Tổng rút ra trên sao kê: ${money(r.totals.statementTotal)}đ.`,
    `Đã khớp: ${r.matched.reduce((t, m) => t + m.plan.length, 0)} khoản. Chưa khớp: ${r.missing.length} khoản.`,
  ];
  if (r.missing.length) {
    parts.push(
      "KHOẢN CHƯA THẤY TRÊN SAO KÊ:\n" +
        r.missing.map((m) => `- ${m.beneficiary} | ${money(m.amount)}đ | ${m.projectCode ?? "không mã"} | ${m.description.slice(0, 120)}`).join("\n"),
    );
  }
  if (r.unexpected.length) {
    parts.push("GIAO DỊCH KHÔNG CÓ TRONG KẾ HOẠCH:\n" + r.unexpected.map((u) => `- ${money(u.amount)}đ | ${u.content.slice(0, 120)}`).join("\n"));
  }
  const warns = r.matched.filter((m) => m.warnings.length);
  if (warns.length) {
    parts.push(
      "ĐÃ KHỚP NHƯNG CÓ ĐIỂM CẦN LƯU Ý:\n" +
        warns.map((m) => `- ${m.plan.map((x) => x.beneficiary).join(" + ")}: ${m.warnings.join(" | ")}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}
