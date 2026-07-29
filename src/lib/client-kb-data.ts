import { prisma } from "@/lib/prisma";
import {
  computeCompliance,
  isUsableQuestion,
  packSourceTexts,
  resolveKbAnchor,
  type ComplianceTopic,
  type KbAnchor,
} from "@/lib/client-kb";
import type { KbAiContext } from "@/lib/ai/client-kb-prompts";
import { extractTextFromFile } from "@/lib/ai/extract-text";
import { readClientKbFile } from "@/lib/client-kb-storage";

/**
 * Lớp IO của Knowledge Base theo khách — page VÀ server action đều gọi hàm ở đây.
 *
 * Cố tình gom một chỗ: HANDOVER mục 10.11 đã ghi lại một vết xe đổ của module kho, nơi màn hình
 * lập đề xuất (`requests/load.ts`) và server action (`requests/actions.ts`) tính "tồn khả dụng"
 * theo hai công thức lệch nhau, khiến form hiện số rộng hơn thực tế rồi server mới báo lỗi.
 */

export type KbClient = { id: string; code: string; name: string; groupId: string | null };

/** Nạp khách + đối tượng neo KB. Trả null nếu không có khách (page tự notFound). */
export async function loadKbClient(clientId: string): Promise<{ client: KbClient; anchor: KbAnchor; anchorName: string } | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, code: true, name: true, groupId: true, group: { select: { name: true } } },
  });
  if (!client) return null;
  const anchor = resolveKbAnchor(client);
  return {
    client: { id: client.id, code: client.code, name: client.name, groupId: client.groupId },
    anchor,
    anchorName: anchor.kind === "GROUP" ? (client.group?.name ?? client.name) : client.name,
  };
}

/**
 * ĐƯỜNG GHI DUY NHẤT tạo `ClientKbSpace` — chỗ duy nhất ép bất biến XOR (đúng một trong hai cột
 * clientId/groupId có giá trị). Đừng tạo space ở nơi khác.
 *
 * Chạy song song hai lần vẫn an toàn: `@unique` trên từng cột chặn dòng thứ hai, bắt P2002 rồi
 * đọc lại. Chỉ gọi từ các action CÓ QUYỀN GHI — người chỉ xem không được tạo space rỗng.
 */
export async function getOrCreateKbSpace(anchor: KbAnchor): Promise<string> {
  const where = anchor.kind === "GROUP" ? { groupId: anchor.id } : { clientId: anchor.id };
  const found = await prisma.clientKbSpace.findFirst({ where, select: { id: true } });
  if (found) return found.id;
  try {
    const created = await prisma.clientKbSpace.create({ data: where, select: { id: true } });
    return created.id;
  } catch (e) {
    // CHỈ nuốt lỗi trùng khoá (P2002 = request song song đã tạo trước). Lỗi ghi thật — SQLite bận,
    // timeout — phải bung lên nguyên trạng, không được che thành "KB_SPACE_CREATE_FAILED".
    if (!(e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "P2002")) throw e;
    const again = await prisma.clientKbSpace.findFirst({ where, select: { id: true } });
    if (!again) throw e;
    return again.id;
  }
}

/** Space hiện có của đối tượng — KHÔNG tạo mới (dùng cho đường chỉ đọc). */
export async function findKbSpaceId(anchor: KbAnchor): Promise<string | null> {
  const where = anchor.kind === "GROUP" ? { groupId: anchor.id } : { clientId: anchor.id };
  const s = await prisma.clientKbSpace.findFirst({ where, select: { id: true } });
  return s?.id ?? null;
}

/**
 * Toàn bộ dữ liệu cho trang KB. `canManage=false` thì CHỈ trả bài đã đăng — lọc ở TẦNG TRUY VẤN
 * chứ không phải ở giao diện, để bản nháp không bao giờ lọt xuống payload của người chỉ được xem.
 */
export async function loadKbSpaceView(anchor: KbAnchor, canManage: boolean) {
  const spaceId = await findKbSpaceId(anchor);
  if (!spaceId) return null;

  const [space, topics, sources] = await Promise.all([
    prisma.clientKbSpace.findUnique({ where: { id: spaceId }, select: { id: true, generalNote: true } }),
    prisma.clientKbTopic.findMany({
      where: { spaceId },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      include: {
        lessons: {
          where: canManage ? {} : { status: "PUBLISHED" },
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          // blocksJson để đánh dấu bài CÒN RỖNG trên danh sách — dàn bài AI sinh ra toàn bài rỗng,
          // không đánh dấu thì PIC phải mở từng bài mới biết bài nào đã viết.
          select: { id: true, title: true, status: true, source: true, sort: true, updatedAt: true, blocksJson: true },
        },
        // Câu hỏi để ĐẾM — phải đếm bằng `isUsableQuestion` y như trang làm bài và bộ chấm, không
        // dùng `_count` thô. Đếm thô thì nút hiện "5 câu" trong khi bài chỉ có 4 câu bấm được.
        questions: { where: { isActive: true }, select: { optionsJson: true, correctIndex: true } },
      },
    }),
    prisma.clientKbSource.findMany({
      where: { spaceId },
      orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
      include: { uploadedBy: { select: { fullName: true } } },
    }),
  ]);

  return { space: space!, topics, sources };
}

/**
 * Khách ĐANG thuộc nhóm nhưng trước đó từng có kho riêng: đếm những gì đang bị che.
 *
 * Không có chỗ nào báo thì đây là ca mất dữ liệu êm nhất của module — PIC nạp 12 bài lúc khách còn
 * đứng lẻ, admin gán nhóm một cái là toàn bộ biến mất khỏi mọi màn hình (bản ghi vẫn nằm nguyên
 * trong DB, chỉ là không đường nào mở tới). Trả null khi không có gì để nói.
 */
export async function countHiddenClientSpace(clientId: string): Promise<{ topics: number; sources: number } | null> {
  const space = await prisma.clientKbSpace.findFirst({ where: { clientId }, select: { id: true } });
  if (!space) return null;
  const [topics, sources] = await Promise.all([
    prisma.clientKbTopic.count({ where: { spaceId: space.id } }),
    prisma.clientKbSource.count({ where: { spaceId: space.id } }),
  ]);
  return topics + sources === 0 ? null : { topics, sources };
}

/**
 * Nạp bài học kèm đối tượng neo của nó — dùng để kiểm bài có thật sự thuộc KB của khách đang mở
 * hay không. Không có bước này thì đoán id bài của khách khác là đọc được nội dung của họ.
 */
export async function loadKbLesson(lessonId: string) {
  return prisma.clientKbLesson.findUnique({
    where: { id: lessonId },
    include: {
      topic: { select: { id: true, name: true, spaceId: true, space: { select: { clientId: true, groupId: true } } } },
      updatedBy: { select: { fullName: true } },
    },
  });
}

// ── H3: nguyên liệu cho AI ────────────────────────────────

/**
 * Gom nguyên liệu sinh bài: hồ sơ khách/nhóm trong CRM + ghi chú PIC + text trích từ tài liệu
 * nguồn. KHÔNG gọi AI ở đây — chỉ nạp dữ liệu, để action giữ đúng thứ tự "đọc DB → gọi AI →
 * transaction ngắn" (không bao giờ giữ transaction SQLite qua một call 90s).
 */
export async function loadKbAiContext(anchor: KbAnchor): Promise<KbAiContext | null> {
  const spaceId = await findKbSpaceId(anchor);

  const [space, anchorInfo] = await Promise.all([
    spaceId ? prisma.clientKbSpace.findUnique({ where: { id: spaceId }, select: { generalNote: true } }) : null,
    anchor.kind === "GROUP"
      ? prisma.clientGroup.findUnique({
          where: { id: anchor.id },
          select: { name: true, clients: { select: { name: true, industry: { select: { labelVi: true } } } } },
        })
      : prisma.client.findUnique({
          where: { id: anchor.id },
          select: { name: true, industry: { select: { labelVi: true } } },
        }),
  ]);
  if (!anchorInfo) return null;

  const sources = spaceId
    ? await prisma.clientKbSource.findMany({
        where: { spaceId },
        orderBy: { createdAt: "desc" }, // mới nhất trước — packSourceTexts giữ nguyên thứ tự này
        select: { fileKey: true, fileMime: true, fileName: true },
      })
    : [];

  const texts = await Promise.all(
    sources.map(async (s) => {
      try {
        const buf = await readClientKbFile(s.fileKey);
        const got = await extractTextFromFile(buf, s.fileMime);
        return { name: s.fileName, text: got?.text ?? null };
      } catch {
        return { name: s.fileName, text: null }; // file mất/không đọc được → vào danh sách bỏ qua
      }
    }),
  );
  const packed = packSourceTexts(texts);

  const isGroup = anchor.kind === "GROUP";
  const members = isGroup ? (anchorInfo as { clients: { name: string }[] }).clients.map((c) => c.name) : [];
  const industry = isGroup
    ? ((anchorInfo as { clients: { industry: { labelVi: string } | null }[] }).clients.find((c) => c.industry)?.industry
        ?.labelVi ?? null)
    : ((anchorInfo as { industry: { labelVi: string } | null }).industry?.labelVi ?? null);

  return {
    anchorName: anchorInfo.name,
    isGroup,
    memberNames: members,
    industry,
    generalNote: space?.generalNote ?? null,
    sourcesText: packed.text,
    skippedSources: packed.skipped,
  };
}

// ── H3: quiz ──────────────────────────────────────────────

/**
 * Câu hỏi cho TRANG LÀM BÀI — `correctIndex` KHÔNG nằm trong select.
 *
 * ⚠ Đây là chốt duy nhất chặn việc lộ đáp án: chỉ cần thêm `correctIndex: true` vào select là đáp
 * án đi thẳng xuống HTML của trang, người học bấm F12 là thấy. Chấm điểm đọc đáp án bằng
 * `loadQuizAnswerKey` ở đường ghi, không dùng lại hàm này.
 */
export async function loadQuizQuestions(topicId: string) {
  const rows = await prisma.clientKbQuestion.findMany({
    where: { topicId, isActive: true },
    orderBy: { createdAt: "asc" },
    // `correctIndex` ở đây CHỈ để lọc câu hỏng — không bao giờ trả ra khỏi hàm.
    select: { id: true, prompt: true, optionsJson: true, correctIndex: true },
  });
  return rows.filter(isUsableQuestion).map((q) => ({ id: q.id, prompt: q.prompt, optionsJson: q.optionsJson }));
}

/**
 * Đáp án — CHỈ gọi trong action chấm bài, không bao giờ ở đường render.
 *
 * ⚠ Lọc bằng CÙNG `isUsableQuestion` như đường render. Lệch một chút là mẫu số chấm điểm khác số
 * câu người dùng nhìn thấy.
 */
export async function loadQuizAnswerKey(topicId: string) {
  const rows = await prisma.clientKbQuestion.findMany({
    where: { topicId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, correctIndex: true, prompt: true, optionsJson: true, explanation: true },
  });
  return rows.filter(isUsableQuestion);
}

// ── H3: tuân thủ ──────────────────────────────────────────

/**
 * Trạng thái học của một nhóm người đối với kho kiến thức của một đối tượng.
 *
 * MỘT hàm duy nhất, dùng chung cho cả trang bảng tuân thủ lẫn card trên trang dự án. Cố ý gom:
 * HANDOVER 10.11 đã ghi lại vết xe đổ của module kho, nơi màn hình và server action tính cùng một
 * con số theo hai công thức lệch nhau.
 */
export async function loadCompliance(anchor: KbAnchor, staffIds: string[]) {
  const spaceId = await findKbSpaceId(anchor);
  if (!spaceId) return { topics: [] as ComplianceTopic[], rows: computeCompliance([], staffIds, []) };

  const topics = await prisma.clientKbTopic.findMany({
    where: { spaceId },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      _count: { select: { lessons: { where: { status: "PUBLISHED" } } } },
      questions: { where: { isActive: true }, select: { optionsJson: true, correctIndex: true } },
    },
  });

  const shaped: ComplianceTopic[] = topics.map((t) => ({
    topicId: t.id,
    name: t.name,
    // "Phải đạt" = vừa có bài để học, vừa có câu HỎI ĐƯỢC. Đếm bằng cùng isUsableQuestion với
    // trang làm bài: chủ đề mà mọi câu đều hỏng thì không ai đạt nổi, không được tính vào mẫu số.
    required: t._count.lessons > 0 && t.questions.some(isUsableQuestion),
  }));

  const topicIds = shaped.filter((t) => t.required).map((t) => t.topicId);
  const passed =
    topicIds.length && staffIds.length
      ? await prisma.clientKbAttempt.findMany({
          where: { topicId: { in: topicIds }, staffId: { in: staffIds }, passed: true },
          select: { staffId: true, topicId: true },
          distinct: ["staffId", "topicId"],
        })
      : [];

  return { topics: shaped, rows: computeCompliance(shaped, staffIds, passed) };
}

/**
 * Ba nguồn người của một dự án: PIC (owner), Leader, và thành viên team. Gom lại, khử trùng.
 *
 * ⚠ Đây là TOÀN BỘ radar hiện có. Việc "phân công nhân sự theo dự án + ngày" (task C2) chưa làm,
 * nên người chạy hiện trường theo ca KHÔNG nằm trong danh sách này — card tuân thủ vì thế là
 * tham chiếu, không phải bằng chứng đầy đủ.
 */
export async function loadProjectPeople(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      owner: { select: { id: true, fullName: true, title: true } },
      leader: { select: { id: true, fullName: true, title: true } },
      members: { select: { staff: { select: { id: true, fullName: true, title: true } } } },
    },
  });
  if (!p) return null;

  const seen = new Map<string, { id: string; fullName: string; title: string | null; roles: string[] }>();
  const add = (s: { id: string; fullName: string; title: string | null } | null, role: string) => {
    if (!s) return;
    const cur = seen.get(s.id);
    if (cur) cur.roles.push(role);
    else seen.set(s.id, { ...s, roles: [role] });
  };
  add(p.owner, "OWNER");
  add(p.leader, "LEADER");
  for (const m of p.members) add(m.staff, "MEMBER");

  return { clientId: p.clientId, people: [...seen.values()] };
}

/** Bài có thuộc đúng đối tượng đang mở không (chống đọc chéo giữa các khách). */
export function lessonBelongsToAnchor(
  lesson: { topic: { space: { clientId: string | null; groupId: string | null } } },
  anchor: KbAnchor,
): boolean {
  const s = lesson.topic.space;
  return anchor.kind === "GROUP" ? s.groupId === anchor.id : s.clientId === anchor.id;
}
