import "server-only";
import { prisma } from "./prisma";
import { resolveRfqTemplate, computeQuoteLineAmount, type RfqTemplate } from "./rfq-templates";
import { RFQ_OPEN_FOR_QUOTES } from "./rfq";
import { hashGuestToken } from "./guest-session";

/**
 * PUR-1 — đường GHI BÁO GIÁ dùng chung cho 3 lối vào: PUR nhập hộ, PUR lưu sau khi AI bóc, và cổng
 * NCC (guest). Để ở lib server-only chứ KHÔNG ở file "use server": mọi export của file action là
 * endpoint gọi được từ client, mà hàm này KHÔNG tự gác quyền (mỗi lối vào gác theo cách riêng —
 * quyền PUR hoặc token NCC) nên không được lộ ra làm endpoint.
 */

/** Dòng báo giá do form gửi lên — số thô, server LUÔN tính lại amount. */
export type QuoteLinePayload = { rfqLineId: string; unitPrice: number | null; quantity: number | null; extra: Record<string, unknown>; note: string | null };

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

/** Số VND/số lượng từ ô nhập: bỏ dấu chấm nghìn, phẩy thập phân → number; rỗng/rác → null. */
export function parseFormNumber(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Đọc payload dòng + điều khoản từ FormData: `<lineId>_unitPrice`, `_qty`, `_note`, `_x_<key>`, `term_<key>`. */
export function parseQuoteFormData(formData: FormData, lineIds: string[], template: RfqTemplate): { lines: QuoteLinePayload[]; terms: Record<string, unknown> } {
  const lines: QuoteLinePayload[] = lineIds.map((id) => {
    const extra: Record<string, unknown> = {};
    for (const col of template.lineColumns) {
      const raw = formData.get(`${id}_x_${col.key}`);
      if (col.type === "bool") {
        extra[col.key] = raw === "on" || raw === "true";
        continue;
      }
      if (raw == null) continue;
      if (col.type === "number") {
        const n = parseFormNumber(raw);
        if (n != null) extra[col.key] = n;
      } else {
        const s = str(raw).slice(0, 200);
        if (s) extra[col.key] = s;
      }
    }
    const noteRaw = str(formData.get(`${id}_note`));
    return { rfqLineId: id, unitPrice: parseFormNumber(formData.get(`${id}_unitPrice`)), quantity: parseFormNumber(formData.get(`${id}_qty`)), extra, note: noteRaw || null };
  });
  const terms: Record<string, unknown> = {};
  for (const tf of template.terms) {
    const raw = formData.get(`term_${tf.key}`);
    if (raw == null) continue;
    if (tf.type === "number") {
      const n = parseFormNumber(raw);
      if (n != null) terms[tf.key] = n;
    } else {
      const s = str(raw).slice(0, 1000);
      if (s) terms[tf.key] = s;
    }
  }
  return { lines, terms };
}

/**
 * Ghi báo giá của MỘT NCC. Dòng không có đơn giá (và không có khối tiền ở mẫu đặc biệt) = NCC không
 * báo → không lưu (xoá dòng cũ nếu có). `amount` LUÔN tính lại bằng computeQuoteLineAmount — không
 * tin số client. Có báo giá đầu tiên thì RFQ SENT → COMPARING (vẫn nhận thêm).
 */
export async function writeVendorQuote(opts: {
  rfqVendorId: string;
  lines: QuoteLinePayload[];
  terms: Record<string, unknown> | null;
  note: string | null;
  via: "PORTAL" | "MANUAL" | "FILE";
}): Promise<{ ok: true; written: number; rfqId: string; projectId: string } | { ok: false; error: string }> {
  const rv = await prisma.rfqVendor.findUnique({
    where: { id: opts.rfqVendorId },
    select: { id: true, rfq: { select: { id: true, status: true, groupCode: true, projectId: true, lines: { select: { id: true, quantity: true } } } } },
  });
  if (!rv) return { ok: false, error: "NOT_FOUND" };
  if (!(RFQ_OPEN_FOR_QUOTES as readonly string[]).includes(rv.rfq.status)) return { ok: false, error: "BAD_STATUS" };
  const template = resolveRfqTemplate(rv.rfq.groupCode);
  if (!template) return { ok: false, error: "NO_TEMPLATE" };
  const lineById = new Map(rv.rfq.lines.map((l) => [l.id, l]));

  const rows: { rfqLineId: string; unitPrice: bigint; quantity: number | null; amount: bigint; extraJson: string | null; note: string | null }[] = [];
  for (const p of opts.lines) {
    const line = lineById.get(p.rfqLineId);
    if (!line) continue; // dòng lạ / thuộc RFQ khác — bỏ
    const unitPrice = p.unitPrice != null && Number.isFinite(p.unitPrice) && p.unitPrice >= 0 ? Math.round(p.unitPrice) : null;
    const quantity = p.quantity != null && Number.isFinite(p.quantity) && p.quantity > 0 ? p.quantity : null;
    const extra = p.extra && typeof p.extra === "object" ? p.extra : {};
    const amount = computeQuoteLineAmount(template, { quantity: quantity ?? line.quantity, unitPrice: unitPrice ?? 0, extra });
    if (!(unitPrice != null || amount > 0)) continue;
    rows.push({
      rfqLineId: p.rfqLineId,
      unitPrice: BigInt(unitPrice ?? 0),
      quantity,
      amount: BigInt(amount),
      extraJson: Object.keys(extra).length ? JSON.stringify(extra) : null,
      note: p.note ? String(p.note).slice(0, 300) : null,
    });
  }
  if (rows.length === 0) return { ok: false, error: "NO_PRICE" };

  await prisma.$transaction([
    prisma.rfqQuoteLine.deleteMany({ where: { rfqVendorId: opts.rfqVendorId } }),
    prisma.rfqQuoteLine.createMany({ data: rows.map((r) => ({ rfqVendorId: opts.rfqVendorId, ...r })) }),
    prisma.rfqVendor.update({
      where: { id: opts.rfqVendorId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedVia: opts.via,
        termsJson: opts.terms && Object.keys(opts.terms).length ? JSON.stringify(opts.terms) : null,
        note: opts.note?.slice(0, 1000) ?? null,
      },
    }),
    prisma.rfq.updateMany({ where: { id: rv.rfq.id, status: "SENT" }, data: { status: "COMPARING" } }),
  ]);
  return { ok: true, written: rows.length, rfqId: rv.rfq.id, projectId: rv.rfq.projectId };
}

/**
 * CỔNG NCC — tra token → RfqVendor còn hiệu lực (chưa thu hồi, chưa hết hạn). Server-only, KHÔNG
 * phải server action: trả nguyên bản ghi kèm dòng báo giá, không được lộ thành endpoint.
 */
export async function loadRfqByToken(token: string) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const rv = await prisma.rfqVendor.findUnique({
    where: { tokenHash: hashGuestToken(token) },
    include: {
      vendor: { select: { name: true } },
      quoteLines: true,
      rfq: {
        include: {
          project: { select: { code: true, name: true } },
          lines: { orderBy: { sort: "asc" }, select: { id: true, itemName: true, specs: true, unit: true, quantity: true } },
        },
      },
    },
  });
  if (!rv || rv.revokedAt) return null;
  if (rv.tokenExpiresAt && rv.tokenExpiresAt.getTime() < Date.now()) return null;
  return rv;
}

// ─────────────────────────────────────────────────────────
// PUR-1b — nạp ma trận so sánh (server) — dùng chung cho trang RFQ, action AI, action chốt.
// ─────────────────────────────────────────────────────────
import { buildCompareMatrix, type CompareMatrix } from "./rfq-compare";
import { parseExtraJson } from "./rfq-templates";

export async function loadCompareMatrix(rfqId: string): Promise<CompareMatrix | null> {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    include: {
      lines: { orderBy: { sort: "asc" } },
      vendors: { include: { vendor: { select: { name: true } }, quoteLines: true } },
    },
  });
  if (!rfq) return null;
  return buildCompareMatrix(
    rfq.lines.map((l) => ({ id: l.id, itemName: l.itemName, quantity: l.quantity, unit: l.unit, refUnitPrice: l.refUnitPrice == null ? null : Number(l.refUnitPrice) })),
    rfq.vendors.map((rv) => ({
      rfqVendorId: rv.id,
      vendorName: rv.vendor.name,
      status: rv.status,
      terms: parseExtraJson(rv.termsJson),
      quotes: rv.quoteLines.map((q) => ({ rfqLineId: q.rfqLineId, unitPrice: Number(q.unitPrice), quantity: q.quantity, amount: Number(q.amount), extra: parseExtraJson(q.extraJson), note: q.note })),
    })),
  );
}

/** Ma trận → text gọn cho prompt AI (số đã tính sẵn; AI chỉ đọc). */
export function matrixToText(m: CompareMatrix): string {
  const vName = new Map(m.vendors.map((v) => [v.rfqVendorId, v.vendorName]));
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  const lines = m.lines.map((l) => {
    const cells = l.cells.map((c) => `${vName.get(c.rfqVendorId)}(id=${c.rfqVendorId}): đơn giá ${fmt(c.unitPrice)}, thành tiền ${fmt(c.amount)}${c.note ? `, ghi chú "${c.note}"` : ""}${Object.keys(c.extra).length ? `, ${Object.entries(c.extra).map(([k, v]) => `${k}=${String(v)}`).join(" ")}` : ""}`).join(" | ");
    return `- Dòng id=${l.rfqLineId} "${l.itemName}" SL ${l.quantity}${l.unit ? " " + l.unit : ""}; CO tham chiếu ${l.refAmount == null ? "n/a" : fmt(l.refAmount)}; rẻ nhất: ${l.cheapestVendorId ? vName.get(l.cheapestVendorId) + " " + fmt(l.cheapestAmount ?? 0) : "không ai báo"}; chênh ${l.spreadPct ?? "n/a"}%; vượt CO: ${l.overRef ? "CÓ" : "không"}; thiếu: ${l.missingVendorIds.map((id) => vName.get(id)).join(", ") || "không"} || ${cells || "(chưa có báo giá)"}`;
  });
  const vendors = m.vendors.map((v) => `- ${v.vendorName} (id=${v.rfqVendorId}, ${v.status}): tổng báo ${fmt(v.quotedTotal)} trên ${v.linesQuoted} dòng (coverage ${v.coveragePct}%), CO tham chiếu cùng dòng ${fmt(v.refTotalOnQuoted)}, rẻ nhất ở ${v.cheapestCount} dòng; điều khoản: ${Object.keys(v.terms).length ? Object.entries(v.terms).map(([k, x]) => `${k}=${String(x)}`).join("; ") : "(không ghi)"}`);
  return `TỔNG CO tham chiếu: ${fmt(m.refTotal)} · nếu chọn rẻ nhất từng dòng: ${fmt(m.bestMixTotal)} · dòng chưa ai báo: ${m.unquotedLines}\n\nNCC:\n${vendors.join("\n")}\n\nDÒNG:\n${lines.join("\n")}`;
}

// ─────────────────────────────────────────────────────────
// PUR-1b — LỊCH SỬ GIÁ theo NCC, tính LÚC ĐỌC từ 3 sổ (không bảng riêng): (a) báo giá RFQ đã CHỐT
// (Account đã đưa vào CO), (b) dòng CO sống đang trỏ vendorId, (c) dòng PO. Mỗi nguồn là một
// dòng độc lập — KHÔNG gộp/khử trùng giữa nguồn (cùng một hạng mục có thể xuất hiện ở cả 3 sổ, và
// đó là thông tin: giá báo → giá vào CO → giá đặt hàng thật).
// ─────────────────────────────────────────────────────────
import { parseSelection } from "./rfq-compare";

export type VendorPriceRow = {
  source: "RFQ" | "CO" | "PO";
  date: Date;
  projectCode: string;
  itemName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  ref: string; // mã RFQ / PO / "CO sống"
};

export async function loadVendorPriceHistory(vendorId: string, limit = 200): Promise<VendorPriceRow[]> {
  const [rfqVendors, coLines, poLines] = await Promise.all([
    prisma.rfqVendor.findMany({
      where: { vendorId, rfq: { status: "CONFIRMED" } },
      include: { rfq: { select: { code: true, finalJson: true, confirmedAt: true, project: { select: { code: true } } } }, quoteLines: { include: { rfqLine: { select: { id: true, itemName: true, unit: true, quantity: true } } } } },
    }),
    prisma.costLine.findMany({
      where: { vendorId, section: { costSheet: { version: "CTRACT" } } },
      select: { itemName: true, unit: true, quantity: true, unitPrice: true, amount: true, lineType: true, fixedAmount: true, section: { select: { costSheet: { select: { updatedAt: true, project: { select: { code: true } } } } } } },
      take: limit,
    }),
    prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { vendorId, status: { not: "CANCELED" } } },
      select: { itemName: true, quantity: true, unitPrice: true, amount: true, purchaseOrder: { select: { code: true, orderedAt: true, project: { select: { code: true } } } } },
      take: limit,
    }),
  ]);
  const rows: VendorPriceRow[] = [];
  for (const rv of rfqVendors) {
    const sel = parseSelection(rv.rfq.finalJson);
    for (const q of rv.quoteLines) {
      // Chỉ dòng mà Account CHỌN NCC này — dòng NCC báo nhưng không được chọn thì không phải "giá đã chốt".
      if (!sel || sel.picks[q.rfqLineId]?.rfqVendorId !== rv.id) continue;
      rows.push({ source: "RFQ", date: rv.rfq.confirmedAt ?? new Date(0), projectCode: rv.rfq.project.code, itemName: q.rfqLine.itemName, unit: q.rfqLine.unit, quantity: q.quantity ?? q.rfqLine.quantity, unitPrice: Number(q.unitPrice), amount: Number(q.amount), ref: rv.rfq.code });
    }
  }
  for (const l of coLines) {
    const unitPrice = l.lineType === "FIXED" ? Math.round(Number(l.fixedAmount ?? 0) / (l.quantity || 1)) : Number(l.unitPrice);
    rows.push({ source: "CO", date: l.section.costSheet.updatedAt, projectCode: l.section.costSheet.project.code, itemName: l.itemName, unit: l.unit, quantity: l.quantity, unitPrice, amount: Number(l.amount), ref: "CO" });
  }
  for (const l of poLines) {
    rows.push({ source: "PO", date: l.purchaseOrder.orderedAt, projectCode: l.purchaseOrder.project.code, itemName: l.itemName, unit: null, quantity: l.quantity, unitPrice: Number(l.unitPrice), amount: Number(l.amount), ref: l.purchaseOrder.code });
  }
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return rows.slice(0, limit);
}

// ─────────────────────────────────────────────────────────
// PUR-1b — AI ĐƯỢC CHỐT phương án NCC vào CO: kiểm THEO BẢN GHI (tiền lệ trưởng team Creative /
// hiring manager). `bidding.costsheet.edit` đang cấp cho 20 vai (kể cả PUR) nên chỉ mã đó thì PUR tự
// chốt được — sai câu chốt "PUR trình, Account chốt". Nay: (PIC hoặc Leader của dự án + costsheet.edit)
// HOẶC người duyệt CO (`bidding.costsheet.approve` = BGĐ/CFO). ADMIN là sàn cứng qua permissionsOf.
// ─────────────────────────────────────────────────────────
import { getCurrentStaffId } from "./current-staff";
import { getMyPermissions } from "./permissions";

export async function canConfirmRfq(projectId: string): Promise<boolean> {
  const [staffId, perms] = await Promise.all([getCurrentStaffId(), getMyPermissions()]);
  if (!staffId) return false;
  if (perms.has("bidding.costsheet.approve")) return true;
  if (!perms.has("bidding.costsheet.edit")) return false;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, leaderId: true } });
  return !!p && (p.ownerId === staffId || p.leaderId === staffId);
}
