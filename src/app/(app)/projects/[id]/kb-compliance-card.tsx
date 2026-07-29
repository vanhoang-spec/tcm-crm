import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/lib/permissions";
import { loadCompliance, loadKbClient, loadProjectPeople } from "@/lib/client-kb-data";

/**
 * Card trên tab Tổng quan dự án: những người của dự án này đã học xong kho kiến thức của khách
 * hay chưa.
 *
 * ⚠ CẢNH BÁO MỀM — quyết định của chủ dự án. Card KHÔNG chặn nút nào, không khoá thao tác nào.
 *
 * ⚠ Radar chỉ gồm PIC + Leader + thành viên team (3 nguồn người duy nhất đang có trên model
 * Project). Nhân sự chạy hiện trường theo ca chưa vào đây vì task C2 "phân công nhân sự theo dự
 * án + ngày" chưa làm — đọc card này như một tham chiếu, không phải danh sách đầy đủ.
 *
 * Trả `null` (không render gì) khi: người xem không có quyền xem KB · dự án chưa có ai · kho của
 * khách chưa có chủ đề nào "phải đạt". Kho đang soạn dở không được bày cảnh báo đỏ ra trang dự án.
 */
export async function KbComplianceCard({ projectId }: { projectId: string }) {
  // Gác bằng `clients.kb.compliance` chứ KHÔNG phải `clients.kb.view`: card này liệt kê trạng thái
  // học của TỪNG NGƯỜI có tên. Đó đúng là thứ mà mã `compliance` sinh ra để giới hạn — gác bằng
  // `view` là đem dữ liệu 4 role được xem bày cho cả 20 role. Người học tự xem trạng thái của
  // chính mình bằng nhãn "Đã học xong" trên trang kho kiến thức.
  if (!(await hasPermission("clients.kb.compliance"))) return null;

  const proj = await loadProjectPeople(projectId);
  if (!proj || proj.people.length === 0) return null;

  const loaded = await loadKbClient(proj.clientId);
  if (!loaded) return null;

  const [t, { topics, rows }] = await Promise.all([
    getTranslations("clients.kb"),
    loadCompliance(
      loaded.anchor,
      proj.people.map((p) => p.id),
    ),
  ]);

  const requiredCount = topics.filter((x) => x.required).length;
  if (requiredCount === 0) return null;

  const byStaff = new Map(rows.map((r) => [r.staffId, r]));
  const pending = rows.filter((r) => r.status !== "PASS").length;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("cardTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("cardHint", { client: loaded.anchorName, topics: requiredCount })}
          </p>
        </div>
        <Link href={`/clients/${proj.clientId}/kb`} className="text-xs font-medium text-brand-600 hover:underline">
          {t("cardOpenKb")}
        </Link>
      </div>

      {pending > 0 && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-foreground">
          {t("cardPending", { count: pending })}
        </p>
      )}

      <ul className="mt-3 divide-y divide-border">
        {proj.people.map((p) => {
          const row = byStaff.get(p.id);
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground">{p.fullName}</span>
                {p.title && <span className="ml-2 text-xs text-muted-foreground">{p.title}</span>}
              </div>
              {row?.status === "PASS" ? (
                <Badge tone="success">{t("statusPass")}</Badge>
              ) : (
                <Badge tone="warning">
                  {t("statusPending", { passed: row?.passed ?? 0, required: row?.required ?? 0 })}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
