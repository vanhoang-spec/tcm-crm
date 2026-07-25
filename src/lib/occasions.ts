import { prisma } from "./prisma";
import { saveChatAttachment } from "./chat-storage";
import { buildBirthdaySvg, buildCompanyBirthdaySvg } from "./celebration-cards";
import { TCM_FAMILY_GROUP_NAME } from "./chat";

/**
 * Tin nhắn chúc mừng tự động vào "GIA ĐÌNH TCM" — sinh nhật nhân sự, kỷ niệm thâm niên, sinh nhật
 * công ty. App KHÔNG có cron thật — chạy theo pattern "check-and-notify mỗi lần layout render" như
 * lib/reminders.ts. Do đó "đúng 9:00am" nghĩa là: tin xuất hiện ngay khi có người tải trang ĐẦU TIÊN
 * sau 9:00am hôm đó (không phải chính xác từng giây) — hạn chế đã biết của kiến trúc không-cron này.
 * Chống gửi trùng bằng unique constraint SpecialOccasionLog(occasionType, refId, occasionDate) — an
 * toàn dưới tải đồng thời (insert-trước-rồi-mới-đăng, không phải check-rồi-mới-insert).
 */

const COMPANY_FOUNDING_YEAR = 2000;
const COMPANY_FOUNDING_MONTH = 7; // Date.getMonth() 0-indexed — 7 = tháng 8
const COMPANY_FOUNDING_DAY = 28;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "1st"/"2nd"/"3rd"/"4th"... — đúng định dạng "Happy Work Anniversary - 1st year" theo yêu cầu. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Giành "chỗ" gửi cho hôm nay — true nếu chưa ai gửi (được phép đăng), false nếu đã gửi rồi. */
async function claimOccasion(occasionType: string, refId: string, occasionDate: Date): Promise<boolean> {
  try {
    await prisma.specialOccasionLog.create({ data: { occasionType, refId, occasionDate } });
    return true;
  } catch {
    return false; // vi phạm unique constraint → đã có log hôm nay, bỏ qua
  }
}

async function postImageMessage(conversationId: string, svg: string, attachmentName: string) {
  const buffer = Buffer.from(svg, "utf8");
  const attachmentKey = await saveChatAttachment(buffer, "image/svg+xml");
  await prisma.message.create({
    data: {
      conversationId,
      senderId: null, // hệ thống tự đăng — UI hiện nhãn "TCM" (xem chat-conversation.tsx)
      type: "IMAGE",
      attachmentKey,
      attachmentName,
      attachmentMime: "image/svg+xml",
      attachmentSize: buffer.byteLength,
    },
  });
}

export async function checkSpecialOccasions(): Promise<void> {
  const now = new Date();
  const today = startOfDay(now);

  const group = await prisma.conversation.findFirst({ where: { type: "GROUP", name: TCM_FAMILY_GROUP_NAME }, select: { id: true } });
  if (!group) return;

  // 1) Sinh nhật công ty — 28/08, từ 8:00am
  if (now.getMonth() === COMPANY_FOUNDING_MONTH && now.getDate() === COMPANY_FOUNDING_DAY && now.getHours() >= 8) {
    if (await claimOccasion("COMPANY_BIRTHDAY", "TCM", today)) {
      const years = now.getFullYear() - COMPANY_FOUNDING_YEAR;
      await postImageMessage(group.id, buildCompanyBirthdaySvg(years), `company-birthday-${now.getFullYear()}.svg`);
    }
  }

  // 2) Sinh nhật nhân sự — từ 9:00am
  if (now.getHours() >= 9) {
    const staffList = await prisma.staff.findMany({
      where: { isActive: true, dateOfBirth: { not: null } },
      select: { id: true, fullName: true, dateOfBirth: true },
    });
    for (const s of staffList) {
      if (!s.dateOfBirth) continue;
      if (s.dateOfBirth.getMonth() !== now.getMonth() || s.dateOfBirth.getDate() !== now.getDate()) continue;
      if (await claimOccasion("STAFF_BIRTHDAY", s.id, today)) {
        await postImageMessage(group.id, buildBirthdaySvg(s.fullName), `birthday-${s.id}-${now.getFullYear()}.svg`);
      }
    }
  }

  // 3) Kỷ niệm thâm niên — "ngày đi làm đầu tiên" = Staff.firstWorkDate (nhập tay lúc tạo tài khoản,
  // CÓ THỂ khác createdAt = ngày được add vào CRM) — từ 10:00am
  if (now.getHours() >= 10) {
    const staffList = await prisma.staff.findMany({
      where: { isActive: true, firstWorkDate: { not: null } },
      select: { id: true, fullName: true, firstWorkDate: true },
    });
    for (const s of staffList) {
      if (!s.firstWorkDate) continue;
      if (s.firstWorkDate.getMonth() !== now.getMonth() || s.firstWorkDate.getDate() !== now.getDate()) continue;
      const years = now.getFullYear() - s.firstWorkDate.getFullYear();
      if (years < 1) continue; // chưa đủ 1 năm — không gửi "0th year"
      if (await claimOccasion("WORK_ANNIVERSARY", s.id, today)) {
        await prisma.message.create({
          data: {
            conversationId: group.id,
            senderId: null,
            type: "TEXT",
            body: `Happy Work Anniversary - ${ordinal(years)} year - ${s.fullName}`,
          },
        });
      }
    }
  }
}
