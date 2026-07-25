/**
 * Sinh sơ đồ tổ chức (SVG, tự vẽ — không phụ thuộc d3/dagre/mermaid) từ dữ liệu `managerId` sống của
 * Staff. Layout theo CỘT DỌC theo bộ phận: khối Chủ tịch/CEO trên cùng chính giữa; bên dưới là N cột,
 * mỗi cột 1 "bucket" (bộ phận hiển thị) có tiêu đề cột. Trong mỗi cột: trưởng phòng (head) trên cùng,
 * bên dưới là nhân sự xếp theo CẤP BẬC giảm dần (Manager → Assistant Manager → Executive → Supervisor →
 * Operation), thụt lề nhẹ dưới trưởng phòng.
 *
 * Một số quy tắc HIỂN THỊ (không đụng dữ liệu DB — không có Staff/Department giả nào được tạo):
 *  • Phòng Account tách theo team thành 2 cột kề nhau: "Account 2" (team A2) và "Account 3" (team A3).
 *  • Business Development tách khỏi Production: giám đốc BD&Production (title chứa "BD") xuất hiện ở CẢ
 *    2 cột — 1 node ở cột Production, 1 node nhân bản ở cột Business Development.
 *  • Planning luôn có trưởng phòng "Planning Manager" tên "TBC (To Be Confirmed)" (node placeholder,
 *    KHÔNG lưu DB) làm head; nhân sự Planning xếp dưới TBC.
 *
 * Export ảnh (PNG qua canvas trình duyệt) và PDF (Ctrl+P) xử lý ở client (orgchart-client.tsx).
 */

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export type OrgStaffNode = {
  id: string;
  fullName: string;
  title: string | null;
  deptCode: string | null;
  deptName: string | null;
  teamCode: string | null;
  managerId: string | null;
};

type ChartNode = OrgStaffNode & { chartId: string; bucket: string; effManagerId: string | null; rank: number; isHead: boolean };
type PositionedNode = ChartNode & { x: number; y: number; color: string };

const BOX_W = 196;
const BOX_H = 62;
const ROW_GAP = 12;
const COL_GAP = 46;
const INDENT = 26;
const HEADER_GAP = 46;
const COLHEAD_H = 28; // dải tiêu đề cột phòng ban
const PAD = 24;

// Thứ tự cột từ trái sang phải (yêu cầu BGĐ). Bucket không có ai bị bỏ qua; bucket lạ thêm cuối.
const BUCKET_ORDER = ["ACCOUNT_A2", "ACCOUNT_A3", "CREATIVE", "PLANNING", "BD", "OPE", "PRO", "FIN", "PCC", "HR"];

const BUCKET_LABEL: Record<string, string> = {
  ACCOUNT_A2: "Account 2",
  ACCOUNT_A3: "Account 3",
  CREATIVE: "Creative",
  PLANNING: "Planning",
  BD: "Business Development",
  OPE: "Operations",
  PRO: "Production",
  FIN: "Accounting",
  PCC: "Purchasing",
  HR: "HR",
};

const BUCKET_COLOR: Record<string, string> = {
  HEADER: "#0068E6",
  ACCOUNT_A2: "#0B84FA",
  ACCOUNT_A3: "#0068E6",
  CREATIVE: "#16A34A",
  PLANNING: "#D97706",
  BD: "#9333EA",
  OPE: "#DC2626",
  PRO: "#7C3AED",
  FIN: "#DB2777",
  PCC: "#0891B2",
  HR: "#65A30D",
};

const TBC_PLANNING_ID = "__TBC_PLANNING__";

function bucketColor(bucket: string): string {
  return BUCKET_COLOR[bucket] ?? "#64748B";
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.slice(-2).map((w) => w[0]).join("").toUpperCase();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Cấp bậc suy từ title — cao ở trên. Head (trưởng phòng) luôn ép lên đầu cột bất kể rank. */
function titleRank(title: string | null): number {
  const t = (title ?? "").toLowerCase();
  if (/director|chief|chairman|\bceo\b|trưởng phòng|\bhead\b/.test(t)) return 60;
  if (/assistant.*manager/.test(t)) return 40; // phải kiểm TRƯỚC "manager"
  if (/senior.*manager/.test(t)) return 55;
  if (/manager/.test(t)) return 50;
  if (/senior.*(executive|exec)\b/.test(t)) return 35;
  if (/executive|exec\b/.test(t)) return 30;
  if (/supervisor/.test(t)) return 20;
  return 10; // staff / operation / helper / khác
}

function bucketOf(s: OrgStaffNode): string {
  const d = s.deptCode;
  if (d === "ACCOUNT") return s.teamCode === "A3" ? "ACCOUNT_A3" : "ACCOUNT_A2";
  if (d && ["CREATIVE", "PLANNING", "OPE", "PRO", "FIN", "PCC", "HR"].includes(d)) return d;
  return d ?? "UNASSIGNED";
}

/** Dựng cây con NỘI BỘ header (Chủ tịch → CEO) — giữ hành vi cây cũ cho riêng khối header. */
function layoutHeader(nodes: OrgStaffNode[]): { node: OrgStaffNode; row: number; depth: number }[] {
  type Local = { node: OrgStaffNode; kids: Local[] };
  const byId = new Map<string, Local>();
  for (const n of nodes) byId.set(n.id, { node: n, kids: [] });
  const roots: Local[] = [];
  for (const n of nodes) {
    const self = byId.get(n.id)!;
    const mgr = n.managerId ? byId.get(n.managerId) : undefined;
    if (mgr) mgr.kids.push(self);
    else roots.push(self);
  }
  const cmp = (a: Local, b: Local) => a.node.fullName.localeCompare(b.node.fullName, "vi");
  roots.sort(cmp);
  byId.forEach((l) => l.kids.sort(cmp));
  const out: { node: OrgStaffNode; row: number; depth: number }[] = [];
  let row = 0;
  const dfs = (l: Local, depth: number) => {
    out.push({ node: l.node, row: row++, depth });
    for (const k of l.kids) dfs(k, depth + 1);
  };
  roots.forEach((r) => dfs(r, 0));
  return out;
}

/** Xếp 1 cột: head(s) lên đầu (depth 0), phần còn lại xếp theo rank giảm dần (depth 1). */
function orderColumn(nodes: ChartNode[]): { node: ChartNode; row: number; depth: number }[] {
  const cmp = (a: ChartNode, b: ChartNode) => b.rank - a.rank || a.fullName.localeCompare(b.fullName, "vi");
  const heads = nodes.filter((n) => n.isHead).sort(cmp);
  const rest = nodes.filter((n) => !n.isHead).sort(cmp);
  const out: { node: ChartNode; row: number; depth: number }[] = [];
  let row = 0;
  for (const h of heads) out.push({ node: h, row: row++, depth: 0 });
  for (const r of rest) out.push({ node: r, row: row++, depth: 1 });
  return out;
}

function nodeBoxSvg(n: PositionedNode): string {
  const color = n.color;
  const name = xmlEscape(truncate(n.fullName, 24));
  const title = xmlEscape(truncate(n.title ?? "", 28));
  const sub = xmlEscape(truncate([n.deptName, n.teamCode].filter(Boolean).join(" · "), 30));
  const initials = xmlEscape(initialsOf(n.fullName));
  const cy = n.y + BOX_H / 2;
  const dashed = n.chartId === TBC_PLANNING_ID ? ` stroke-dasharray="5 3"` : "";
  return `<g>
    <rect x="${n.x}" y="${n.y}" width="${BOX_W}" height="${BOX_H}" rx="10" fill="#ffffff" stroke="${color}" stroke-width="1.4"${dashed}/>
    <circle cx="${n.x + 25}" cy="${cy}" r="16" fill="${color}" opacity="0.14"/>
    <text x="${n.x + 25}" y="${cy + 4.5}" font-size="11.5" font-weight="700" fill="${color}" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${initials}</text>
    <text x="${n.x + 50}" y="${n.y + 22}" font-size="12.5" font-weight="700" fill="#0F172A" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${name}</text>
    <text x="${n.x + 50}" y="${n.y + 37}" font-size="10.5" fill="#475569" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${title}</text>
    <text x="${n.x + 50}" y="${n.y + 52}" font-size="9.5" fill="#94A3B8" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${sub}</text>
  </g>`;
}

function elbowConnector(mgr: PositionedNode, child: PositionedNode): string {
  const spineX = mgr.x + 14;
  const y1 = mgr.y + BOX_H;
  const y2 = child.y + BOX_H / 2;
  return `<path d="M ${spineX} ${y1} L ${spineX} ${y2} L ${child.x} ${y2}" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>`;
}

function curveConnector(mgr: PositionedNode, child: PositionedNode): string {
  const x1 = mgr.x + BOX_W / 2;
  const y1 = mgr.y + BOX_H;
  const x2 = child.x + BOX_W / 2;
  const y2 = child.y;
  const midY = (y1 + y2) / 2;
  return `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>`;
}

/** Biến danh sách Staff thô thành các ChartNode có bucket/head/effManagerId (gồm node nhân bản BD + TBC). */
function buildChartNodes(rest: OrgStaffNode[], ceoId: string | null): ChartNode[] {
  const chart: ChartNode[] = [];
  const byBucket = new Map<string, OrgStaffNode[]>();
  for (const s of rest) {
    const b = bucketOf(s);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(s);
  }
  const cmpRankName = (a: OrgStaffNode, b: OrgStaffNode) =>
    titleRank(b.title) - titleRank(a.title) || a.fullName.localeCompare(b.fullName, "vi");

  for (const [bucket, nodes] of byBucket) {
    const idSet = new Set(nodes.map((n) => n.id));
    const heads = nodes.filter((n) => !n.managerId || !idSet.has(n.managerId)).sort(cmpRankName);
    const primaryHeadId = heads[0]?.id ?? nodes[0]?.id ?? null;
    for (const n of nodes) {
      const isHead = heads.includes(n);
      chart.push({
        ...n,
        chartId: n.id,
        bucket,
        effManagerId: isHead ? n.managerId : primaryHeadId,
        rank: titleRank(n.title),
        isHead,
      });
    }
  }

  // BD tách khỏi Production: nhân bản giám đốc BD sang cột riêng (giữ node gốc ở Production).
  // 2 ô mang 2 title riêng: cột BD ghi "Business Development Director", cột Production ghi "Production Director".
  for (const s of rest) {
    if (s.deptCode === "PRO" && /\bbd\b|business dev/i.test(s.title ?? "")) {
      chart.push({
        ...s,
        chartId: `${s.id}__BD`,
        bucket: "BD",
        title: "BD Director", // rút gọn cho vừa ô; cột đã có tiêu đề "Business Development"
        deptName: "Business Development",
        teamCode: null,
        effManagerId: s.managerId,
        rank: titleRank(s.title),
        isHead: true,
      });
      const proNode = chart.find((c) => c.chartId === s.id && c.bucket === "PRO");
      if (proNode) proNode.title = "Production Director";
    }
  }

  // Planning: chèn head placeholder "TBC" (không lưu DB); nhân sự Planning xếp dưới TBC.
  const tbc: ChartNode = {
    id: TBC_PLANNING_ID,
    chartId: TBC_PLANNING_ID,
    fullName: "TBC (To Be Confirmed)",
    title: "Planning Manager",
    deptCode: "PLANNING",
    deptName: "Planning",
    teamCode: null,
    managerId: ceoId,
    bucket: "PLANNING",
    effManagerId: ceoId,
    rank: titleRank("Planning Manager"),
    isHead: true,
  };
  chart.push(tbc);
  for (const c of chart) {
    if (c.bucket === "PLANNING" && c.chartId !== TBC_PLANNING_ID) {
      c.isHead = false;
      c.effManagerId = TBC_PLANNING_ID;
    }
  }

  return chart;
}

/** Sinh chuỗi SVG đầy đủ. */
export function buildOrgChartSvg(staff: OrgStaffNode[]): string {
  const positioned = new Map<string, PositionedNode>();

  // ── Header: nhân sự dept CEO ──
  const headerRaw = staff.filter((s) => s.deptCode === "CEO");
  const headerLaidOut = layoutHeader(headerRaw);
  const headerRowCount = headerLaidOut.length;
  const headerHeight = headerRowCount > 0 ? headerRowCount * BOX_H + (headerRowCount - 1) * ROW_GAP : 0;

  // CEO = node header được nhiều người nhất lấy làm quản lý trực tiếp (để nối các head phòng + TBC/BD về CEO).
  const mgrCount = new Map<string, number>();
  for (const s of staff) if (s.managerId) mgrCount.set(s.managerId, (mgrCount.get(s.managerId) ?? 0) + 1);
  let ceoId: string | null = headerRaw[0]?.id ?? null;
  let bestCount = -1;
  for (const h of headerRaw) {
    const c = mgrCount.get(h.id) ?? 0;
    if (c > bestCount) { bestCount = c; ceoId = h.id; }
  }

  const rest = staff.filter((s) => s.deptCode !== "CEO");
  const chart = buildChartNodes(rest, ceoId);

  const byBucket = new Map<string, ChartNode[]>();
  for (const c of chart) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket)!.push(c);
  }
  const buckets = [...byBucket.keys()].sort((a, b) => {
    const ia = BUCKET_ORDER.indexOf(a);
    const ib = BUCKET_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const columnsTop = (headerHeight > 0 ? headerHeight + HEADER_GAP : 0) + COLHEAD_H;
  const colHeaderY = (headerHeight > 0 ? headerHeight + HEADER_GAP : 0) + 16;

  let cursorX = 0;
  let maxColumnHeight = 0;
  const colHeaders: string[] = [];

  for (const bucket of buckets) {
    const ordered = orderColumn(byBucket.get(bucket)!);
    let maxDepth = 0;
    for (const { node, row, depth } of ordered) {
      maxDepth = Math.max(maxDepth, depth);
      positioned.set(node.chartId, {
        ...node,
        x: cursorX + depth * INDENT,
        y: columnsTop + row * (BOX_H + ROW_GAP),
        color: bucketColor(bucket),
      });
    }
    const columnWidth = BOX_W + maxDepth * INDENT;
    const columnHeight = ordered.length * BOX_H + (ordered.length - 1) * ROW_GAP;
    maxColumnHeight = Math.max(maxColumnHeight, columnHeight);
    const label = xmlEscape(BUCKET_LABEL[bucket] ?? bucket);
    colHeaders.push(
      `<text x="${cursorX}" y="${colHeaderY}" font-size="13" font-weight="800" fill="${bucketColor(bucket)}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${label}</text>`
    );
    cursorX += columnWidth + COL_GAP;
  }
  const totalWidth = Math.max(BOX_W, cursorX - COL_GAP);

  // Header căn giữa theo totalWidth
  for (const { node, row } of headerLaidOut) {
    positioned.set(node.id, {
      ...node,
      chartId: node.id,
      bucket: "HEADER",
      effManagerId: node.managerId,
      rank: 0,
      isHead: true,
      x: (totalWidth - BOX_W) / 2,
      y: row * (BOX_H + ROW_GAP),
      color: bucketColor("HEADER"),
    });
  }

  // ── Đường nối theo effManagerId ──
  const linkSpecs: { chartId: string; effManagerId: string | null }[] = [
    ...headerLaidOut.map((h) => ({ chartId: h.node.id, effManagerId: h.node.managerId })),
    ...chart.map((c) => ({ chartId: c.chartId, effManagerId: c.effManagerId })),
  ];
  const lines: string[] = [];
  for (const spec of linkSpecs) {
    if (!spec.effManagerId) continue;
    const child = positioned.get(spec.chartId);
    const mgr = positioned.get(spec.effManagerId);
    if (!child || !mgr) continue;
    lines.push(mgr.bucket === child.bucket ? elbowConnector(mgr, child) : curveConnector(mgr, child));
  }

  const boxes = [...positioned.values()].map(nodeBoxSvg);

  const totalHeight = columnsTop + maxColumnHeight;
  const vbW = totalWidth + PAD * 2;
  const vbH = totalHeight + PAD * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">
    <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#F6F8FB"/>
    <g transform="translate(${PAD}, ${PAD})">
      ${lines.join("")}
      ${colHeaders.join("")}
      ${boxes.join("")}
    </g>
  </svg>`;
}
