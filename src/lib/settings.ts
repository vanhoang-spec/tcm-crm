import { prisma } from "./prisma";

/** Đọc tham số số học từ bảng setting (scope GLOBAL). Rơi về fallback nếu chưa cấu hình. */
export async function getNumberSetting(module: string, key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({
    where: { module_key_scope_scopeRef: { module, key, scope: "GLOBAL", scopeRef: "" } },
  });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
