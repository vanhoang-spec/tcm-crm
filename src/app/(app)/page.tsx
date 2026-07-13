import { Users, Gavel, Briefcase, Warehouse } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const [clientCount, teamCount] = await Promise.all([
    prisma.client.count({ where: { isActive: true } }),
    prisma.team.count(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tổng quan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nền tảng vận hành nội bộ TCM — khung hệ thống đang xây dựng theo từng module.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Khách hàng đang quản lý" value={String(clientCount)} sub={`trên ${teamCount} team`} />
        <StatCard icon={Gavel} label="Bidding & Hợp đồng" value="—" sub="Module sắp triển khai" muted />
        <StatCard icon={Briefcase} label="Dự án đang chạy" value="—" sub="Module sắp triển khai" muted />
        <StatCard icon={Warehouse} label="Kho hàng" value="—" sub="Module sắp triển khai" muted />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">Lộ trình module</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Đi theo khung kiến trúc đã thống nhất: Nền tảng → ① Khách hàng (đang xây) → ② Bidding &amp; Hợp đồng →
          ③ Quản lý dự án ↔ ⑧ Kho hàng → ④ Chi phí &amp; Công nợ → ⑤ Nhân sự → ⑥ KPI/Thưởng-Phạt → ⑦ Lương.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  muted,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
