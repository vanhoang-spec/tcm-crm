import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptToken, isChannelCryptoConfigured, scrubSecrets } from "@/lib/mkt-secret";
import { checkConnection, fetchPostMetrics, publishToChannel, type Fetcher } from "@/lib/mkt-api";
import { isMktChannel, type MktChannel } from "@/lib/mkt";
import { utcMidnightToday } from "@/lib/inventory";

/**
 * MKT-2b/2c — ĐĂNG BÀI QUA API, HẸN GIỜ, KÉO SỐ LIỆU, CẢNH BÁO HẠN TOKEN.
 *
 * ⚠ RANH GIỚI KHÔNG ĐƯỢC PHÁ: chỉ đăng nội dung ĐÃ CÓ NGƯỜI DUYỆT. Bài AI vừa viết KHÔNG bao giờ tự
 * bay lên trang công ty — HR phải bấm "Đăng ngay" hoặc "Hẹn giờ" trên đúng bài đó. Job chỉ thực thi
 * lệnh người đã ra, không tự quyết đăng gì (bất biến từ MKT-1: bài đăng là bộ mặt công ty, một câu
 * sai ra ngoài không thu về được).
 *
 * ⚠ Thiếu MKT_TOKEN_SECRET hoặc chưa nối kênh thì mọi hàm ở đây trả "chưa cấu hình" và app chạy
 * nguyên luồng copy đăng tay của MKT-1 — KHÔNG có đường tắt nào bỏ qua mã hoá.
 */

export type PublishOutcome =
  | { ok: true; externalId: string }
  | { ok: false; code: "NOT_CONFIGURED" | "NO_CONNECTION" | "BAD_TOKEN" | "NO_CONTENT" | "WRONG_STATE" | "AUTH" | "TEMP" | "BAD_REQUEST"; message?: string };

type Conn = { id: string; channel: string; targetId: string; tokenCipher: string; isActive: boolean };

async function loadConn(channel: MktChannel): Promise<Conn | null> {
  return prisma.mktChannelConnection.findUnique({
    where: { channel },
    select: { id: true, channel: true, targetId: true, tokenCipher: true, isActive: true },
  });
}

/** Ghi kết quả lần gọi API gần nhất lên kết nối — câu lỗi đã bỏ token. */
async function markConn(connId: string, ok: boolean, message?: string): Promise<void> {
  await prisma.mktChannelConnection.update({
    where: { id: connId },
    data: { lastCheckAt: new Date(), lastCheckOk: ok, lastError: ok ? null : scrubSecrets(message ?? "") },
  });
}

/** Kênh nào đang nối và dùng được — trang hiện nút "Đăng ngay" theo danh sách này. */
export async function connectedChannels(): Promise<MktChannel[]> {
  if (!isChannelCryptoConfigured()) return [];
  const rows = await prisma.mktChannelConnection.findMany({ where: { isActive: true }, select: { channel: true } });
  return rows.map((r) => r.channel).filter(isMktChannel);
}

/**
 * ĐĂNG MỘT VARIANT qua API.
 *
 * ⚠ Guard trạng thái nằm trong `updateMany` có `status: { not: "POSTED" }`: hai người cùng bấm, hoặc
 * job và người cùng lúc, thì chỉ MỘT lượt ghi được — lượt kia thấy count === 0 và dừng. Không có
 * bước này là bài lên trang HAI LẦN, và không có đường thu hồi tự động.
 * ⚠ Ghi DB TRƯỚC hay SAU khi gọi API? SAU — nhưng nếu API thành công mà ghi DB hỏng thì bài đã lên
 * trang trong khi app tưởng chưa: chấp nhận và ghi `externalId` ngay lệnh đầu tiên sau khi có id,
 * kèm audit, để người còn dò được.
 */
export async function publishVariant(variantId: string, opts?: { fetchImpl?: Fetcher; actorStaffId?: string | null }): Promise<PublishOutcome> {
  if (!isChannelCryptoConfigured()) return { ok: false, code: "NOT_CONFIGURED" };

  const v = await prisma.mktPostVariant.findUnique({
    where: { id: variantId },
    select: { id: true, channel: true, status: true, finalContent: true, post: { select: { id: true, title: true } } },
  });
  if (!v || !isMktChannel(v.channel)) return { ok: false, code: "WRONG_STATE" };
  if (v.status === "POSTED") return { ok: false, code: "WRONG_STATE" };
  if (!v.finalContent.trim()) return { ok: false, code: "NO_CONTENT" };

  const conn = await loadConn(v.channel);
  if (!conn || !conn.isActive) return { ok: false, code: "NO_CONNECTION" };
  const token = decryptToken(conn.tokenCipher);
  // Giải mã hỏng = khoá đã đổi hoặc dữ liệu hỏng. TUYỆT ĐỐI không gọi API với token rỗng.
  if (!token) return { ok: false, code: "BAD_TOKEN" };

  const r = await publishToChannel(opts?.fetchImpl ?? fetch, v.channel, conn.targetId, token, v.finalContent);
  if (!r.ok) {
    await markConn(conn.id, false, r.message);
    await prisma.mktPostVariant.update({ where: { id: v.id }, data: { publishError: scrubSecrets(r.message) } });
    return { ok: false, code: r.kind, message: scrubSecrets(r.message) };
  }

  const now = new Date();
  const done = await prisma.mktPostVariant.updateMany({
    where: { id: v.id, status: { not: "POSTED" } },
    data: { status: "POSTED", postedAt: now, externalId: r.data.id, publishError: null, scheduledAt: null, postedById: opts?.actorStaffId ?? null },
  });
  await markConn(conn.id, true);
  await prisma.auditLog.create({
    data: {
      entityType: "mkt",
      entityId: v.post.id,
      field: "*",
      action: "PUBLISH",
      newValue: JSON.stringify({ channel: v.channel, externalId: r.data.id, viaApi: true }),
      changedBy: opts?.actorStaffId ?? null,
      reason: opts?.actorStaffId ? undefined : "đăng theo lịch hẹn",
    },
  });
  // count === 0: lượt khác vừa đánh dấu POSTED. Bài ĐÃ lên trang rồi nên vẫn trả ok, chỉ audit ở
  // trên là dấu vết duy nhất — đây là lý do guard nằm ở updateMany chứ không phải if trước đó.
  if (done.count === 0) console.error(`[mkt-publish] variant ${v.id} đã POSTED bởi lượt khác, externalId mới: ${r.data.id}`);
  return { ok: true, externalId: r.data.id };
}

/** Kiểm kết nối (nút "Kiểm tra kết nối") — trả tên trang để người dùng đối chiếu. */
export async function testConnection(channel: MktChannel, opts?: { fetchImpl?: Fetcher }): Promise<{ ok: true; name: string } | { ok: false; code: string; message?: string }> {
  if (!isChannelCryptoConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
  const conn = await loadConn(channel);
  if (!conn) return { ok: false, code: "NO_CONNECTION" };
  const token = decryptToken(conn.tokenCipher);
  if (!token) return { ok: false, code: "BAD_TOKEN" };
  const r = await checkConnection(opts?.fetchImpl ?? fetch, channel, conn.targetId, token);
  await markConn(conn.id, r.ok, r.ok ? undefined : r.message);
  if (!r.ok) return { ok: false, code: r.kind, message: scrubSecrets(r.message) };
  if (r.data.name) await prisma.mktChannelConnection.update({ where: { id: conn.id }, data: { targetName: r.data.name } });
  return { ok: true, name: r.data.name };
}

// ─────────────────────────────────────────────────────────
// JOB: đăng bài đã tới giờ hẹn
// ─────────────────────────────────────────────────────────

/**
 * ⚠ Job này KHÔNG chọn bài để đăng — nó chỉ thi hành lệnh hẹn giờ mà HR đã đặt trên đúng bài đó.
 * ⚠ Lỗi `AUTH` thì XOÁ lịch hẹn (thử lại vô ích, phải nối lại kênh) và ghi lỗi lên variant để HR
 * thấy; lỗi `TEMP` thì GIỮ lịch cho lượt sau. Không phân biệt hai loại là hoặc spam API mãi, hoặc
 * âm thầm bỏ rơi bài đã hẹn.
 */
export async function runMktScheduledPublish(): Promise<{ published: number; failed: number }> {
  if (!isChannelCryptoConfigured()) return { published: 0, failed: 0 };
  const due = await prisma.mktPostVariant.findMany({
    where: { scheduledAt: { lte: new Date() }, status: { not: "POSTED" } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    select: { id: true, channel: true, post: { select: { title: true } } },
  });
  let published = 0;
  let failed = 0;
  for (const v of due) {
    const r = await publishVariant(v.id);
    if (r.ok) {
      published++;
      continue;
    }
    failed++;
    // Hỏng vì token/quyền/nội dung ⇒ gỡ lịch, báo người duyệt. Hỏng tạm ⇒ để nguyên, lượt sau thử lại.
    if (r.code !== "TEMP") {
      await prisma.mktPostVariant.update({ where: { id: v.id }, data: { scheduledAt: null } });
      const reviewers = await prisma.staff.findMany({
        where: { isActive: true, OR: [{ role: { permissions: { some: { permissionCode: "mkt.review" } } } }, { role: { code: "ADMIN" } }] },
        select: { id: true },
      });
      if (reviewers.length)
        await prisma.notification.createMany({
          data: reviewers.map((s) => ({
            recipientStaffId: s.id,
            type: "MKT_PUBLISH_FAILED",
            title: `Đăng tự động THẤT BẠI: "${v.post.title}" (${v.channel})`,
            body: `Lý do: ${r.code}${r.message ? " — " + r.message : ""}. Lịch hẹn đã gỡ; kiểm tra kết nối kênh rồi đăng lại.`,
          })),
        });
    }
  }
  return { published, failed };
}

// ─────────────────────────────────────────────────────────
// JOB: kéo số liệu bài đã đăng (MKT-2c)
// ─────────────────────────────────────────────────────────

/** Bao nhiêu ngày sau khi đăng thì còn kéo số liệu — sau đó bài gần như đứng yên, kéo nữa là phí. */
export const METRIC_WINDOW_DAYS = 45;

/**
 * Kéo số liệu cho các bài đã đăng qua API trong 45 ngày gần đây, MỘT ảnh chụp mỗi ngày.
 *
 * ⚠ `upsert` theo (variantId, day) chứ không `create`: job chạy mỗi 5 phút, không có khoá này là
 * mỗi ngày đẻ ra 288 dòng cho mỗi bài.
 * ⚠ Bài đăng TAY (copy-paste) không có `externalId` nên không kéo được — đó là lý do cột đó tồn tại,
 * không phải thiếu sót.
 */
export async function runMktMetricsPull(opts?: { fetchImpl?: Fetcher }): Promise<{ pulled: number }> {
  if (!isChannelCryptoConfigured()) return { pulled: 0 };
  const day = utcMidnightToday();
  const since = new Date(Date.now() - METRIC_WINDOW_DAYS * 86_400_000);

  const conns = await prisma.mktChannelConnection.findMany({ where: { isActive: true }, select: { channel: true, targetId: true, tokenCipher: true, id: true } });
  if (conns.length === 0) return { pulled: 0 };

  let pulled = 0;
  for (const conn of conns) {
    if (!isMktChannel(conn.channel)) continue;
    const token = decryptToken(conn.tokenCipher);
    if (!token) continue;

    const vars = await prisma.mktPostVariant.findMany({
      where: {
        channel: conn.channel,
        status: "POSTED",
        externalId: { not: null },
        postedAt: { gte: since },
        // Bỏ qua bài đã có ảnh chụp HÔM NAY — job chạy 5 phút/lần.
        metrics: { none: { day } },
      },
      take: 25,
      select: { id: true, externalId: true },
    });

    for (const v of vars) {
      const r = await fetchPostMetrics(opts?.fetchImpl ?? fetch, conn.channel, conn.targetId, v.externalId!, token);
      if (!r.ok) {
        await markConn(conn.id, false, r.message);
        // Token chết thì dừng cả kênh — 25 lần gọi tiếp theo cũng hỏng y hệt.
        if (r.kind === "AUTH") break;
        continue;
      }
      await prisma.mktPostMetric.upsert({
        where: { variantId_day: { variantId: v.id, day } },
        update: { ...r.data, fetchedAt: new Date() },
        create: { variantId: v.id, day, ...r.data },
      });
      pulled++;
    }
  }
  return { pulled };
}

// ─────────────────────────────────────────────────────────
// JOB: cảnh báo hạn token
// ─────────────────────────────────────────────────────────

/** Thang bậc, mỗi mức bắn ĐÚNG MỘT LẦN — mirror EXPIRY_RANK của Kho v2 K4. */
const TOKEN_WARN_LEVELS = [30, 14, 7, 0] as const;

export async function checkMktTokenExpiry(): Promise<{ warned: number }> {
  if (!isChannelCryptoConfigured()) return { warned: 0 };
  const conns = await prisma.mktChannelConnection.findMany({
    where: { isActive: true, tokenExpiresAt: { not: null } },
    select: { id: true, channel: true, targetName: true, tokenExpiresAt: true, expiryWarnLevel: true },
  });
  if (conns.length === 0) return { warned: 0 };

  const reviewers = await prisma.staff.findMany({
    where: { isActive: true, OR: [{ role: { permissions: { some: { permissionCode: "mkt.channel.manage" } } } }, { role: { code: "ADMIN" } }] },
    select: { id: true },
  });
  let warned = 0;
  for (const c of conns) {
    const days = Math.floor((c.tokenExpiresAt!.getTime() - Date.now()) / 86_400_000);
    // ⚠ Phải lấy mức THẤP NHẤT còn thoả, không phải mức đầu tiên: mảng xếp giảm dần nên
    // `find(l => days <= l)` luôn trả 30 — còn 5 ngày vẫn báo "còn 30 ngày" và mức 7 không bao giờ
    // bắn. Test bắt được ca này (còn 5 ngày phải ra mức 7).
    const level = [...TOKEN_WARN_LEVELS].reverse().find((l) => days <= l);
    if (level === undefined) continue;
    // Thang bậc: chỉ bắn khi TỤT xuống mức thấp hơn mức đã bắn.
    if (c.expiryWarnLevel !== null && c.expiryWarnLevel !== undefined && level >= c.expiryWarnLevel) continue;
    await prisma.mktChannelConnection.update({ where: { id: c.id }, data: { expiryWarnLevel: level } });
    if (reviewers.length)
      await prisma.notification.createMany({
        data: reviewers.map((s) => ({
          recipientStaffId: s.id,
          type: "MKT_TOKEN_EXPIRING",
          title: days <= 0 ? `Token kênh ${c.channel} ĐÃ HẾT HẠN` : `Token kênh ${c.channel} còn ${days} ngày`,
          body: `${c.targetName ?? c.channel}: nối lại kênh ở Thiết lập → Kênh đăng bài MKT, nếu không bài hẹn giờ sẽ không đăng được.`,
        })),
      });
    warned++;
  }
  return { warned };
}
