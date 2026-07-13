import { TriangleAlert } from "lucide-react";

export function ConcentrationBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <span className="font-medium text-foreground">Cảnh báo tập trung khách hàng (FR-11)</span>{" "}
        <span className="text-muted-foreground">
          sẽ tự động bật khi module ④ Chi phí &amp; Công nợ có dữ liệu doanh thu — hiện ngưỡng mặc định đề xuất là
          40%/team.
        </span>
      </div>
    </div>
  );
}
