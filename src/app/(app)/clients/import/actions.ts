"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getStatusId } from "@/lib/project-status";
import { generateProjectCode } from "@/lib/bidding";
import {
  parseClientsExcel,
  type ParsedClientRow,
  type ClientImportWarning,
  type ImportProjectStatus,
} from "@/lib/clients-import";
import { requirePermission } from "@/lib/permissions";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — file thật ~30KB, dư sức chứa vài năm cập nhật thêm
const IMPORT_FISCAL_YEAR = 2026; // toàn bộ dữ liệu nguồn là "tính đến tháng 7/2026" — không có ngày ký hợp đồng thật để suy fiscalYear khác

export type ImportPreview = {
  clients: ParsedClientRow[];
  warnings: ClientImportWarning[];
  totalProjects: number;
  teamUnassignedCount: number;
  existingCodeCount: number; // số mã đã tồn tại trong DB — sẽ CẬP NHẬT (chỉ điền chỗ trống), không tạo trùng
};

export type ImportResult = {
  clientsCreated: number;
  clientsUpdated: number;
  contactsCreated: number;
  projectsCreated: number;
  careNotesCreated: number;
};

export type ImportState = {
  fatalError?: string;
  error?: string;
  preview?: ImportPreview;
  result?: ImportResult;
};

async function readUploadedFile(formData: FormData): Promise<{ buffer: Buffer; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { buffer: Buffer.alloc(0), error: "MISSING_FILE" };
  if (file.size > MAX_FILE_BYTES) return { buffer: Buffer.alloc(0), error: "FILE_TOO_LARGE" };
  return { buffer: Buffer.from(await file.arrayBuffer()) };
}

/**
 * 1 form, 2 chế độ (nút "Xem trước" / nút "Xác nhận nhập" — cùng field `file`, trình duyệt giữ
 * nguyên file đã chọn qua nhiều lần submit của cùng 1 form chưa reset). Chế độ "preview" CHỈ đọc
 * và validate, KHÔNG ghi DB — để người duyệt xem đúng dữ liệu trước khi bấm xác nhận thật.
 */
export async function importClientsFromExcel(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requirePermission("clients.import");
  const { buffer, error } = await readUploadedFile(formData);
  if (error) return { error };

  const parsed = await parseClientsExcel(buffer);
  if (parsed.fatalError) return { fatalError: parsed.fatalError };

  const mode = String(formData.get("mode") ?? "preview");

  if (mode !== "confirm") {
    const existingCodes = await prisma.client.findMany({
      where: { code: { in: parsed.clients.map((c) => c.code) } },
      select: { code: true },
    });
    return {
      preview: {
        clients: parsed.clients,
        warnings: parsed.warnings,
        totalProjects: parsed.clients.reduce((s, c) => s + c.projects.length, 0),
        teamUnassignedCount: parsed.clients.filter((c) => !c.teamCode).length,
        existingCodeCount: existingCodes.length,
      },
    };
  }

  const result = await commitImport(parsed.clients);
  revalidatePath("/clients");
  return { result };
}

async function commitImport(clients: ParsedClientRow[]): Promise<ImportResult> {
  const staffId = await getCurrentStaffId();

  const [teams, potentialStatus, complexityMedium, projectStatusIds] = await Promise.all([
    prisma.team.findMany({ select: { id: true, code: true } }),
    prisma.optionItem.findFirst({ where: { set: { code: "client_status" }, code: "POTENTIAL" } }),
    prisma.optionItem.findFirst({ where: { set: { code: "complexity" }, code: "MEDIUM" } }),
    Promise.all(
      (["BIDDING", "PROCESSING", "LIQUIDATION"] as ImportProjectStatus[]).map(async (code) => [code, await getStatusId(code)] as const),
    ),
  ]);
  if (!potentialStatus) throw new Error("Missing option_item client_status/POTENTIAL — run seed.");
  if (!complexityMedium) throw new Error("Missing option_item complexity/MEDIUM — run seed.");
  const teamIdByCode = new Map(teams.map((t) => [t.code, t.id]));
  const statusIdByCode = new Map(projectStatusIds);

  let clientsCreated = 0;
  let clientsUpdated = 0;
  let contactsCreated = 0;
  let projectsCreated = 0;
  let careNotesCreated = 0;

  // Tuần tự từng khách (không Promise.all) — generateProjectCode đếm project theo fiscalYear nên
  // 2 lần tạo song song có thể sinh trùng seq; import 1 lần, không cần tối ưu tốc độ.
  for (const row of clients) {
    const ownerTeamId = row.teamCode ? (teamIdByCode.get(row.teamCode) ?? null) : null;

    const clientId = await prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { code: row.code } });
      let id: string;

      if (existing) {
        // Đã có (thường trùng với khách demo/nhập tay trước đó) — CHỈ điền các trường đang trống,
        // không ghi đè dữ liệu ai đó đã nhập tay. Không đổi statusId (đã có do recomputeClientStatus).
        const fill: Record<string, string> = {};
        if (!existing.legalNameVi && row.legalNameVi) fill.legalNameVi = row.legalNameVi;
        if (!existing.legalNameEn && row.legalNameEn) fill.legalNameEn = row.legalNameEn;
        if (!existing.ownerTeamId && ownerTeamId) fill.ownerTeamId = ownerTeamId;
        if (Object.keys(fill).length > 0) await tx.client.update({ where: { id: existing.id }, data: fill });
        id = existing.id;
        clientsUpdated++;
      } else {
        const brand = await tx.brand.upsert({ where: { name: row.name }, update: {}, create: { name: row.name } });
        const created = await tx.client.create({
          data: {
            code: row.code,
            name: row.name,
            legalNameVi: row.legalNameVi,
            legalNameEn: row.legalNameEn,
            brandId: brand.id,
            statusId: potentialStatus.id,
            ownerTeamId,
            isNew: false, // quan hệ đã có sẵn trong hồ sơ Sales, không phải khách hoàn toàn mới
          },
        });
        id = created.id;
        clientsCreated++;
      }

      if (row.pic1) {
        const contactCount = await tx.contact.count({ where: { clientId: id } });
        await tx.contact.create({
          data: {
            clientId: id,
            name: row.pic1.name,
            title: row.pic1.title,
            phone: row.pic1.phone,
            email: row.pic1.email,
            isPrimary: contactCount === 0,
          },
        });
        contactsCreated++;
      }

      for (const proj of row.projects) {
        const code = await generateProjectCode(tx, row.code, row.teamCode ?? "X", IMPORT_FISCAL_YEAR);
        await tx.project.create({
          data: {
            code,
            name: proj.name,
            clientId: id,
            ownerTeamId,
            statusId: statusIdByCode.get(proj.statusCode)!,
            complexityId: complexityMedium.id,
            fiscalYear: IMPORT_FISCAL_YEAR,
            briefLinkUrl: null,
          },
        });
        projectsCreated++;

        if (proj.detail || proj.nextStep) {
          const noteParts = [`[Dự án: ${proj.name}]`];
          if (proj.detail) noteParts.push(proj.detail);
          if (proj.nextStep) noteParts.push(`Next step: ${proj.nextStep}`);
          await tx.careNote.create({ data: { clientId: id, note: noteParts.join(" — "), staffId } });
          careNotesCreated++;
        }
      }

      return id;
    });
    void clientId;
  }

  await prisma.auditLog.create({
    data: {
      entityType: "client_import",
      entityId: "bulk",
      field: "*",
      action: "IMPORT",
      changedBy: staffId,
      newValue: JSON.stringify({ clientsCreated, clientsUpdated, contactsCreated, projectsCreated, careNotesCreated }),
    },
  });

  return { clientsCreated, clientsUpdated, contactsCreated, projectsCreated, careNotesCreated };
}
