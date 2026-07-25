import { buildSampleCsv } from "@/lib/inventory-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** File CSV mẫu — sinh từ chính hằng cột parser dùng, kèm BOM UTF-8 để Excel hiện tiếng Việt đúng. */
export async function GET() {
  const body = "﻿" + buildSampleCsv();
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mau-nhap-kho.csv"',
    },
  });
}
