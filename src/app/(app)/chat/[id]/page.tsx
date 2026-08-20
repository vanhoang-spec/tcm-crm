import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentStaffId } from "@/lib/current-staff";
import { initials, groupAvatarUrl } from "@/lib/utils";
import { ChatConversation } from "../chat-conversation";
import { GroupManager } from "../group-manager";
import { DissolveDirectButton } from "../dissolve-direct-button";
import { toggleMute } from "../actions";
import { buildConversationView } from "../conversation-data";
import { requirePermission } from "@/lib/permissions";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("chat.use");
  const { id } = await params;
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();

  // Toàn bộ truy vấn dựng hội thoại nằm ở ../conversation-data.ts — dùng chung với hộp chat nổi.
  const view = await buildConversationView(id, meId);
  if (!view) notFound();

  const subtitle = view.isGroup ? t("membersCount", { count: view.memberCount }) : (view.otherTitle ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header hội thoại */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        {/* ⚠ Có CHỮ chứ không chỉ mũi tên: trên điện thoại, mở lại trình duyệt là rơi thẳng vào hội
            thoại cũ (trình duyệt khôi phục URL), lúc đó một icon nhỏ rất dễ bị bỏ qua và người dùng
            không biết đường về danh sách. flex-none để không bị co lại khi tên hội thoại dài. */}
        <Link
          href="/chat"
          className="flex flex-none items-center gap-1 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 lg:hidden"
          aria-label={t("backToList")}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-xs font-medium">{t("backToList")}</span>
        </Link>
        {view.isGroup && view.avatarKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- path tĩnh public HOẶC ảnh upload qua route có auth (xem groupAvatarUrl)
          <img src={groupAvatarUrl(id, view.avatarKey) ?? undefined} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {view.isGroup ? <Users className="h-5 w-5" /> : initials(view.title)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{view.title}</p>
          <p className="truncate text-xs text-muted-foreground">{view.superAdminView ? t("superAdminViewHint") : subtitle}</p>
        </div>

        {view.canSend && (
          <form action={toggleMute.bind(null, id)}>
            <button type="submit" title={view.muted ? t("unmute") : t("mute")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
              {view.muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </button>
          </form>
        )}
        {view.isGroup && view.canSend && (
          <GroupManager
            conversationId={id}
            meId={meId}
            name={view.title}
            members={view.managerMembers}
            candidates={view.candidates}
            myRole={view.isAdmin ? "ADMIN" : "MEMBER"}
            isTcmFamily={view.isTcmFamily}
            avatarUrl={groupAvatarUrl(id, view.avatarKey)}
          />
        )}
        {!view.isGroup && view.canSend && <DissolveDirectButton conversationId={id} />}
      </div>

      <ChatConversation
        conversationId={id}
        initial={view.initial}
        meId={meId}
        members={view.mentionMembers}
        canSend={view.canSend}
        pollSeconds={view.pollSeconds}
        initialReadState={view.readState}
        allMemberIds={view.allMemberIds}
        isAdmin={view.isAdmin}
        initialPinned={view.pinned}
      />
    </div>
  );
}
