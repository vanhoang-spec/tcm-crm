import { prisma } from "@/lib/prisma";
import { resolveKbAnchor, type KbAnchor } from "@/lib/client-kb";

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
          select: { id: true, title: true, status: true, source: true, sort: true, updatedAt: true },
        },
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

/** Bài có thuộc đúng đối tượng đang mở không (chống đọc chéo giữa các khách). */
export function lessonBelongsToAnchor(
  lesson: { topic: { space: { clientId: string | null; groupId: string | null } } },
  anchor: KbAnchor,
): boolean {
  const s = lesson.topic.space;
  return anchor.kind === "GROUP" ? s.groupId === anchor.id : s.clientId === anchor.id;
}
