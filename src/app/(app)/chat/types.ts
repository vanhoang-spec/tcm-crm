export type ChatListItem = {
  id: string;
  type: string;
  title: string;
  avatarKey: string | null;
  lastBody: string | null;
  lastAt: string | null;
  lastIsSystem: boolean;
  unread: number;
  muted: boolean;
  memberCount: number;
  pinned: boolean;
};

export type ChatStaff = { id: string; fullName: string; title: string | null };

/** Trạng thái "đã đọc" của 1 thành viên hội thoại — dùng để suy ra read-receipt theo từng tin nhắn. */
export type ChatReadState = { staffId: string; fullName: string; lastReadAt: string | null };

/** 1 nhóm reaction (VD tất cả 👍) đã gộp theo emoji — count + có phải "tôi" đã react + tên người react (hover). */
export type ChatMessageReactionGroup = { emoji: string; count: number; reactedByMe: boolean; staffNames: string[] };

export type ChatMessageReplyPreview = {
  id: string;
  type: string;
  senderName: string | null;
  body: string | null;
  linkText: string | null;
  attachmentName: string | null;
  attachmentDurationSec: number | null;
};

/** type=REMINDER — thông báo lịch nhắc hẹn ngay trong khung chat (không phải lúc "đến hẹn" — đó là 1 SYSTEM message riêng). */
export type ChatReminder = {
  id: string;
  title: string;
  remindAt: string;
  recurrence: string; // ONCE | DAILY | WEEKLY | MONTHLY
  audience: string; // ME | GROUP
  isActive: boolean;
};

export type ChatPollOption = { id: string; text: string; voteCount: number; votedByMe: boolean; voterNames: string[] };

/** type=POLL — xem quy tắc canSeeResults/anonymous trong lib/chat.ts buildPollView(). */
export type ChatPoll = {
  id: string;
  question: string;
  allowMultiple: boolean;
  anonymous: boolean;
  hideResultsUntilVoted: boolean;
  allowAddOptions: boolean;
  closesAt: string | null;
  closed: boolean;
  totalVoters: number;
  myVoted: boolean;
  canSeeResults: boolean;
  options: ChatPollOption[];
};

export type ChatMessage = {
  id: string;
  type: string;
  senderId: string | null;
  senderName: string | null;
  body: string | null;
  systemEvent: string | null;
  linkUrl: string | null;
  linkText: string | null;
  linkPreviewTitle: string | null;
  linkPreviewDescription: string | null;
  linkPreviewImageUrl: string | null;
  linkPreviewSiteName: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  attachmentDurationSec: number | null;
  isForwarded: boolean;
  replyTo: ChatMessageReplyPreview | null;
  createdAt: string;
  editedAt: string | null;
  deletedForEveryone: boolean;
  pinned: boolean;
  mentions: { staffId: string | null; name: string | null; isAll: boolean }[];
  reactions: ChatMessageReactionGroup[];
  reminder: ChatReminder | null;
  poll: ChatPoll | null;
};

/** 1 tin nhắn đang được ghim (dùng cho thanh "Tin nhắn đã ghim" trên đầu hội thoại) — cùng shape với
 * ChatMessageReplyPreview để tái dùng hàm replyPreviewText() render preview. */
export type ChatPinnedMessage = {
  id: string; // PinnedMessage.id
  messageId: string;
  type: string;
  senderName: string | null;
  body: string | null;
  linkText: string | null;
  attachmentName: string | null;
  attachmentDurationSec: number | null;
  pinnedByName: string | null;
};
