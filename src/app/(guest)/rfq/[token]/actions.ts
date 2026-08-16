"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveRfqTemplate } from "@/lib/rfq-templates";
import { RFQ_OPEN_FOR_QUOTES } from "@/lib/rfq";
import { parseQuoteFormData, writeVendorQuote, loadRfqByToken } from "@/lib/rfq-server";

export type GuestQuoteState = { error?: string; success?: boolean; declined?: boolean };

export async function submitGuestQuote(token: string, _prev: GuestQuoteState, formData: FormData): Promise<GuestQuoteState> {
  const rv = await loadRfqByToken(token);
  if (!rv) return { error: "INVALID" };
  if (!(RFQ_OPEN_FOR_QUOTES as readonly string[]).includes(rv.rfq.status)) return { error: "CLOSED" };
  const template = resolveRfqTemplate(rv.rfq.groupCode);
  if (!template) return { error: "GENERIC" };
  const { lines, terms } = parseQuoteFormData(formData, rv.rfq.lines.map((l) => l.id), template);
  const note = String(formData.get("vendorNote") ?? "").trim() || null;
  const res = await writeVendorQuote({ rfqVendorId: rv.id, lines, terms, note, via: "PORTAL" });
  if (!res.ok) return { error: res.error === "NO_PRICE" ? "NO_PRICE" : res.error === "BAD_STATUS" ? "CLOSED" : "GENERIC" };

  await prisma.auditLog.create({
    data: { entityType: "rfq", entityId: rv.rfq.id, field: "*", newValue: JSON.stringify({ rfqVendorId: rv.id, via: "PORTAL", written: res.written }), action: "QUOTE_SAVE", changedBy: null },
  });
  // Báo người tạo RFQ — tiêu đề Notification hardcode tiếng Việt (ngoại lệ đã thống nhất §4.2).
  const rfq = await prisma.rfq.findUnique({ where: { id: rv.rfq.id }, select: { code: true, createdById: true, projectId: true } });
  if (rfq?.createdById) {
    await prisma.notification.create({
      data: { recipientStaffId: rfq.createdById, type: "RFQ_QUOTE_RECEIVED", title: `NCC ${rv.vendor.name} đã gửi báo giá — ${rfq.code}`, body: `${res.written} dòng có giá`, projectId: rfq.projectId },
    });
  }
  revalidatePath(`/purchasing/rfq/${rv.rfq.id}`);
  revalidatePath("/purchasing");
  return { success: true };
}

export async function declineGuestQuote(token: string, _prev: GuestQuoteState, _fd: FormData): Promise<GuestQuoteState> {
  const rv = await loadRfqByToken(token);
  if (!rv) return { error: "INVALID" };
  if (!(RFQ_OPEN_FOR_QUOTES as readonly string[]).includes(rv.rfq.status)) return { error: "CLOSED" };
  await prisma.rfqVendor.update({ where: { id: rv.id }, data: { status: "DECLINED" } });
  await prisma.auditLog.create({
    data: { entityType: "rfq", entityId: rv.rfq.id, field: "*", newValue: JSON.stringify({ rfqVendorId: rv.id, via: "PORTAL" }), action: "VENDOR_DECLINED", changedBy: null },
  });
  revalidatePath(`/purchasing/rfq/${rv.rfq.id}`);
  return { declined: true };
}
