import { prisma } from "./prisma";
import type { ProjectStatusCode } from "./bidding";

/** Tra id của 1 status theo code cố định trong option_set "project_status" (admin đổi label, không đổi code). */
export async function getStatusId(code: ProjectStatusCode): Promise<string> {
  const item = await prisma.optionItem.findFirst({ where: { set: { code: "project_status" }, code } });
  if (!item) throw new Error(`Missing option_item project_status/${code} — run seed.`);
  return item.id;
}
