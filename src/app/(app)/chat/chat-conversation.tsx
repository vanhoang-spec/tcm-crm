"use client";

import { useState, useEffect, useRef, useCallback, useActionState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Link2,
  Send,
  X,
  ExternalLink,
  Plus,
  Image as ImageIcon,
  Video,
  Mic,
  StopCircle,
  File as FileIcon,
  Reply as ReplyIcon,
  Forward as ForwardIcon,
  Users,
  Check,
  CheckCheck,
  SmilePlus,
  MoreHorizontal,
  Pencil,
  Copy,
  Eye,
  Pin,
  PinOff,
  Trash2,
  Clock,
  BarChart3,
  Repeat,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn, initials, formatDuration, formatTime, formatDateTime } from "@/lib/utils";
import type { ChatMessage, ChatStaff, ChatReadState, ChatMessageReactionGroup, ChatPinnedMessage, ChatPoll } from "./types";
import {
  sendMessage,
  markRead,
  getForwardTargets,
  forwardMessage,
  toggleReaction,
  editMessage,
  deleteMessageForMe,
  deleteMessageForEveryone,
  pinMessage,
  unpinMessage,
  createReminder,
  createPoll,
  votePollOption,
  addPollOption,
  type SendState,
  type ReminderState,
  type PollState,
} from "./actions";
import { QUICK_REACTIONS, EMOJI_CATEGORIES } from "@/lib/emoji-data";

const MAX_VOICE_SECONDS = 300; // 5 phút — khớp src/lib/chat-storage.ts (server-side re-check)
const MAX_MEDIA_MB = 10; // hình/video/file — khớp src/lib/chat-storage.ts

type ForwardTarget = { id: string; type: string; title: string };

function fmtTime(iso: string) {
  return formatTime(iso);
}

/** Nhãn preview ngắn gọn cho quote reply (composer + trong bong bóng tin nhắn). */
function replyPreviewText(
  m: { type: string; body: string | null; linkText: string | null; attachmentName: string | null; attachmentDurationSec: number | null },
  t: ReturnType<typeof useTranslations>,
): string {
  if (m.type === "IMAGE") return t("previewImage");
  if (m.type === "VIDEO") return t("previewVideo");
  if (m.type === "FILE") return t("previewFile", { name: m.attachmentName ?? "" });
  if (m.type === "VOICE") return t("previewVoice", { duration: formatDuration(m.attachmentDurationSec ?? 0) });
  if (m.type === "LINK") return m.linkText ?? "";
  return m.body ?? "";
}

/** Nội dung đầy đủ (không truncate) để "Copy message" — LINK copy thẳng URL, media copy nhãn loại file. */
function fullContentText(m: ChatMessage, t: ReturnType<typeof useTranslations>): string {
  if (m.type === "IMAGE") return t("previewImage");
  if (m.type === "VIDEO") return t("previewVideo");
  if (m.type === "FILE") return t("previewFile", { name: m.attachmentName ?? "" });
  if (m.type === "VOICE") return t("previewVoice", { duration: formatDuration(m.attachmentDurationSec ?? 0) });
  if (m.type === "LINK") return m.linkUrl ?? m.linkText ?? "";
  if (m.type === "REMINDER") return m.reminder?.title ?? "";
  if (m.type === "POLL") return m.poll?.question ?? "";
  return m.body ?? "";
}

function MenuButton({ icon: Icon, label, onClick, danger }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2", danger ? "text-danger" : "text-foreground")}
    >
      <Icon className="h-3.5 w-3.5 flex-none" />
      {label}
    </button>
  );
}

/** Không đủ chỗ mở popup LÊN trên (tin sát mép trên màn hình) → cần lật xuống. */
function notEnoughSpaceAbove(triggerEl: HTMLElement, neededPx: number): boolean {
  return triggerEl.getBoundingClientRect().top < neededPx;
}

/**
 * Suy ra "ai đã đọc tin nhắn này" thuần từ ConversationMember.lastReadAt (không có bảng
 * read-receipt riêng) — 1 thành viên coi là đã đọc message M nếu lastReadAt của họ >= M.createdAt.
 * Không tính người gửi (họ luôn "đã đọc" tin của chính mình, không phải người nhận).
 */
function getReadInfo(message: ChatMessage, readState: ChatReadState[], allMemberIds: string[]) {
  const others = allMemberIds.filter((id) => id !== message.senderId);
  const msgTime = new Date(message.createdAt).getTime();
  const readers = others
    .map((id) => readState.find((r) => r.staffId === id))
    .filter((r): r is ChatReadState => !!r?.lastReadAt && new Date(r.lastReadAt).getTime() >= msgTime);
  return { readers, allRead: others.length > 0 && readers.length === others.length };
}

/** Highlight token @all / @Tên trong body dựa trên mentions của message. */
function renderBody(body: string, mentionNames: string[], allLabel: string) {
  const tokens = ["@" + allLabel, ...mentionNames.map((n) => "@" + n)];
  if (tokens.length === 0) return body;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = body.split(re);
  return parts.map((p, i) =>
    tokens.some((tk) => tk.toLowerCase() === p.toLowerCase()) ? (
      <span key={i} className="rounded bg-brand-100 px-0.5 font-medium text-brand-700">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function ChatConversation({
  conversationId,
  initial,
  meId,
  members,
  canSend,
  pollSeconds,
  initialReadState,
  allMemberIds,
  isAdmin,
  initialPinned,
}: {
  conversationId: string;
  initial: ChatMessage[];
  meId: string | null;
  members: ChatStaff[];
  canSend: boolean;
  pollSeconds: number;
  initialReadState: ChatReadState[];
  allMemberIds: string[];
  isAdmin: boolean;
  initialPinned: ChatPinnedMessage[];
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [readState, setReadState] = useState<ChatReadState[]>(initialReadState);
  const [pinned, setPinned] = useState<ChatPinnedMessage[]>(initialPinned);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [fullEmojiPickerMessageId, setFullEmojiPickerMessageId] = useState<string | null>(null);
  const [openMenuMessageId, setOpenMenuMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [seenByMessage, setSeenByMessage] = useState<ChatMessage | null>(null);
  // Popup "…"/reaction-picker/seen-by mặc định mở LÊN (bottom-full). Khi tin nằm sát mép trên màn hình
  // (không đủ chỗ mở lên) → lật xuống (top-full) để không bị viewport cắt. Đo tại thời điểm mở/hover
  // bằng getBoundingClientRect() của nút trigger — không cần portal, chỉ đổi hướng CSS.
  const [menuFlipDown, setMenuFlipDown] = useState(false);
  const [reactionFlipDown, setReactionFlipDown] = useState(false);
  const [seenByFlipDownId, setSeenByFlipDownId] = useState<string | null>(null);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Lấy tin nhắn mới hơn tin cuối cùng đang có — dùng cả cho poll định kỳ lẫn "làm mới ngay"
  // sau khi tự gửi (thay vì đợi ăn theo prop `initial` đổi, tránh đụng lỗi setState chéo component).
  // Read-state (lastReadAt của từng thành viên) luôn cập nhật mỗi lần poll — kể cả khi KHÔNG có tin
  // mới — để các tin nhắn cũ đã hiển thị cũng phản ánh đúng "đã xem bởi ai" khi người khác đọc sau đó.
  const refreshNow = useCallback(async () => {
    try {
      const after = messagesRef.current.length ? messagesRef.current[messagesRef.current.length - 1].createdAt : "";
      const res = await fetch(`/api/chat/${conversationId}/messages?after=${encodeURIComponent(after)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: ChatMessage[];
        members: ChatReadState[];
        reactions: Record<string, ChatMessageReactionGroup[]>;
        pinned: ChatPinnedMessage[];
        updated: {
          id: string;
          body: string | null;
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
          editedAt: string | null;
          deletedForEveryone: boolean;
        }[];
        polls: Record<string, ChatPoll>;
        reminders: Record<string, ChatMessage["reminder"]>;
      };
      setReadState(data.members);
      setPinned(data.pinned);
      const updatedById = new Map(data.updated.map((u) => [u.id, u]));
      const pinnedIds = new Set(data.pinned.map((p) => p.messageId));
      // Reaction/pin/poll-vote/reminder/sửa/xóa-cho-tất-cả có thể phát sinh trên tin CŨ (ngoài khoảng
      // "after") — luôn vá lại MỌI tin đang hiển thị mỗi lần poll bằng snapshot mới nhất.
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = data.messages.filter((m) => !seen.has(m.id));
        const patched = prev.map((m) => {
          const upd = updatedById.get(m.id);
          return {
            ...m,
            reactions: data.reactions[m.id] ?? [],
            pinned: pinnedIds.has(m.id),
            poll: data.polls[m.id] ?? m.poll,
            reminder: data.reminders[m.id] ?? m.reminder,
            ...(upd ?? {}),
          };
        });
        if (fresh.length === 0) return patched;
        if (fresh.some((m) => m.senderId !== meId)) markRead(conversationId);
        return [...patched, ...fresh];
      });
    } catch {
      /* im lặng — poll/refresh lần sau thử lại */
    }
  }, [conversationId, meId]);

  // Poll tin nhắn mới theo chu kỳ cấu hình (settings.communication.message_poll_seconds)
  useEffect(() => {
    const iv = setInterval(refreshNow, Math.max(2, pollSeconds) * 1000);
    return () => clearInterval(iv);
  }, [refreshNow, pollSeconds]);

  // Auto-scroll khi có tin mới
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Bấm 1 emoji (quick-pick / full picker / pill đã react) → toggle rồi refresh ngay (không đợi poll).
  async function handleToggleReaction(messageId: string, emoji: string) {
    setReactionPickerMessageId(null);
    setFullEmojiPickerMessageId(null);
    await toggleReaction(messageId, emoji);
    refreshNow();
  }

  // Đóng menu "..." / quick-pick reaction khi click ra ngoài (cả 2 dùng chung data-chat-menu marker).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!(e.target as Element).closest?.("[data-chat-menu]")) {
        setOpenMenuMessageId(null);
        setReactionPickerMessageId(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleCopy(m: ChatMessage) {
    setOpenMenuMessageId(null);
    try {
      await navigator.clipboard.writeText(fullContentText(m, t));
    } catch {
      /* clipboard có thể bị chặn quyền — bỏ qua, không phải thao tác quan trọng */
    }
  }

  function startEdit(m: ChatMessage) {
    setOpenMenuMessageId(null);
    setEditError(null);
    setEditingMessageId(m.id);
    setEditDraft(m.body ?? "");
  }

  async function handleSaveEdit(messageId: string) {
    const body = editDraft.trim();
    if (!body) return;
    const res = await editMessage(messageId, body);
    if (res.error) {
      setEditError(res.error);
      return;
    }
    setEditingMessageId(null);
    setEditError(null);
    refreshNow();
  }

  async function handleDeleteForMe(messageId: string) {
    setOpenMenuMessageId(null);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await deleteMessageForMe(messageId);
  }

  async function handleDeleteForEveryone(messageId: string) {
    setOpenMenuMessageId(null);
    await deleteMessageForEveryone(messageId);
    refreshNow();
  }

  async function handlePin(messageId: string) {
    setOpenMenuMessageId(null);
    const res = await pinMessage(conversationId, messageId);
    if (res.error) {
      setPinError(res.error);
      setTimeout(() => setPinError(null), 3000);
      return;
    }
    refreshNow();
  }

  async function handleUnpin(messageId: string) {
    setOpenMenuMessageId(null);
    await unpinMessage(conversationId, messageId);
    refreshNow();
  }

  function openSeenBy(m: ChatMessage) {
    setOpenMenuMessageId(null);
    setSeenByMessage(m);
  }

  async function handleVotePollOption(pollOptionId: string) {
    await votePollOption(pollOptionId);
    refreshNow();
  }

  async function handleAddPollOption(pollId: string, text: string) {
    const res = await addPollOption(pollId, text);
    if (!res.error) refreshNow();
    return res;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {pinned.length > 0 && (
        <div className="flex-none space-y-1 border-b border-border bg-surface-2/60 px-4 py-2">
          {pinned.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <Pin className="h-3.5 w-3.5 flex-none text-brand-600" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-foreground">{p.senderName ?? t("systemSenderLabel")}: </span>
                <span className="text-muted-foreground">{replyPreviewText(p, t)}</span>
              </span>
              <button type="button" onClick={() => handleUnpin(p.messageId)} title={t("unpin")} className="flex-none rounded p-0.5 text-muted-foreground hover:bg-surface">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {pinError && (
        <div className="flex-none border-b border-border bg-danger/10 px-4 py-1.5 text-xs text-danger">{pinError}</div>
      )}
      <div className="flex-1 space-y-1 overflow-y-auto p-4">
        {messages.map((m, idx) => {
          if (m.type === "SYSTEM") return <SystemLine key={m.id} m={m} t={t} />;
          const mine = m.senderId === meId;
          const prev = messages[idx - 1];
          const showSender = !mine && (!prev || prev.senderId !== m.senderId || prev.type === "SYSTEM");
          const mentionNames = m.mentions.filter((x) => x.name).map((x) => x.name as string);
          const isMedia = m.type === "IMAGE" || m.type === "VIDEO";
          const attachmentUrl = `/api/chat/attachments/${m.id}`;
          const { readers, allRead } = getReadInfo(m, readState, allMemberIds);
          // Tin do hệ thống tự đăng (VD ảnh chào mừng thành viên mới) có senderId=null nhưng type≠SYSTEM —
          // hiện nhãn "TCM" thay vì để trống.
          const displaySenderName = m.senderName ?? (m.senderId === null ? t("systemSenderLabel") : null);
          return (
            <div key={m.id} className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
              {!mine && (
                <span className={cn("mt-auto flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[9px] font-semibold text-brand-700", !showSender && "invisible")}>
                  {initials(displaySenderName)}
                </span>
              )}
              <div className="max-w-[75%]">
                {showSender && <p className="mb-0.5 pl-1 text-[11px] font-medium text-muted-foreground">{displaySenderName}</p>}
                {m.isForwarded && (
                  <p className={cn("mb-0.5 flex items-center gap-1 text-[10px] italic text-muted-foreground", mine ? "justify-end" : "pl-1")}>
                    <ForwardIcon className="h-3 w-3" />
                    {t("forwardedLabel")}
                  </p>
                )}
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl text-sm",
                    isMedia ? "p-0.5" : "px-3 py-1.5",
                    mine ? "bg-brand-500 text-white" : "bg-surface-2 text-foreground",
                  )}
                >
                  {m.replyTo && !m.deletedForEveryone && (
                    <div className={cn("mb-1 rounded-lg border-l-2 px-2 py-1 text-xs", mine ? "border-white/50 bg-white/10 text-white/85" : "border-brand-400 bg-surface text-muted-foreground")}>
                      <p className="truncate font-medium">{m.replyTo.senderName ?? "—"}</p>
                      <p className="truncate">{replyPreviewText(m.replyTo, t)}</p>
                    </div>
                  )}
                  {m.deletedForEveryone ? (
                    <span className={cn("flex items-center gap-1.5 italic", mine ? "text-white/80" : "text-muted-foreground")}>
                      <Trash2 className="h-3.5 w-3.5 flex-none" />
                      {t("messageDeletedForEveryone")}
                    </span>
                  ) : m.type === "REMINDER" && m.reminder ? (
                    <ReminderCard reminder={m.reminder} mine={mine} t={t} locale={locale} />
                  ) : m.type === "POLL" && m.poll ? (
                    <PollCard poll={m.poll} mine={mine} t={t} locale={locale} onVote={handleVotePollOption} onAddOption={handleAddPollOption} />
                  ) : m.type === "LINK" ? (
                    <a href={m.linkUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="block">
                      <span className={cn("inline-flex items-center gap-1 underline", mine ? "text-white" : "text-brand-700")}>
                        <ExternalLink className="h-3.5 w-3.5 flex-none" />
                        {m.linkText || m.linkUrl}
                      </span>
                      {(m.linkPreviewTitle || m.linkPreviewDescription || m.linkPreviewImageUrl) && (
                        <span className={cn("mt-1.5 block overflow-hidden rounded-lg border", mine ? "border-white/30 bg-white/10" : "border-border bg-surface")}>
                          {m.linkPreviewImageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- ảnh preview từ site ngoài, load thẳng (không proxy qua server)
                            <img
                              src={m.linkPreviewImageUrl}
                              alt=""
                              className="h-32 w-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                          <span className="block px-2 py-1.5">
                            {m.linkPreviewSiteName && (
                              <span className={cn("block text-[10px] uppercase tracking-wide", mine ? "text-white/60" : "text-muted-foreground")}>{m.linkPreviewSiteName}</span>
                            )}
                            {m.linkPreviewTitle && (
                              <span className={cn("mt-0.5 block line-clamp-2 text-xs font-semibold", mine ? "text-white" : "text-foreground")}>{m.linkPreviewTitle}</span>
                            )}
                            {m.linkPreviewDescription && (
                              <span className={cn("mt-0.5 block line-clamp-2 text-[11px]", mine ? "text-white/75" : "text-muted-foreground")}>{m.linkPreviewDescription}</span>
                            )}
                          </span>
                        </span>
                      )}
                    </a>
                  ) : m.type === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ảnh phục vụ qua route có auth, không tối ưu qua next/image được
                    <img src={attachmentUrl} alt={m.attachmentName ?? ""} className="max-h-72 max-w-full rounded-xl object-contain" />
                  ) : m.type === "VIDEO" ? (
                    <video src={attachmentUrl} controls className="max-h-72 max-w-full rounded-xl" />
                  ) : m.type === "VOICE" ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <Mic className="h-4 w-4 flex-none" />
                      <audio src={attachmentUrl} controls className="h-8 max-w-[220px] flex-1" />
                      {m.attachmentDurationSec != null && (
                        <span className={cn("flex-none text-xs", mine ? "text-white/85" : "text-muted-foreground")}>{formatDuration(m.attachmentDurationSec)}</span>
                      )}
                    </div>
                  ) : m.type === "FILE" ? (
                    <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                      <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-lg", mine ? "bg-white/15" : "bg-brand-100")}>
                        <FileIcon className={cn("h-4.5 w-4.5", mine ? "text-white" : "text-brand-700")} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.attachmentName ?? "—"}</span>
                        {m.attachmentSize != null && (
                          <span className={cn("block text-[11px]", mine ? "text-white/75" : "text-muted-foreground")}>{(m.attachmentSize / 1024 / 1024).toFixed(1)} MB</span>
                        )}
                      </span>
                    </a>
                  ) : editingMessageId === m.id ? (
                    <div className="space-y-1">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        autoFocus
                        className={cn(
                          "w-full resize-none rounded-lg border px-2 py-1 text-sm outline-none",
                          mine ? "border-white/40 bg-white/10 text-white placeholder:text-white/60" : "border-border bg-surface",
                        )}
                      />
                      <div className="flex items-center justify-end gap-3">
                        <button type="button" onClick={() => setEditingMessageId(null)} className={cn("text-xs", mine ? "text-white/80" : "text-muted-foreground")}>
                          {t("cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(m.id)}
                          className={cn("rounded px-2 py-0.5 text-xs font-medium", mine ? "bg-white/20 text-white" : "bg-brand-500 text-white")}
                        >
                          {t("save")}
                        </button>
                      </div>
                      {editError && <p className="text-xs text-danger">{editError}</p>}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{renderBody(m.body ?? "", mentionNames, t("mentionAll"))}</span>
                  )}
                </div>
                <div className={cn("mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground", mine ? "justify-end" : "justify-start pl-1")}>
                  <span>{fmtTime(m.createdAt)}</span>
                  {m.editedAt && !m.deletedForEveryone && <span className="italic">{t("editedLabel")}</span>}
                  {m.pinned && <Pin className="h-3 w-3 flex-none text-brand-500" aria-label={t("pinned")} />}
                  {mine && (
                    <CheckCheck
                      className={cn("h-3 w-3 flex-none", allRead ? "text-brand-500" : "text-muted-foreground")}
                      aria-label={t("sentTick")}
                    />
                  )}
                  {allRead ? (
                    <span className="truncate">{t("readByAll")}</span>
                  ) : (
                    readers.length > 0 && (
                      <div
                        className="group/seen relative flex-none"
                        onMouseEnter={(e) => setSeenByFlipDownId(notEnoughSpaceAbove(e.currentTarget, 60) ? m.id : null)}
                      >
                        <span className="cursor-default underline decoration-dotted underline-offset-2">{t("seenByCount", { count: readers.length })}</span>
                        <div
                          className={cn(
                            "pointer-events-none absolute z-20 hidden w-max max-w-56 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-normal text-foreground shadow-lg group-hover/seen:block",
                            seenByFlipDownId === m.id ? "top-full mt-1" : "bottom-full mb-1",
                            mine ? "right-0" : "left-0",
                          )}
                        >
                          {readers.map((r) => r.fullName).join(", ")}
                        </div>
                      </div>
                    )
                  )}
                </div>
                {!m.deletedForEveryone && m.reactions.length > 0 && (
                  <div className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start pl-1")}>
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => handleToggleReaction(m.id, r.emoji)}
                        title={r.staffNames.join(", ")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none",
                          r.reactedByMe ? "border-brand-400 bg-brand-50 text-brand-700" : "border-border bg-surface-2 text-foreground",
                        )}
                      >
                        <span>{r.emoji}</span>
                        <span className="text-[10px] font-medium">{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!m.deletedForEveryone && (
                <div className={cn("flex flex-none items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100", mine && "order-first")}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        setReactionFlipDown(notEnoughSpaceAbove(e.currentTarget, 60));
                        setReactionPickerMessageId((id) => (id === m.id ? null : m.id));
                      }}
                      title={t("react")}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <SmilePlus className="h-3.5 w-3.5" />
                    </button>
                    {reactionPickerMessageId === m.id && (
                      <div
                        data-chat-menu
                        className={cn(
                          "absolute z-20 flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-xl",
                          reactionFlipDown ? "top-full mt-1" : "bottom-full mb-1",
                          mine ? "right-0" : "left-0",
                        )}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleToggleReaction(m.id, emoji)}
                            className="rounded-full p-1 text-lg hover:bg-surface-2"
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => { setFullEmojiPickerMessageId(m.id); setReactionPickerMessageId(null); }}
                          title={t("moreReactions")}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        setMenuFlipDown(notEnoughSpaceAbove(e.currentTarget, 260));
                        setOpenMenuMessageId((id) => (id === m.id ? null : m.id));
                      }}
                      title={t("moreActions")}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {openMenuMessageId === m.id && (
                      <div
                        data-chat-menu
                        className={cn(
                          "absolute z-20 w-48 rounded-xl border border-border bg-surface p-1 shadow-xl",
                          menuFlipDown ? "top-full mt-1" : "bottom-full mb-1",
                          mine ? "right-0" : "left-0",
                        )}
                      >
                        {mine && m.type === "TEXT" && <MenuButton icon={Pencil} label={t("edit")} onClick={() => startEdit(m)} />}
                        <MenuButton icon={ReplyIcon} label={t("reply")} onClick={() => { setReplyTarget(m); setOpenMenuMessageId(null); }} />
                        {m.type !== "REMINDER" && m.type !== "POLL" && (
                          <MenuButton icon={ForwardIcon} label={t("forward")} onClick={() => { setForwardMessageId(m.id); setOpenMenuMessageId(null); }} />
                        )}
                        <MenuButton icon={Copy} label={t("copyMessage")} onClick={() => handleCopy(m)} />
                        <MenuButton icon={Eye} label={t("seenBy")} onClick={() => openSeenBy(m)} />
                        {m.pinned ? (
                          <MenuButton icon={PinOff} label={t("unpin")} onClick={() => handleUnpin(m.id)} />
                        ) : (
                          <MenuButton icon={Pin} label={t("pin")} onClick={() => handlePin(m.id)} />
                        )}
                        <div className="my-1 border-t border-border" />
                        <MenuButton icon={Trash2} label={t("deleteForMe")} onClick={() => handleDeleteForMe(m.id)} danger />
                        {(mine || isAdmin) && <MenuButton icon={Trash2} label={t("deleteForEveryone")} onClick={() => handleDeleteForEveryone(m.id)} danger />}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <Composer
          conversationId={conversationId}
          members={members}
          onSent={refreshNow}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
          onOpenReminderModal={() => setReminderModalOpen(true)}
          onOpenPollModal={() => setPollModalOpen(true)}
        />
      ) : (
        <p className="border-t border-border p-4 text-center text-sm text-muted-foreground">{t("readOnlyNotMember")}</p>
      )}

      {forwardMessageId && <ForwardModal messageId={forwardMessageId} onClose={() => setForwardMessageId(null)} />}
      {fullEmojiPickerMessageId && (
        <EmojiPickerModal
          onSelect={(emoji) => handleToggleReaction(fullEmojiPickerMessageId, emoji)}
          onClose={() => setFullEmojiPickerMessageId(null)}
        />
      )}
      {seenByMessage && (
        <SeenByModal message={seenByMessage} readState={readState} allMemberIds={allMemberIds} onClose={() => setSeenByMessage(null)} />
      )}
      {reminderModalOpen && (
        <ReminderModal conversationId={conversationId} onClose={() => setReminderModalOpen(false)} onCreated={refreshNow} />
      )}
      {pollModalOpen && <PollModal conversationId={conversationId} onClose={() => setPollModalOpen(false)} onCreated={refreshNow} />}
    </div>
  );
}

function SeenByModal({
  message,
  readState,
  allMemberIds,
  onClose,
}: {
  message: ChatMessage;
  readState: ChatReadState[];
  allMemberIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("chat");
  const { readers } = getReadInfo(message, readState, allMemberIds);
  const readerIds = new Set(readers.map((r) => r.staffId));
  const others = allMemberIds.filter((id) => id !== message.senderId);
  const notSeen = others
    .map((id) => readState.find((r) => r.staffId === id))
    .filter((r): r is ChatReadState => !!r && !readerIds.has(r.staffId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("seenBy")}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("seenByCount", { count: readers.length })}</p>
            {readers.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noOne")}</p>
            ) : (
              <ul className="space-y-1">
                {readers.map((r) => (
                  <li key={r.staffId} className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-[9px] font-semibold text-brand-700">{initials(r.fullName)}</span>
                    {r.fullName}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("notSeenYet")}</p>
            {notSeen.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noOne")}</p>
            ) : (
              <ul className="space-y-1">
                {notSeen.map((r) => (
                  <li key={r.staffId} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold">{initials(r.fullName)}</span>
                    {r.fullName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReminderModal({ conversationId, onClose, onCreated }: { conversationId: string; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("chat");
  const [state, formAction, pending] = useActionState<ReminderState, FormData>(createReminder.bind(null, conversationId), {});
  const okRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.ok && state.ok !== okRef.current) {
      okRef.current = state.ok;
      onCreated();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated/onClose đọc giá trị mới nhất qua closure
  }, [state.ok]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form action={formAction} className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4" />
            {t("reminderModalTitle")}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reminderTitleLabel")}</label>
          <input name="title" required placeholder={t("reminderTitlePlaceholder")} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reminderTimeLabel")}</label>
          <input name="remindAt" type="datetime-local" required className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reminderRecurrenceLabel")}</label>
          <select name="recurrence" defaultValue="ONCE" className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400">
            <option value="ONCE">{t("recurrenceOnce")}</option>
            <option value="DAILY">{t("recurrenceDaily")}</option>
            <option value="WEEKLY">{t("recurrenceWeekly")}</option>
            <option value="MONTHLY">{t("recurrenceMonthly")}</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("reminderAudienceLabel")}</label>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="audience" value="ME" defaultChecked />
              {t("audienceMe")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="audience" value="GROUP" />
              {t("audienceGroup")}
            </label>
          </div>
        </div>

        {state.error && <p className="text-xs text-danger">{state.error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2">
            {t("cancel")}
          </button>
          <button type="submit" disabled={pending} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {t("reminderCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}

function PollModal({ conversationId, onClose, onCreated }: { conversationId: string; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("chat");
  const [state, formAction, pending] = useActionState<PollState, FormData>(createPoll.bind(null, conversationId), {});
  const [options, setOptions] = useState(["", ""]);
  const okRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.ok && state.ok !== okRef.current) {
      okRef.current = state.ok;
      onCreated();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated/onClose đọc giá trị mới nhất qua closure
  }, [state.ok]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form action={formAction} className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-surface p-4 shadow-xl">
        <div className="mb-3 flex flex-none items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4" />
            {t("pollModalTitle")}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("pollQuestionLabel")}</label>
            <textarea name="question" required rows={2} placeholder={t("pollQuestionPlaceholder")} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-400" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("pollOptionsLabel")}</label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  name="options"
                  required
                  value={opt}
                  onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                  placeholder={t("pollOptionNPlaceholder", { n: i + 1 })}
                  className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="flex-none rounded p-1.5 text-muted-foreground hover:bg-surface-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("pollAddOption")}
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("pollClosesAtLabel")}</label>
            <input name="closesAt" type="datetime-local" className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400" />
          </div>

          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowMultiple" value="1" />
              {t("pollSettingAllowMultiple")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="anonymous" value="1" />
              {t("pollSettingAnonymous")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="hideResultsUntilVoted" value="1" />
              {t("pollSettingHideResults")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowAddOptions" value="1" />
              {t("pollSettingAllowAddOptions")}
            </label>
          </div>

          {state.error && <p className="text-xs text-danger">{state.error}</p>}
        </div>

        <div className="mt-3 flex flex-none justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2">
            {t("cancel")}
          </button>
          <button type="submit" disabled={pending} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {t("pollCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}

function emojiCategoryLabel(t: ReturnType<typeof useTranslations>, key: string): string {
  switch (key) {
    case "smileys": return t("emojiCategorySmileys");
    case "gestures": return t("emojiCategoryGestures");
    case "hearts": return t("emojiCategoryHearts");
    case "celebration": return t("emojiCategoryCelebration");
    case "animals": return t("emojiCategoryAnimals");
    case "food": return t("emojiCategoryFood");
    case "activities": return t("emojiCategoryActivities");
    default: return key;
  }
}

function EmojiPickerModal({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const t = useTranslations("chat");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[70vh] w-full max-w-sm flex-col rounded-xl border border-border bg-surface p-3 shadow-xl">
        <div className="mb-2 flex flex-none items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("emojiPickerTitle")}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {EMOJI_CATEGORIES.map((cat) => (
            <div key={cat.key} className="mb-2">
              <p className="mb-1 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {emojiCategoryLabel(t, cat.key)}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji, i) => (
                  <button
                    key={`${cat.key}-${i}`}
                    type="button"
                    onClick={() => onSelect(emoji)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-surface-2"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ForwardModal({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const t = useTranslations("chat");
  const [targets, setTargets] = useState<ForwardTarget[] | null>(null);
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getForwardTargets().then((list) => {
      if (!cancelled) setTargets(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePick(target: ForwardTarget) {
    setSendingId(target.id);
    setError(null);
    const res = await forwardMessage(messageId, target.id);
    setSendingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDoneId(target.id);
    setTimeout(onClose, 700);
  }

  const filtered = (targets ?? []).filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{t("forwardTitle")}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchConversations")}
          className="mb-2 h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-brand-400"
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {targets === null && <p className="p-3 text-center text-xs text-muted-foreground">{t("loading")}</p>}
          {targets !== null && filtered.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">{t("noConversations")}</p>}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={sendingId === c.id}
              onClick={() => handlePick(c)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                {c.type === "GROUP" ? <Users className="h-4 w-4" /> : initials(c.title)}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              {doneId === c.id && <Check className="h-4 w-4 flex-none text-success" />}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}

function SystemLine({ m, t }: { m: ChatMessage; t: ReturnType<typeof useTranslations> }) {
  const actor = m.senderName ?? "—";
  const name = m.body ?? "—";
  let text = "";
  switch (m.systemEvent) {
    case "GROUP_CREATED": text = t("sysCreated", { actor }); break;
    case "MEMBER_ADDED": text = t("sysAdded", { actor, name }); break;
    case "MEMBER_LEFT": text = t("sysLeft", { name }); break;
    case "GROUP_RENAMED": text = t("sysRenamed", { actor, newName: name }); break;
    case "ROLE_PROMOTED": text = t("sysPromoted", { actor, name }); break;
    case "MEMBER_REMOVED": text = t("sysRemoved", { actor, name }); break;
    case "REMINDER_DUE": text = t("sysReminderDue", { title: name }); break;
    default: text = "";
  }
  return (
    <div className="my-1 text-center">
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted-foreground">
        {m.systemEvent === "REMINDER_DUE" && <Clock className="mr-1 inline h-3 w-3 align-text-bottom" />}
        {text}
      </span>
    </div>
  );
}

function ReminderCard({
  reminder,
  mine,
  t,
  locale,
}: {
  reminder: NonNullable<ChatMessage["reminder"]>;
  mine: boolean;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const dt = formatDateTime(reminder.remindAt);
  const recurrenceLabel =
    reminder.recurrence === "DAILY" ? t("recurrenceDaily") :
    reminder.recurrence === "WEEKLY" ? t("recurrenceWeekly") :
    reminder.recurrence === "MONTHLY" ? t("recurrenceMonthly") :
    t("recurrenceOnce");
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-full", mine ? "bg-white/15" : "bg-brand-100")}>
        <Clock className={cn("h-4 w-4", mine ? "text-white" : "text-brand-700")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{reminder.title}</p>
        <p className={cn("mt-0.5 text-xs", mine ? "text-white/80" : "text-muted-foreground")}>{dt}</p>
        <div className={cn("mt-1 flex flex-wrap items-center gap-2 text-[11px]", mine ? "text-white/80" : "text-muted-foreground")}>
          <span className="inline-flex items-center gap-1">
            <Repeat className="h-3 w-3" />
            {recurrenceLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            {reminder.audience === "GROUP" ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {reminder.audience === "GROUP" ? t("audienceGroup") : t("audienceMe")}
          </span>
          {!reminder.isActive && <span>{t("reminderDone")}</span>}
        </div>
      </div>
    </div>
  );
}

function PollCard({
  poll,
  mine,
  t,
  locale,
  onVote,
  onAddOption,
}: {
  poll: ChatPoll;
  mine: boolean;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  onVote: (pollOptionId: string) => void;
  onAddOption: (pollId: string, text: string) => Promise<{ error?: string }>;
}) {
  const [addingOption, setAddingOption] = useState(false);
  const [newOptionText, setNewOptionText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.voteCount, 0);

  async function submitNewOption() {
    const text = newOptionText.trim();
    if (!text) return;
    const res = await onAddOption(poll.id, text);
    if (res.error) {
      setAddError(res.error);
      return;
    }
    setNewOptionText("");
    setAddingOption(false);
    setAddError(null);
  }

  return (
    <div className="min-w-[220px] py-0.5">
      <p className="flex items-center gap-1.5 font-medium">
        <BarChart3 className="h-4 w-4 flex-none" />
        {poll.question}
      </p>
      <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]", mine ? "text-white/75" : "text-muted-foreground")}>
        {poll.anonymous && <span>{t("pollAnonymous")}</span>}
        {poll.allowMultiple && <span>{t("pollMultipleChoice")}</span>}
        {poll.closed ? (
          <span>{t("pollClosed")}</span>
        ) : (
          poll.closesAt && (
            <span>
              {t("pollClosesAt", { date: formatDateTime(poll.closesAt) })}
            </span>
          )
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {poll.options.map((o) => {
          const pct = totalVotes > 0 ? Math.round((o.voteCount / totalVotes) * 100) : 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={poll.closed}
              onClick={() => onVote(o.id)}
              className={cn(
                "relative block w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs disabled:cursor-default",
                o.votedByMe ? (mine ? "border-white/60 bg-white/20" : "border-brand-400 bg-brand-50 text-brand-700") : mine ? "border-white/30" : "border-border",
              )}
            >
              {poll.canSeeResults && (
                <span className={cn("absolute inset-y-0 left-0", mine ? "bg-white/10" : "bg-brand-100/60")} style={{ width: `${pct}%` }} />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {o.votedByMe && <Check className="h-3.5 w-3.5 flex-none" />}
                  <span className="truncate">{o.text}</span>
                </span>
                {poll.canSeeResults && <span className="flex-none font-medium">{pct}% ({o.voteCount})</span>}
              </span>
              {poll.canSeeResults && !poll.anonymous && o.voterNames.length > 0 && (
                <span className={cn("relative mt-0.5 block truncate text-[10px]", mine ? "text-white/70" : "text-muted-foreground")}>{o.voterNames.join(", ")}</span>
              )}
            </button>
          );
        })}
      </div>
      {poll.allowAddOptions && !poll.closed && (
        addingOption ? (
          <div className="mt-2 flex items-center gap-1">
            <input
              value={newOptionText}
              onChange={(e) => setNewOptionText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNewOption(); } }}
              placeholder={t("pollOptionPlaceholder")}
              autoFocus
              className={cn(
                "h-7 flex-1 rounded-lg border px-2 text-xs outline-none",
                mine ? "border-white/40 bg-white/10 text-white placeholder:text-white/60" : "border-border bg-surface",
              )}
            />
            <button type="button" onClick={submitNewOption} className={cn("rounded px-2 py-1 text-xs font-medium", mine ? "bg-white/20" : "bg-brand-500 text-white")}>
              {t("save")}
            </button>
            <button
              type="button"
              onClick={() => { setAddingOption(false); setNewOptionText(""); setAddError(null); }}
              className={cn("text-xs", mine ? "text-white/80" : "text-muted-foreground")}
            >
              {t("cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingOption(true)}
            className={cn("mt-2 flex items-center gap-1 text-xs font-medium", mine ? "text-white/85" : "text-brand-700")}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("pollAddOption")}
          </button>
        )
      )}
      {addError && <p className="mt-1 text-xs text-danger">{addError}</p>}
      {!poll.canSeeResults && <p className={cn("mt-1.5 text-[11px] italic", mine ? "text-white/70" : "text-muted-foreground")}>{t("pollResultsHiddenUntilVoted")}</p>}
      <p className={cn("mt-1.5 text-[11px]", mine ? "text-white/70" : "text-muted-foreground")}>{t("pollTotalVoters", { count: poll.totalVoters })}</p>
    </div>
  );
}

type ComposerMode = "text" | "link" | "image" | "video" | "file" | "voice-recording" | "voice-preview";

function Composer({
  conversationId,
  members,
  onSent,
  replyTarget,
  onClearReply,
  onOpenReminderModal,
  onOpenPollModal,
}: {
  conversationId: string;
  members: ChatStaff[];
  onSent: () => void;
  replyTarget: ChatMessage | null;
  onClearReply: () => void;
  onOpenReminderModal: () => void;
  onOpenPollModal: () => void;
}) {
  const t = useTranslations("chat");
  const [state, formAction, pending] = useActionState<SendState, FormData>(sendMessage.bind(null, conversationId), {});

  const [mode, setMode] = useState<ComposerMode>("text");
  const [bodyText, setBodyText] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // @mention inline — token chèn thẳng vào text (VD "@Nguyễn Văn A "); mentionIds tính lại mỗi
  // render bằng cách kiểm tra token còn nằm trong bodyText hay không (đơn giản, tự "gỡ" mention
  // nếu người dùng xóa/sửa tay phần tên trong câu — đúng hành vi các app chat phổ biến).
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [mentionAllToken, setMentionAllToken] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const [plusOpen, setPlusOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [finalDuration, setFinalDuration] = useState(0);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRef = useRef(false);
  const recordStartRef = useRef(0);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const okRef = useRef<number | undefined>(undefined);

  // Đóng menu "+" khi click ra ngoài
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) setPlusOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Dọn dẹp khi unmount (đang ghi âm / còn preview URL)
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, []);

  function clearAttachmentState() {
    setPendingFile(null);
    setFileError(null);
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    setVoicePreviewUrl(null);
    setFinalDuration(0);
    setRecordSeconds(0);
    setMicError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function cancelAttachment() {
    clearAttachmentState();
    setMode("text");
  }

  function openLinkMode() {
    setPlusOpen(false);
    clearAttachmentState();
    setMode("link");
  }

  function openFilePicker(kind: "IMAGE" | "VIDEO" | "FILE") {
    setPlusOpen(false);
    clearAttachmentState();
    setMode("text"); // chờ chọn file xong mới chuyển mode, tránh flash preview rỗng
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = kind === "IMAGE" ? "image/*" : kind === "VIDEO" ? "video/*" : ""; // FILE = mọi loại file
    input.dataset.kind = kind;
    input.click();
  }

  /**
   * Áp 1 file đã chọn/dán vào state đính kèm — dùng chung cho input "+" và paste ảnh (Ctrl+V).
   * Luôn đồng bộ lại `fileInputRef.files` bằng DataTransfer (mirror voice-recording ở dưới) —
   * paste KHÔNG đi qua `<input type=file>` thật nên submit sẽ gửi rỗng nếu bỏ bước này.
   */
  function applyPickedFile(file: File, kind: "IMAGE" | "VIDEO" | "FILE") {
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) {
      setFileError(t("errFileTooLarge"));
      return;
    }
    setFileError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dataset.kind = kind;
    }
    setPendingFile(file);
    setMode(kind === "IMAGE" ? "image" : kind === "VIDEO" ? "video" : "file");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const kind = e.target.dataset.kind as "IMAGE" | "VIDEO" | "FILE" | undefined;
    if (!file || !kind) return;
    applyPickedFile(file, kind);
  }

  /** Ctrl+V dán ảnh screenshot trực tiếp vào ô soạn tin — gửi như đính kèm hình, không cần qua nút "+". */
  function handleComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        clearAttachmentState();
        applyPickedFile(file, "IMAGE");
        return;
      }
    }
  }

  async function startRecording() {
    setPlusOpen(false);
    clearAttachmentState();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        if (recordIntervalRef.current) {
          clearInterval(recordIntervalRef.current);
          recordIntervalRef.current = null;
        }
        if (discardRef.current) {
          discardRef.current = false;
          setMode("text");
          setRecordSeconds(0);
          return;
        }
        const baseMime = (mr.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunks, { type: baseMime });
        const durationSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
        const ext = baseMime.split("/")[1] || "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: baseMime });
        const dt = new DataTransfer();
        dt.items.add(file);
        if (fileInputRef.current) {
          fileInputRef.current.accept = "audio/*";
          fileInputRef.current.files = dt.files;
        }
        setVoicePreviewUrl(URL.createObjectURL(blob));
        setFinalDuration(durationSec);
        setMode("voice-preview");
      };
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      mr.start();
      setMode("voice-recording");
      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_VOICE_SECONDS) {
            mediaRecorderRef.current?.stop();
            return MAX_VOICE_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch {
      setMicError(true);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    discardRef.current = true;
    mediaRecorderRef.current?.stop();
  }

  // reset sau khi gửi thành công
  useEffect(() => {
    if (state.ok && state.ok !== okRef.current) {
      okRef.current = state.ok;
      setBodyText("");
      setLinkText("");
      setLinkUrl("");
      setMentionMap({});
      setMentionAllToken(null);
      setMentionQuery(null);
      setPlusOpen(false);
      setMode("text");
      clearAttachmentState();
      onClearReply();
      onSent(); // làm mới ngay danh sách tin nhắn thay vì đợi tới chu kỳ poll tiếp theo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearAttachmentState/onSent/onClearReply đọc giá trị mới nhất qua closure mỗi render, không cần liệt kê lại
  }, [state.ok]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBodyText(val);
    const caret = e.target.selectionStart ?? val.length;
    const uptoCaret = val.slice(0, caret);
    const m = uptoCaret.match(/(?:^|\s)@([^\s@]*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionStart(caret - m[1].length - 1);
      setMentionActiveIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  /**
   * Shift+Enter xuống dòng. Nếu dòng hiện tại đang ở định dạng danh sách (số thứ tự "1. "/"1) "
   * hoặc bullet "- "/"* "/"•") → tự động nối tiếp mục kế (tăng số / lặp bullet) trên dòng mới,
   * giống Notion/Word. Dòng list rỗng (bấm Shift+Enter 2 lần liên tiếp) → bỏ marker, kết thúc danh sách.
   */
  function insertNewlineWithListContinuation() {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? bodyText.length;
    const lineStart = bodyText.lastIndexOf("\n", caret - 1) + 1;
    const currentLine = bodyText.slice(lineStart, caret);

    const numbered = currentLine.match(/^(\s*)(\d+)([.)])\s(.*)$/);
    const bullet = currentLine.match(/^(\s*)([-*•])\s(.*)$/);

    if ((numbered && numbered[4].trim() === "") || (bullet && bullet[3].trim() === "")) {
      // Dòng list đang rỗng — kết thúc danh sách: xóa marker thay vì nối tiếp
      const newBody = bodyText.slice(0, lineStart) + bodyText.slice(caret);
      setBodyText(newBody);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(lineStart, lineStart);
      });
      return;
    }

    let insertion = "\n";
    if (numbered) {
      const [, indent, num, sep] = numbered;
      insertion = `\n${indent}${Number(num) + 1}${sep} `;
    } else if (bullet) {
      const [, indent, marker] = bullet;
      insertion = `\n${indent}${marker} `;
    }

    const newBody = bodyText.slice(0, caret) + insertion + bodyText.slice(caret);
    setBodyText(newBody);
    const pos = caret + insertion.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function handleTextKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && mentionQuery !== null) {
      setMentionQuery(null);
      return;
    }

    if (hasSuggestions) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const total = mentionSuggestionList.length;
        setMentionActiveIndex((i) => (e.key === "ArrowDown" ? (i + 1) % total : (i - 1 + total) % total));
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const chosen = mentionSuggestionList[Math.min(mentionActiveIndex, mentionSuggestionList.length - 1)];
        if (chosen) {
          if (chosen.kind === "all") selectMentionAll();
          else selectMentionMember(chosen.member);
        }
        return;
      }
    }

    if (e.nativeEvent.isComposing) return; // đang gõ qua IME (VD bộ gõ tiếng Việt) — không can thiệp phím Enter

    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      insertNewlineWithListContinuation();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (bodyText.trim().length > 0) formRef.current?.requestSubmit();
    }
  }

  function insertMentionToken(token: string) {
    const before = bodyText.slice(0, mentionStart);
    const after = bodyText.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const insertion = token + " ";
    const newText = before + insertion + after;
    setBodyText(newText);
    setMentionQuery(null);
    const pos = before.length + insertion.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  function selectMentionMember(member: ChatStaff) {
    const token = "@" + member.fullName;
    setMentionMap((prev) => ({ ...prev, [member.id]: token }));
    insertMentionToken(token);
  }

  function selectMentionAll() {
    const token = "@" + t("mentionAll");
    setMentionAllToken(token);
    insertMentionToken(token);
  }

  const allLabel = t("mentionAll");
  const mentionSuggestions = mentionQuery !== null ? members.filter((m) => m.fullName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8) : [];
  const showAllSuggestion = mentionQuery !== null && allLabel.toLowerCase().includes(mentionQuery.toLowerCase());
  const hasSuggestions = mentionQuery !== null && (showAllSuggestion || mentionSuggestions.length > 0);
  // Danh sách gộp theo đúng thứ tự hiển thị — dùng để điều hướng bằng phím lên/xuống + Enter chọn.
  type MentionSuggestion = { kind: "all" } | { kind: "member"; member: ChatStaff };
  const mentionSuggestionList: MentionSuggestion[] = [
    ...(showAllSuggestion ? [{ kind: "all" as const }] : []),
    ...mentionSuggestions.map((m) => ({ kind: "member" as const, member: m })),
  ];

  const mentionIds = Object.entries(mentionMap)
    .filter(([, token]) => bodyText.includes(token))
    .map(([id]) => id);
  const mentionAll = mentionAllToken ? bodyText.includes(mentionAllToken) : false;

  const kind: "TEXT" | "LINK" | "IMAGE" | "VIDEO" | "FILE" | "VOICE" =
    mode === "link" ? "LINK" : mode === "image" ? "IMAGE" : mode === "video" ? "VIDEO" : mode === "file" ? "FILE" : mode === "voice-preview" ? "VOICE" : "TEXT";

  const canSubmit =
    mode === "text"
      ? bodyText.trim().length > 0
      : mode === "link"
        ? linkUrl.trim().length > 0
        : mode === "image" || mode === "video" || mode === "file"
          ? !!pendingFile
          : mode === "voice-preview"
            ? !!voicePreviewUrl
            : false;

  return (
    <form ref={formRef} action={formAction} className="border-t border-border p-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="mentionAll" value={mentionAll ? "1" : ""} />
      <input type="hidden" name="mentionIds" value={mentionIds.join(",")} />
      <input type="hidden" name="durationSec" value={mode === "voice-preview" ? String(finalDuration) : ""} />
      <input type="hidden" name="replyToId" value={replyTarget?.id ?? ""} />
      <input ref={fileInputRef} type="file" name="file" className="hidden" onChange={handleFileChange} />

      {replyTarget && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-brand-400 bg-surface-2 px-2 py-1.5">
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-foreground">{t("replyingTo", { name: replyTarget.senderName ?? "—" })}</p>
            <p className="truncate text-muted-foreground">{replyPreviewText(replyTarget, t)}</p>
          </div>
          <button type="button" onClick={onClearReply} className="flex-none rounded p-0.5 text-muted-foreground hover:bg-surface">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {mode === "link" && (
        <div className="mb-2 space-y-2 rounded-lg border border-border bg-surface-2 p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t("attachLink")}</span>
            <button type="button" onClick={() => setMode("text")} className="rounded p-0.5 text-muted-foreground hover:bg-surface">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input name="linkText" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder={t("linkTextPlaceholder")} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400" />
          <input name="linkUrl" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t("linkUrlPlaceholder")} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400" />
        </div>
      )}

      {(mode === "image" || mode === "video" || mode === "file") && pendingFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
          {mode === "image" ? <ImageIcon className="h-4 w-4 flex-none text-muted-foreground" /> : mode === "video" ? <Video className="h-4 w-4 flex-none text-muted-foreground" /> : <FileIcon className="h-4 w-4 flex-none text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{pendingFile.name}</span>
          <span className="flex-none text-[10px] text-muted-foreground">{(pendingFile.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" onClick={cancelAttachment} className="flex-none rounded p-0.5 text-muted-foreground hover:bg-surface">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {mode === "voice-recording" && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 p-2">
          <span className="h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-sm font-medium text-foreground">
            {t("recording")} · {formatDuration(recordSeconds)} / {formatDuration(MAX_VOICE_SECONDS)}
          </span>
          <button type="button" onClick={stopRecording} title={t("stopRecording")} className="flex-none rounded-lg bg-danger p-1.5 text-white hover:bg-danger/90">
            <StopCircle className="h-4 w-4" />
          </button>
          <button type="button" onClick={cancelRecording} title={t("cancelRecording")} className="flex-none rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode === "voice-preview" && voicePreviewUrl && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
          <Mic className="h-4 w-4 flex-none text-muted-foreground" />
          <audio src={voicePreviewUrl} controls className="h-8 flex-1" />
          <span className="flex-none text-xs text-muted-foreground">{formatDuration(finalDuration)}</span>
          <button type="button" onClick={cancelAttachment} className="flex-none rounded p-0.5 text-muted-foreground hover:bg-surface">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {mode === "text" && (
        <div className="relative">
          <textarea
            ref={textareaRef}
            name="body"
            value={bodyText}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            onPaste={handleComposerPaste}
            rows={2}
            placeholder={t("composerPlaceholder")}
            className="mb-2 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          {hasSuggestions && (
            <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
              {mentionSuggestionList.map((s, i) => {
                const active = i === mentionActiveIndex;
                if (s.kind === "all") {
                  return (
                    <button
                      key="all"
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selectMentionAll(); }}
                      onMouseEnter={() => setMentionActiveIndex(i)}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium", active ? "bg-brand-50" : "hover:bg-surface-2")}
                    >
                      @{allLabel}
                    </button>
                  );
                }
                return (
                  <button
                    key={s.member.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectMentionMember(s.member); }}
                    onMouseEnter={() => setMentionActiveIndex(i)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", active ? "bg-brand-50" : "hover:bg-surface-2")}
                  >
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-[9px] font-semibold text-brand-700">{initials(s.member.fullName)}</span>
                    <span className="truncate">{s.member.fullName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {fileError && <p className="mb-2 text-xs text-danger">{fileError}</p>}
      {micError && <p className="mb-2 text-xs text-danger">{t("micPermissionError")}</p>}
      {state.error && <p className="mb-2 text-xs text-danger">{state.error}</p>}

      <div className="flex items-center gap-2">
        <div className="relative" ref={plusMenuRef}>
          <button
            type="button"
            onClick={() => setPlusOpen((o) => !o)}
            disabled={mode === "voice-recording"}
            title={t("plusMenu")}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
          {plusOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-xl border border-border bg-surface p-1 shadow-xl">
              <button type="button" onClick={openLinkMode} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                {t("attachLink")}
              </button>
              <button type="button" onClick={() => openFilePicker("IMAGE")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                {t("attachImage")}
              </button>
              <button type="button" onClick={() => openFilePicker("VIDEO")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <Video className="h-4 w-4 text-muted-foreground" />
                {t("attachVideo")}
              </button>
              <button type="button" onClick={() => openFilePicker("FILE")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <FileIcon className="h-4 w-4 text-muted-foreground" />
                {t("attachFile")}
              </button>
              <button type="button" onClick={startRecording} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                {t("attachVoice")}
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => { setPlusOpen(false); onOpenReminderModal(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <Clock className="h-4 w-4 text-muted-foreground" />
                {t("attachReminder")}
              </button>
              <button
                type="button"
                onClick={() => { setPlusOpen(false); onOpenPollModal(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {t("attachPoll")}
              </button>
            </div>
          )}
        </div>
        <div className="flex-1" />
        {mode !== "voice-recording" && (
          <button type="submit" disabled={pending || !canSubmit} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            <Send className="h-4 w-4" />
            {t("send")}
          </button>
        )}
      </div>
    </form>
  );
}
