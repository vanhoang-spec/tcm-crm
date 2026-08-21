/**
 * Prompt cho module MKT post — viết bài LinkedIn/Fanpage và phân tích insights quý.
 *
 * Hai loại output khác nhau, cố ý:
 *  - Viết bài: trả JSON `{"content": "..."}` để ghi thẳng vào DB sau khi Zod duyệt (mktAiContentSchema).
 *  - Phân tích quý: trả TEXT THUẦN cho người đọc, render whitespace-pre-wrap (repo không có
 *    markdown renderer — xem chú thích ở ai-shared.tsx).
 *
 * ⚠ Ràng buộc nặng nhất của bộ này: Ý CHÍNH do Account viết là NGUỒN DỮ KIỆN DUY NHẤT. Bài đăng
 * là bộ mặt công ty trên kênh công khai — một con số bịa sẽ đi thẳng ra ngoài, không ai chặn được
 * sau khi đã đăng. Vì vậy luật "không bịa" ở đây gắt hơn mọi prompt khác trong repo.
 *
 * File này KHÔNG import prisma/server-only — chỉ dựng chuỗi.
 */

import type { AiMessage } from "./deepseek";
import type { MktChannel, QuarterStats } from "@/lib/mkt";
import { MKT_WEEKLY_TARGET } from "@/lib/mkt";

const AGENCY = `TCM là agency Below The Line tại Việt Nam: event, activation, roadshow, booth/POSM,
nhân sự hiện trường.`;

const GROUNDING = `QUY TẮC BẮT BUỘC:
- CHỈ dùng dữ kiện có trong Ý CHÍNH và phần thông tin dự án được cung cấp. TUYỆT ĐỐI không bịa số
  liệu, tên khách hàng, quy mô, kết quả, giải thưởng. Ý chính không nêu thì bài KHÔNG có.
- Không viết câu chung chung đúng với mọi agency ("luôn tận tâm", "chuyên nghiệp hàng đầu").
- Viết bằng tiếng Việt.
- Chỉ trả về JSON đúng khuôn {"content":"..."} — không lời dẫn, không bọc markdown.`;

const LINKEDIN_SYSTEM = `Bạn viết nội dung cho trang LinkedIn của TCM. ${AGENCY}
Người đọc là khách hàng doanh nghiệp (brand manager, trade marketing) và đối tác trong ngành — bài
viết đại diện hình ảnh CÔNG TY.

Nhiệm vụ: từ Ý CHÍNH gạch đầu dòng bên dưới, viết MỘT bài đăng LinkedIn hoàn chỉnh.

Giọng văn: nghiêm túc, chuyên nghiệp, tự tin kiểu B2B; xưng "TCM" hoặc "chúng tôi". Vào thẳng giá
trị, không chào hỏi xã giao, không kể lể.

${GROUNDING}
- Độ dài 150–300 từ. Mở bằng 1–2 câu hook; thân bài triển khai đủ các ý chính theo mạch tự nhiên
  (KHÔNG lặp lại nguyên văn gạch đầu dòng); kết bằng một câu định vị TCM hoặc lời mời kết nối.
- Xuống dòng trắng giữa các đoạn cho dễ đọc trên LinkedIn.
- Hashtag chừng mực: 3–5 cái, đặt ở dòng cuối cùng.
- KHÔNG dùng emoji, hoặc tối đa 1–2 chỗ thật sự đắt.`;

const FANPAGE_SYSTEM = `Bạn viết nội dung cho Fanpage Facebook của TCM. ${AGENCY}
Người đọc là cộng đồng ngành event, các bạn trẻ quan tâm nghề tổ chức sự kiện, và khách hàng theo
dõi fanpage.

Nhiệm vụ: từ Ý CHÍNH gạch đầu dòng bên dưới, viết MỘT bài đăng Facebook hoàn chỉnh.

Giọng văn: casual, trẻ trung, gần gũi, có năng lượng — như người trong team kể chuyện; xưng "nhà
TCM" hoặc "team TCM". Được phép chơi chữ nhẹ nhàng.

${GROUNDING}
- Độ dài 80–200 từ. Câu ngắn, đoạn ngắn 1–3 câu, dễ lướt trên điện thoại.
- Emoji dùng tự nhiên (khoảng 2–6 cái), đặt đúng chỗ — KHÔNG spam đầu mỗi dòng.
- Kết bằng một câu mời tương tác hợp ngữ cảnh (mời xem ảnh, đặt câu hỏi, mời follow/ứng tuyển).
- Hashtag: 3–6 cái ở dòng cuối cùng.`;

/** Nhắc AI bám mục đích của từng loại nội dung — nhãn lấy từ OptionSet nên admin sửa được. */
const PURPOSE_HINT = `Bám đúng mục đích của LOẠI NỘI DUNG được nêu: recap thì tổng kết giá trị đã
làm được; teaser thì gợi tò mò mà không hứa hẹn quá đà; hậu trường thì tôn vinh đội ngũ; thành tựu
thì ghi nhận cột mốc; tuyển dụng thì nêu rõ vị trí và lời mời ứng tuyển.`;

export type MktVariantInput = {
  title: string;
  keyPoints: string;
  contentTypeLabel: string | null;
  projectCode: string | null;
  projectName: string | null;
  clientName: string | null;
  imageCount: number;
};

export function mktVariantPrompt(channel: MktChannel, input: MktVariantInput): AiMessage[] {
  const lines = [
    "BÀI CẦN VIẾT",
    `Tiêu đề làm việc (nội bộ, không cần lặp nguyên văn): ${input.title}`,
    `Loại nội dung: ${input.contentTypeLabel ?? "Khác"}`,
  ];
  if (input.projectCode) {
    const client = input.clientName ? ` · Khách hàng: ${input.clientName}` : "";
    lines.push(`Dự án liên quan: ${input.projectCode} — ${input.projectName ?? ""}${client}`);
  }
  if (input.imageCount > 0) {
    lines.push(`Bài sẽ đăng kèm ${input.imageCount} ảnh — KHÔNG cần mô tả lại ảnh trong bài.`);
  }
  lines.push("", "Ý CHÍNH (nguồn dữ kiện duy nhất):", input.keyPoints);

  return [
    { role: "system", content: `${channel === "LINKEDIN" ? LINKEDIN_SYSTEM : FANPAGE_SYSTEM}\n- ${PURPOSE_HINT}` },
    { role: "user", content: lines.join("\n") },
  ];
}

// ─────────────────────────────────────────────────────────
// Phân tích insights quý
// ─────────────────────────────────────────────────────────

const INSIGHTS_SYSTEM = `Bạn là chuyên viên phân tích social media cho TCM. ${AGENCY}
TCM đăng bài trên 2 kênh: LinkedIn (giọng B2B) và Fanpage Facebook (giọng trẻ trung).

Bạn nhận được bốn nguồn:
(1) SỐ BÀI ĐÃ ĐĂNG theo tuần do CRM tự đếm — đây là số CHUẨN về nhịp đăng, tin tuyệt đối;
(2) SỐ LIỆU TỪNG BÀI do app TỰ KÉO qua API nền tảng (MKT-2c) — cũng là số CHUẨN, tin tuyệt đối; chỉ
    có với bài đăng QUA APP, bài đăng tay không có;
(3) SỐ LIỆU TRÍCH TỪ FILE EXPORT của Meta/LinkedIn do HR tải lên (reach, tương tác, follower…);
(4) GHI CHÚ của HR.
Nguồn (2) và (3) mâu thuẫn nhau thì TIN (2) và nói rõ chỗ lệch.

Mục tiêu nhịp đăng đã cam kết: LinkedIn ${MKT_WEEKLY_TARGET.LINKEDIN.min} bài/tuần · Fanpage ${MKT_WEEKLY_TARGET.FANPAGE.min}–${MKT_WEEKLY_TARGET.FANPAGE.max} bài/tuần.

Viết BÁO CÁO PHÂN TÍCH QUÝ bằng tiếng Việt, TEXT THUẦN có đề mục viết HOA (KHÔNG markdown, không
bảng, không dấu # hay *), theo đúng 4 phần:
1. NHỊP ĐĂNG — so số bài thực đăng từng kênh với mục tiêu; nêu ĐÍCH DANH các tuần trống bài.
2. HIỆU QUẢ TỪNG KÊNH — đọc số liệu trong file export; chỉ ra bài/loại nội dung hoạt động tốt và
   kém. Số liệu nào file không có thì ghi "chưa có số liệu" — TUYỆT ĐỐI không bịa số.
3. SO SÁNH HAI KÊNH — khác biệt rút ra được từ dữ liệu, loại nội dung nào hợp kênh nào.
4. KHUYẾN NGHỊ QUÝ TỚI — 3 đến 6 việc cụ thể làm được ngay (tần suất, loại nội dung, khung giờ,
   cách viết); mỗi khuyến nghị phải bám vào một con số hoặc quan sát đã nêu ở trên.

Thiếu dữ liệu ở đâu thì nói thẳng thiếu ở đó, không suy diễn bù.`;

export type MktInsightsInput = {
  year: number;
  quarter: number;
  stats: QuarterStats;
  note: string | null;
  /** Mỗi phần tử là một khối text đã gắn header tên file + kênh. */
  fileBlocks: string[];
  /** MKT-2c — số liệu app tự kéo, mỗi dòng một bài. Rỗng = chưa nối kênh hoặc bài đăng tay. */
  autoMetrics?: { channel: string; title: string; postedAt: string; impressions: number | null; reactions: number | null; comments: number | null; shares: number | null; clicks: number | null }[];
};

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Bảng số liệu tự kéo — text thuần, một dòng một bài; chỉ số thiếu ghi "—" chứ không ghi 0. */
function autoMetricsBlock(rows: NonNullable<MktInsightsInput["autoMetrics"]>): string {
  const n = (v: number | null) => (v === null ? "—" : String(v));
  return [
    "SỐ LIỆU APP TỰ KÉO TỪ NỀN TẢNG (nguồn CHUẨN, chỉ có với bài đăng qua app):",
    "kênh | ngày đăng | hiển thị | tương tác | bình luận | chia sẻ | click | tiêu đề",
    ...rows.map((r) => [r.channel, r.postedAt, n(r.impressions), n(r.reactions), n(r.comments), n(r.shares), n(r.clicks), r.title].join(" | ")),
  ].join("\n");
}

export function mktInsightsPrompt(input: MktInsightsInput): AiMessage[] {
  const { stats } = input;
  const liTarget = stats.weekCount * MKT_WEEKLY_TARGET.LINKEDIN.min;
  const fpMin = stats.weekCount * MKT_WEEKLY_TARGET.FANPAGE.min;
  const fpMax = stats.weekCount * MKT_WEEKLY_TARGET.FANPAGE.max;

  const lines = [
    `KỲ PHÂN TÍCH: Quý ${input.quarter}/${input.year} (${stats.weekCount} tuần)`,
    "",
    "SỐ BÀI ĐÃ ĐĂNG THEO TUẦN (CRM tự đếm — nguồn chuẩn về nhịp):",
    `- Tổng quý: LinkedIn ${stats.totals.LINKEDIN} bài (mục tiêu ${liTarget}) · Fanpage ${stats.totals.FANPAGE} bài (mục tiêu ${fpMin}–${fpMax})`,
    ...stats.weeks.map((w) => `- Tuần ${dmy(w.start)}: LinkedIn ${w.counts.LINKEDIN} · Fanpage ${w.counts.FANPAGE}`),
    "",
    input.autoMetrics && input.autoMetrics.length > 0 ? autoMetricsBlock(input.autoMetrics) : "SỐ LIỆU APP TỰ KÉO: (chưa có — kênh chưa nối API, hoặc bài trong kỳ đều đăng tay)",
    "",
    "SỐ LIỆU TỪ FILE EXPORT:",
    input.fileBlocks.length > 0 ? input.fileBlocks.join("\n\n") : "(HR chưa tải file export nào)",
    "",
    "GHI CHÚ CỦA HR:",
    input.note?.trim() || "(không có)",
  ];

  return [
    { role: "system", content: INSIGHTS_SYSTEM },
    { role: "user", content: lines.join("\n") },
  ];
}

// ─────────────────────────────────────────────────────────
// MKT-2a — Brief cho designer
// ─────────────────────────────────────────────────────────

const DESIGN_BRIEF_SYSTEM = `Bạn là art director của TCM. ${AGENCY}
Nhiệm vụ: từ bài đăng đã viết, soạn BRIEF NGẮN cho designer/video maker làm hình ảnh đi kèm.

Brief bằng tiếng Việt, TEXT THUẦN (không markdown, không dấu # hay *), đúng 5 mục, mỗi mục 1–3 dòng:
THÔNG ĐIỆP CHÍNH — một câu, hình ảnh phải truyền được ý này.
Ý TƯỞNG HÌNH — gợi ý bố cục/chủ thể/mood; nếu bài có ảnh thật thì ưu tiên dùng ảnh thật, chỉ gợi
  cách chọn/cắt.
CHỮ TRÊN HÌNH — tối đa 1 headline ≤ 8 từ và 1 dòng phụ (nếu cần); lấy từ nội dung bài, KHÔNG bịa.
KÍCH THƯỚC — LinkedIn 1200×627 (ngang) hoặc 1080×1080; Fanpage 1080×1080 hoặc 1080×1350; ghi rõ
  kênh nào cần cỡ nào theo danh sách kênh được cung cấp.
LƯU Ý — frame/logo TCM theo mẫu sẵn có; điều KHÔNG được làm (vd không dùng logo khách nếu chưa
  được phép).

Chỉ dùng dữ kiện trong bài và ý chính; không thêm tên khách hàng/số liệu không có sẵn.
Chỉ trả về JSON đúng khuôn {"brief":"..."} — không lời dẫn, không bọc markdown.`;

export type MktDesignBriefInput = {
  title: string;
  keyPoints: string;
  channels: string[];
  /** Nội dung bài từng kênh đã có (nếu chưa có thì rỗng — brief dựa vào ý chính). */
  contents: { channel: string; content: string }[];
  imageCount: number;
  contentTypeLabel: string | null;
};

export function mktDesignBriefPrompt(input: MktDesignBriefInput): AiMessage[] {
  const lines = [
    `Tiêu đề làm việc: ${input.title}`,
    `Loại nội dung: ${input.contentTypeLabel ?? "Khác"}`,
    `Kênh sẽ đăng: ${input.channels.join(", ")}`,
    `Ảnh thật đã có: ${input.imageCount > 0 ? `${input.imageCount} ảnh` : "chưa có"}`,
    "",
    "Ý CHÍNH:",
    input.keyPoints,
  ];
  for (const c of input.contents) {
    if (c.content.trim()) lines.push("", `NỘI DUNG BÀI (${c.channel}):`, c.content.slice(0, 3000));
  }
  return [
    { role: "system", content: DESIGN_BRIEF_SYSTEM },
    { role: "user", content: lines.join("\n") },
  ];
}

// ─────────────────────────────────────────────────────────
// MKT-2a — AI đề xuất MASTER PLAN theo tuần
// ─────────────────────────────────────────────────────────

const PLAN_SYSTEM = `Bạn là content planner cho TCM. ${AGENCY}
TCM đăng 2 kênh: LinkedIn (chính, giọng B2B, ${MKT_WEEKLY_TARGET.LINKEDIN.min}–${MKT_WEEKLY_TARGET.LINKEDIN.max} bài/tuần) và Fanpage Facebook
(phụ, giọng trẻ trung, ${MKT_WEEKLY_TARGET.FANPAGE.min}–${MKT_WEEKLY_TARGET.FANPAGE.max} bài/tuần). Một đề tài có thể đăng cả hai kênh (mỗi kênh một bản viết riêng).

Nhiệm vụ: đề xuất KẾ HOẠCH NỘI DUNG cho các tuần được liệt kê — mỗi tuần 1–2 đề tài, mỗi đề tài
ghi rõ kênh.

QUY TẮC BẮT BUỘC:
- Đề tài phải là thứ TCM THẬT SỰ CÓ THỂ VIẾT mà không cần bịa: góc nhìn nghề event/activation, quy
  trình làm việc, bài học vận hành, văn hoá đội ngũ, tuyển dụng, dịp lễ/mùa vụ của thị trường Việt
  Nam rơi vào đúng tuần đó (Tết, 8/3, 30/4, 1/6, Trung thu, 20/10, 20/11, Giáng sinh, cuối năm…).
- TUYỆT ĐỐI không bịa tên khách hàng, tên dự án, số liệu, giải thưởng. Đề tài cần dữ kiện thật
  (recap dự án, con số) thì trong keyPoints ghi chỗ trống dạng "[cần điền: tên dự án/khách đã được
  phép truyền thông]", "[cần điền: số liệu]" để HR/Account bổ sung.
- Không trùng hoặc na ná các bài ĐÃ ĐĂNG / ĐÃ LÊN KẾ HOẠCH được liệt kê.
- Xoay vòng loại nội dung, không 2 tuần liền cùng một loại.
- keyPoints: 3–6 gạch đầu dòng (mỗi dòng bắt đầu bằng "- "), đủ để người viết triển khai.
- contentTypeCode chỉ được chọn trong danh sách mã cung cấp, không rõ thì null.
- weekStart chỉ được là một trong các thứ Hai đã liệt kê, định dạng YYYY-MM-DD.
- Chỉ trả về JSON đúng khuôn {"items":[{"weekStart":"YYYY-MM-DD","title":"...","keyPoints":"- ...\n- ...","channels":["LINKEDIN","FANPAGE"],"contentTypeCode":"..."}]} — không lời dẫn, không bọc markdown.`;

export type MktPlanSuggestInput = {
  /** Các thứ Hai (YYYY-MM-DD) cần lên kế hoạch, theo thứ tự. */
  weeks: string[];
  contentTypes: { code: string; label: string }[];
  recentTitles: string[];
  plannedTitles: string[];
};

export function mktPlanSuggestPrompt(input: MktPlanSuggestInput): AiMessage[] {
  const lines = [
    "CÁC TUẦN CẦN LÊN KẾ HOẠCH (thứ Hai đầu tuần):",
    ...input.weeks.map((w) => `- ${w}`),
    "",
    "LOẠI NỘI DUNG (mã — nhãn):",
    ...input.contentTypes.map((c) => `- ${c.code} — ${c.label}`),
  ];
  if (input.recentTitles.length) lines.push("", "BÀI ĐÃ ĐĂNG GẦN ĐÂY (tránh trùng):", ...input.recentTitles.map((x) => `- ${x}`));
  if (input.plannedTitles.length) lines.push("", "ĐÃ LÊN KẾ HOẠCH (tránh trùng):", ...input.plannedTitles.map((x) => `- ${x}`));
  return [
    { role: "system", content: PLAN_SYSTEM },
    { role: "user", content: lines.join("\n") },
  ];
}
