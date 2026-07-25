/**
 * Bộ prompt cho trợ lý AI của TCM.
 *
 * Nguyên tắc xuyên suốt (áp cho MỌI prompt ở đây):
 *  1. Số liệu do CRM cung cấp là SỰ THẬT DUY NHẤT. Model không được bịa số, không tự suy ra
 *     doanh thu/margin/ngày tháng nếu dữ liệu không có — phải nói "không có dữ liệu".
 *  2. Không bịa tên thương hiệu, tên chiến dịch, tên đối thủ, số liệu thị trường. Đây là điểm
 *     nguy hiểm nhất: BGĐ có thể ra quyết định dựa trên case study không có thật.
 *  3. Trả lời bằng tiếng Việt (trừ khi được yêu cầu khác), giọng đồng nghiệp chuyên môn, ngắn gọn.
 *
 * File này KHÔNG import prisma/server-only — chỉ dựng chuỗi, để test được độc lập.
 */

/** Bối cảnh công ty, chèn vào mọi system prompt để model không cần đoán TCM là ai. */
const TCM_CONTEXT = `Bạn là trợ lý nội bộ của TCM (Targeted Marketing) — agency chuyên Below The Line tại Việt Nam:
sự kiện (event), activation, roadshow, dựng booth/POSM, nhân sự hiện trường (PG/PB).
Quy mô ~42 nhân sự, 3 team Account (A1/A2/A3), các bộ phận: Planning, Creative, Operations, Production, Purchasing, Finance, HR.
Thuật ngữ nội bộ dùng nguyên tiếng Việt: CO (chi phí nội bộ/giá vốn), CE (giá chào khách), CECO, chi hộ, nghiệm thu, thực chi, make-up (nâng giá từ CO ra CE).`;

const NO_FABRICATION = `QUY TẮC BẮT BUỘC:
- Chỉ dùng số liệu được cung cấp trong phần DỮ LIỆU. Tuyệt đối KHÔNG bịa thêm con số nào.
- Nếu thiếu dữ liệu để kết luận, hãy nói rõ "chưa đủ dữ liệu" thay vì đoán.
- KHÔNG bịa tên thương hiệu, tên chiến dịch, tên đối thủ, hay số liệu thị trường.
- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc. Không mở đầu khách sáo.`;

// ───────────────────────── 1. Phân tích CO/CE + đề xuất make-up ─────────────────────────

export type CostSheetSnapshot = {
  projectCode: string;
  projectName: string;
  clientName: string | null;
  projectType: string | null;
  coTotal: number;
  ceTotal: number;
  chiHo: number;
  vatPct: number;
  marginPct: number;
  minMarginPct: number;
  sections: {
    name: string;
    isProxy: boolean;
    lines: { itemName: string; specs: string | null; quantity: number; unit: string | null; unitPrice: number; amount: number; isLocked: boolean; maxMarkupPct: number | null }[];
  }[];
};

export function costSheetAnalysisPrompt(snap: CostSheetSnapshot) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: rà soát bảng CO/CE (dự toán) của một dự án và đưa ra nhận định giúp Account bảo vệ được báo giá trước khách hàng.

${NO_FABRICATION}

Bối cảnh nghiệp vụ quan trọng:
- CO = tổng chi phí nội bộ (giá vốn thật TCM phải trả).
- CE = giá chào khách. Margin = (CE - CO) / CE.
- "Chi hộ" nằm NGOÀI margin, không được tính vào phần lời.
- Ngưỡng margin tối thiểu của TCM là ${snap.minMarginPct}%.
- Khách hàng ngày nay THƯỜNG DÙNG AI để rà soát báo giá. Vì vậy phần make-up (nâng giá từ CO ra CE)
  phải trông hợp lý theo giá thị trường: không có dòng nào bị đội giá lố so với mặt bằng chung,
  không có đơn giá tròn trịa bất thường, không có hạng mục mơ hồ kiểu "chi phí khác".

Hãy phân tích theo đúng 4 mục sau, dùng markdown:

## 1. Tình trạng margin
Nêu margin hiện tại, so với ngưỡng ${snap.minMarginPct}%, đạt hay không đạt và thiếu bao nhiêu tiền để đạt.

## 2. Dòng có rủi ro khi khách rà soát
Liệt kê các dòng đáng ngờ (đơn giá lệch mặt bằng, mô tả mơ hồ, số lượng bất thường, giá tròn trịa lộ liễu).
Với mỗi dòng: tên dòng — vấn đề — cách chỉnh cho hợp lý. Nếu không có dòng nào đáng ngại, nói rõ như vậy.

## 3. Đề xuất make-up CO → CE
Đề xuất phân bổ phần chênh lệch vào các dòng nào, tỷ lệ bao nhiêu, và LÝ DO nghiệp vụ cho từng dòng
(vd: dòng nhân sự/vận hành chịu markup cao hơn được vì có rủi ro phát sinh; dòng thiết bị thuê ngoài
markup thấp vì khách dễ tra giá). Tránh markup đều tay mọi dòng — dễ bị nhận ra.
Lưu ý: dòng bị khoá (isLocked) KHÔNG được đổi giá; dòng có maxMarkupPct không được vượt trần đó.

## 4. Hạng mục còn thiếu
Dựa trên loại hình dự án, chỉ ra hạng mục chi phí thường có mà bảng này đang thiếu (dễ bị lỗ khi phát sinh).

Không viết lại toàn bộ bảng. Không thêm phần kết luận dài dòng.`;

  const user = `DỮ LIỆU BẢNG CO/CE (số tiền đơn vị VND):

Dự án: ${snap.projectCode} — ${snap.projectName}
Khách hàng: ${snap.clientName ?? "chưa có"}
Loại hình: ${snap.projectType ?? "chưa phân loại"}

Tổng CO (giá vốn): ${snap.coTotal.toLocaleString("vi-VN")}
Tổng CE (giá chào khách): ${snap.ceTotal.toLocaleString("vi-VN")}
Chi hộ (ngoài margin): ${snap.chiHo.toLocaleString("vi-VN")}
VAT: ${snap.vatPct}%
Margin hiện tại: ${snap.marginPct.toFixed(2)}%
Ngưỡng tối thiểu: ${snap.minMarginPct}%

CHI TIẾT TỪNG HẠNG MỤC:
${snap.sections
  .map(
    (s) =>
      `\n### ${s.name}${s.isProxy ? " (CHI HỘ — ngoài margin)" : ""}\n` +
      s.lines
        .map(
          (l) =>
            `- ${l.itemName}${l.specs ? ` (${l.specs})` : ""} | SL ${l.quantity} ${l.unit ?? ""} | đơn giá ${l.unitPrice.toLocaleString("vi-VN")} | thành tiền ${l.amount.toLocaleString("vi-VN")}` +
            (l.isLocked ? " | ĐÃ KHOÁ, không đổi giá" : "") +
            (l.maxMarkupPct != null ? ` | trần markup ${l.maxMarkupPct}%` : ""),
        )
        .join("\n"),
  )
  .join("\n")}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ───────────────────────── 2. Brainstorm idea / concept ─────────────────────────

export type BrainstormInput = {
  projectName: string;
  clientName: string | null;
  industry: string | null;
  projectType: string | null;
  scale: string | null;
  venue: string | null;
  budget: number | null;
  briefText: string;
  /** Nội dung trích từ file đính kèm dự án (mời thầu/khách gửi) — null nếu dự án chưa có file nào. */
  attachmentsText: string | null;
};

/** Khối "TÀI LIỆU ĐÍNH KÈM" dùng chung cho Brainstorm/Content/Canva — cùng 1 nguồn ProjectFile. */
function attachmentsBlock(attachmentsText: string | null): string {
  return attachmentsText ? `\n\nTÀI LIỆU DỰ ÁN ĐÍNH KÈM (mời thầu / khách gửi):\n${attachmentsText}` : "";
}

export function brainstormPrompt(input: BrainstormInput) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: cùng team Planning/Creative brainstorm ý tưởng cho một dự án BTL.

QUY TẮC:
- Nếu có TÀI LIỆU ĐÍNH KÈM (mời thầu/khách gửi), đó là nguồn đề bài QUAN TRỌNG NHẤT — bám sát yêu
  cầu trong đó, không lặp lại chung chung. Nếu tài liệu ghi "không đọc được nội dung", nói rõ cần
  Account cung cấp lại nội dung dạng text/PDF/DOCX để đọc được.
- KHÔNG bịa tên chiến dịch có thật của thương hiệu khác để làm ví dụ. Nếu muốn nêu tham chiếu,
  hãy mô tả DẠNG THỨC (vd "kiểu photobooth tương tác dùng cảm biến") thay vì gán cho brand cụ thể.
- Ý tưởng phải thi công được trong điều kiện thực tế Việt Nam (vật tư, nhân sự, mặt bằng, thời tiết).
- Cân nhắc ngân sách nếu có. Nếu ý tưởng vượt ngân sách, nói rõ.
- Trả lời tiếng Việt, dùng markdown.

Cấu trúc trả lời:

## Insight & hướng tiếp cận
2-3 câu về insight người tiêu dùng và góc tiếp cận.

## 3 concept đề xuất
Mỗi concept gồm: **Tên concept** — big idea 1 câu — trải nghiệm chính của khách tham dự —
hạng mục thi công chính — điểm mạnh — rủi ro cần lưu ý.

## Hoạt động tương tác gợi ý
Danh sách ngắn các minigame/hoạt động phù hợp.

## Điểm cần làm rõ với khách
Các câu hỏi Account nên hỏi lại khách trước khi đi sâu.`;

  const user = `THÔNG TIN DỰ ÁN:
Tên dự án: ${input.projectName}
Khách hàng: ${input.clientName ?? "chưa có"}
Ngành hàng: ${input.industry ?? "chưa rõ"}
Loại hình: ${input.projectType ?? "chưa rõ"}
Quy mô: ${input.scale ?? "chưa rõ"}
Địa điểm: ${input.venue ?? "chưa rõ"}
Ngân sách: ${input.budget ? input.budget.toLocaleString("vi-VN") + " VND" : "chưa có"}

BRIEF TỪ KHÁCH / GHI CHÚ NỘI BỘ:
${input.briefText || "(chưa có nội dung brief — hãy nêu rõ cần bổ sung gì)"}${attachmentsBlock(input.attachmentsText)}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ───────────────────────── 2b. Viết bài / Content ─────────────────────────

export type ContentWriterInput = BrainstormInput;

export function contentWriterPrompt(input: ContentWriterInput) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: soạn thảo nội dung (content) truyền thông cho một dự án BTL — dùng để Account gửi khách
duyệt, hoặc Planning/HR dùng làm nội dung truyền thông nội bộ (event nội bộ công ty).

QUY TẮC:
- Nếu có TÀI LIỆU ĐÍNH KÈM (mời thầu/khách gửi), bám sát thông điệp/tone giọng yêu cầu trong đó.
- KHÔNG bịa số liệu, giải thưởng, đối tác, hay câu trích dẫn của ai đó chưa được cung cấp.
- Văn phong tiếng Việt tự nhiên, đúng ngữ cảnh sự kiện/activation — không sáo rỗng kiểu quảng cáo rẻ tiền.
- Trả lời tiếng Việt, markdown.

Cấu trúc trả lời:

## Thông điệp chính
1-2 câu key message xuyên suốt.

## Caption ngắn (mạng xã hội)
2-3 phương án caption ngắn, có thể kèm gợi ý hashtag.

## Nội dung dài (email/proposal/thông báo nội bộ)
1 đoạn nội dung đầy đủ hơn, sẵn sàng dùng luôn hoặc chỉnh nhẹ.

## Call-to-action
Câu kêu gọi hành động phù hợp với mục đích nội dung.`;

  const user = `THÔNG TIN DỰ ÁN:
Tên dự án: ${input.projectName}
Khách hàng: ${input.clientName ?? "chưa có"}
Ngành hàng: ${input.industry ?? "chưa rõ"}
Loại hình: ${input.projectType ?? "chưa rõ"}

BRIEF / GHI CHÚ YÊU CẦU NỘI DUNG:
${input.briefText || "(chưa có nội dung brief — hãy nêu rõ cần bổ sung gì)"}${attachmentsBlock(input.attachmentsText)}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ───────────────────────── 3. Brief thiết kế + prompt cho Canva AI ─────────────────────────

export type CanvaBriefInput = {
  projectName: string;
  clientName: string | null;
  projectType: string | null;
  deliverable: string;
  /** Ghi chú/định hướng thêm của người yêu cầu — optional, khác `conceptText` cũ (không còn bắt buộc). */
  note: string | null;
  briefLinkUrl: string | null;
  attachmentsText: string | null;
};

/**
 * Đầu ra là 1 HOẶC NHIỀU prompt tiếng ANH để dán thẳng vào Canva AI (Magic Design/Text-to-Image) —
 * khác các tool khác của module này (luôn trả lời tiếng Việt). Lý do: Canva AI hiểu prompt tiếng Anh
 * tốt hơn hẳn tiếng Việt (ít lệch bố cục/chữ bị lỗi font). Phần nhãn/hướng dẫn quanh prompt vẫn tiếng
 * Việt để designer TCM đọc hiểu ngay.
 */
export function canvaBriefPrompt(input: CanvaBriefInput) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: đọc thông tin dự án (kèm tài liệu đính kèm nếu có) rồi soạn PROMPT TIẾNG ANH để designer
dán trực tiếp vào Canva AI (Magic Design / Text to Image) tạo thiết kế.

QUY TẮC BẮT BUỘC:
- Nếu có TÀI LIỆU ĐÍNH KÈM (mời thầu/khách gửi), ĐÓ LÀ NGUỒN THẬT DUY NHẤT cho nội dung/thông điệp/
  brand — không bịa thêm mã màu, slogan, hay chi tiết không có trong tài liệu hoặc phần ghi chú.
  Nếu tài liệu ghi "không đọc được nội dung", coi như CHƯA CÓ tài liệu — không suy đoán nội dung.
- KHÔNG bịa mã màu thương hiệu của khách nếu không được cung cấp — ghi "use client's brand
  guideline colors (not specified — placeholder palette below)" và tự đề xuất palette trung tính.
- Mỗi PROMPT phải tự đầy đủ (self-contained): chủ thể, bố cục, phong cách hình ảnh, tông màu, và
  CHÍNH XÁC đoạn text cần xuất hiện trên thiết kế (đặt trong ngoặc kép).
- Nếu hạng mục cần nhiều thiết kế khác nhau (vd vừa key visual vừa social post), tách thành NHIỀU
  prompt đánh số riêng — mỗi prompt cho đúng 1 sản phẩm thiết kế.
- Trả lời markdown, cấu trúc:

## Ghi chú cho designer (tiếng Việt)
1-2 câu tóm tắt bối cảnh + lưu ý khi dùng prompt (vd "cần thay logo tay sau khi xuất từ Canva AI").

## Prompt 1: <tên sản phẩm thiết kế, tiếng Việt>
\`\`\`
<toàn bộ nội dung prompt bằng TIẾNG ANH, sẵn sàng dán vào Canva AI>
\`\`\`

(Lặp lại "## Prompt N: ..." nếu cần nhiều thiết kế. Nếu chỉ 1 sản phẩm thì chỉ có Prompt 1.)

## Checklist trước khi gửi duyệt (tiếng Việt)
Danh sách ngắn designer phải tự kiểm sau khi Canva AI tạo xong (logo thật, chính tả, kích thước xuất).`;

  const user = `Dự án: ${input.projectName}
Khách hàng: ${input.clientName ?? "chưa có"}
Loại hình dự án: ${input.projectType ?? "chưa rõ"}
Hạng mục cần thiết kế: ${input.deliverable}
${input.briefLinkUrl ? `Link brief khách gửi: ${input.briefLinkUrl}\n` : ""}${input.note ? `Ghi chú/định hướng thêm: ${input.note}\n` : ""}${attachmentsBlock(input.attachmentsText)}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ───────────────────────── 4. Báo cáo BGĐ ─────────────────────────

export type BoardReportInput = {
  generatedAt: string;
  minMarginPct: number;
  projects: { code: string; name: string; team: string | null; status: string; ceTotal: number | null; marginPct: number | null; endDate: string | null; overdueItems: number }[];
  overdueTimeline: { projectCode: string; title: string; dueDate: string; owner: string | null; daysLate: number }[];
  arOverdue: { clientName: string; invoiceNo: string; amount: number; dueDate: string; daysLate: number }[];
  careOverdue: { clientName: string; team: string | null; lastCareAt: string | null; daysSince: number | null }[];
  advancesOutstanding: { staffName: string; count: number; amount: number }[];
};

export function boardReportPrompt(input: BoardReportInput) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: viết báo cáo ngắn cho Ban Giám đốc dựa trên dữ liệu vận hành thật lấy từ CRM.

${NO_FABRICATION}
- KHÔNG dự đoán doanh thu tương lai. Chỉ nhận định trên số đang có.
- Ưu tiên nêu việc CẦN QUYẾT ĐỊNH hơn là mô tả lại số liệu.

Cấu trúc (markdown, tổng cộng không quá 500 từ):

## Tổng quan
3-4 gạch đầu dòng về tình hình chung.

## Cảnh báo cần xử lý ngay
Xếp theo mức độ nghiêm trọng. Mỗi mục: vấn đề — con số cụ thể — ai chịu trách nhiệm — đề xuất hành động.
Đặc biệt lưu ý: dự án margin dưới ngưỡng ${input.minMarginPct}%, hạng mục trễ tiến độ, công nợ quá hạn, tạm ứng chưa hoàn.

## Chăm sóc khách hàng theo team
So sánh 3 team Account, chỉ ra team nào đang bỏ rơi khách và khách nào cần liên hệ gấp.

## Đề xuất cho tuần tới
Tối đa 5 việc cụ thể, có thể giao được ngay.`;

  const fmt = (n: number) => n.toLocaleString("vi-VN");
  const user = `DỮ LIỆU VẬN HÀNH (chốt lúc ${input.generatedAt}, tiền VND):

## Dự án đang chạy (${input.projects.length})
${input.projects.length === 0 ? "(không có)" : input.projects.map((p) => `- ${p.code} ${p.name} | team ${p.team ?? "chưa giao"} | ${p.status} | CE ${p.ceTotal != null ? fmt(p.ceTotal) : "chưa có"} | margin ${p.marginPct != null ? p.marginPct.toFixed(1) + "%" : "chưa có"} | kết thúc ${p.endDate ?? "chưa đặt"} | ${p.overdueItems} hạng mục trễ`).join("\n")}

## Hạng mục timeline trễ hạn (${input.overdueTimeline.length})
${input.overdueTimeline.length === 0 ? "(không có)" : input.overdueTimeline.map((t) => `- ${t.projectCode}: ${t.title} | hạn ${t.dueDate} | trễ ${t.daysLate} ngày | team ${t.owner ?? "chưa gán"}`).join("\n")}

## Công nợ quá hạn (${input.arOverdue.length})
${input.arOverdue.length === 0 ? "(không có)" : input.arOverdue.map((a) => `- ${a.clientName} | HĐ ${a.invoiceNo} | ${fmt(a.amount)} | hạn ${a.dueDate} | trễ ${a.daysLate} ngày`).join("\n")}

## Khách hàng quá hạn chăm sóc (${input.careOverdue.length})
${input.careOverdue.length === 0 ? "(không có)" : input.careOverdue.map((c) => `- ${c.clientName} | team ${c.team ?? "chưa giao"} | lần cuối ${c.lastCareAt ?? "chưa từng"} | ${c.daysSince != null ? c.daysSince + " ngày trước" : "—"}`).join("\n")}

## Tạm ứng chưa hoàn (${input.advancesOutstanding.length})
${input.advancesOutstanding.length === 0 ? "(không có)" : input.advancesOutstanding.map((a) => `- ${a.staffName} | ${a.count} khoản | ${fmt(a.amount)}`).join("\n")}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ───────────────────────── 5. Xu hướng ngành (CÓ GIỚI HẠN) ─────────────────────────

/**
 * ⚠ QUAN TRỌNG: DeepSeek KHÔNG truy cập internet. Tính năng này chạy hoàn toàn bằng kiến thức
 * đã được huấn luyện, nên KHÔNG phải là tin tức mới và KHÔNG có case study kiểm chứng được.
 * Prompt dưới đây ép model nói rõ giới hạn đó và cấm bịa tên chiến dịch/thương hiệu — nếu không,
 * BGĐ rất dễ đọc phải case study không có thật rồi ra quyết định sai.
 */
/**
 * Bản CÓ NGUỒN THẬT: dùng khi đã cấu hình tìm kiếm web (xem lib/ai/websearch.ts).
 * Model chỉ được kết luận từ trích đoạn đưa vào, và bắt buộc dẫn link để người đọc tự kiểm chứng.
 */
export function industryTrendGroundedPrompt(
  question: string,
  sources: { title: string; url: string; content: string; publishedDate: string | null }[],
) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: trả lời câu hỏi về ngành event/activation (BTL) DỰA TRÊN các nguồn web được cung cấp bên dưới.

QUY TẮC BẮT BUỘC:
- Chỉ kết luận từ nội dung trong phần NGUỒN. KHÔNG thêm số liệu, tên thương hiệu, tên chiến dịch
  nào không xuất hiện trong nguồn.
- MỖI nhận định lấy từ nguồn phải kèm link ngay sau đó, dạng [tên nguồn](url).
- Nếu các nguồn không đủ trả lời, nói thẳng "các nguồn tìm được chưa trả lời được ý này" thay vì suy đoán.
- Nếu nguồn mâu thuẫn nhau, nêu rõ cả hai phía.
- Phân biệt rõ đâu là THÔNG TIN TỪ NGUỒN và đâu là NHẬN ĐỊNH NGHỀ của bạn (đánh dấu rõ ràng).
- Trả lời tiếng Việt, markdown.

Cấu trúc:

## Tóm tắt
3-5 gạch đầu dòng trả lời thẳng câu hỏi, mỗi ý kèm link nguồn.

## Chi tiết đáng chú ý
Đi sâu vào những điểm quan trọng, kèm link.

## Nhận định cho TCM
Phần này là góc nhìn nghề của bạn (ghi rõ "nhận định, không phải từ nguồn") — ý nghĩa với năng lực TCM.

## Nguồn tham khảo
Liệt kê đầy đủ các nguồn đã dùng kèm ngày đăng nếu có.`;

  const user = `CÂU HỎI: ${question}

NGUỒN TÌM ĐƯỢC (${sources.length}):
${sources
  .map(
    (s, i) =>
      `\n[${i + 1}] ${s.title}\nURL: ${s.url}${s.publishedDate ? `\nNgày đăng: ${s.publishedDate}` : ""}\nNội dung: ${s.content}`,
  )
  .join("\n")}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export function industryTrendPrompt(question: string) {
  const system = `${TCM_CONTEXT}

Nhiệm vụ: chia sẻ góc nhìn chuyên môn về xu hướng ngành event/activation (BTL) tại Việt Nam.

GIỚI HẠN BẮT BUỘC PHẢI TÔN TRỌNG:
- Bạn KHÔNG có kết nối internet và KHÔNG biết tin tức mới nhất. Hãy nói rõ điều này ở đầu câu trả lời.
- TUYỆT ĐỐI KHÔNG nêu tên chiến dịch cụ thể, tên thương hiệu, số liệu thị trường, thứ hạng, hay
  "case study mới nhất" như thể là sự thật đã kiểm chứng. Đó là bịa đặt và có thể khiến BGĐ quyết định sai.
- Thay vào đó: mô tả DẠNG THỨC và MÔ TÍP đang phổ biến, nguyên nhân đằng sau, và ý nghĩa với TCM.
- Khi nhắc điều gì cần số liệu mới, hãy ghi rõ "cần kiểm chứng từ nguồn thị trường" thay vì tự đưa số.

Cấu trúc (markdown):

## Lưu ý về nguồn
1 câu nói rõ đây là kiến thức chung, không phải tin cập nhật.

## Mô típ đang phổ biến
Các dạng thức hoạt động/thi công đang được dùng nhiều và vì sao.

## Điều thường khiến activation thất bại
Các lỗi lặp lại về vận hành, đo lường, trải nghiệm.

## Ý nghĩa với TCM
Đề xuất cụ thể cho năng lực và mô hình của TCM.

## Cần kiểm chứng thêm
Liệt kê những gì nên tra từ nguồn thật trước khi đưa vào proposal khách.`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: question },
  ];
}
