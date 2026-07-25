"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2, X, UserPlus, Shield, LogOut, Pencil, Camera, Trash2 } from "lucide-react";
import { initials } from "@/lib/utils";
import type { ChatStaff } from "./types";
import { StaffCheckList } from "./staff-picker";
import { renameGroup, addMembers, promoteToAdmin, leaveConversation, disbandGroup, updateGroupAvatar, removeMember } from "./actions";

type Member = { id: string; fullName: string; title: string | null; role: string };

export function GroupManager({
  conversationId,
  meId,
  name,
  members,
  candidates,
  myRole,
  isTcmFamily,
  avatarUrl,
}: {
  conversationId: string;
  meId: string | null;
  name: string;
  members: Member[];
  candidates: ChatStaff[];
  myRole: string;
  isTcmFamily: boolean;
  avatarUrl: string | null;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarPending, setAvatarPending] = useState(false);
  const [disbandError, setDisbandError] = useState<string | null>(null);
  const [disbandPending, setDisbandPending] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = myRole === "ADMIN";

  async function handleRemove(staffId: string, fullName: string) {
    if (!window.confirm(t("removeMemberConfirm", { name: fullName }))) return;
    await removeMember(conversationId, staffId);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarPending(true);
    const formData = new FormData();
    formData.set("avatar", file);
    const res = await updateGroupAvatar(conversationId, formData);
    setAvatarPending(false);
    if (res.error) setAvatarError(res.error);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function handleDisband() {
    if (!window.confirm(t("disbandGroupConfirm"))) return;
    setDisbandError(null);
    setDisbandPending(true);
    const res = await disbandGroup(conversationId);
    setDisbandPending(false);
    if (res?.error) setDisbandError(res.error);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={t("manageGroup")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
        <Settings2 className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 className="text-sm font-semibold text-foreground">{t("manageGroup")}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4">
              {/* Avatar nhóm (admin) */}
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("groupAvatar")}</label>
                  <div className="flex items-center gap-3">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview ảnh nhóm hiện tại, đã qua route/path hợp lệ
                      <img src={avatarUrl} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                        {initials(name)}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={avatarPending}
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {avatarPending ? t("loading") : t("changeAvatar")}
                    </button>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </div>
                  {avatarError && <p className="mt-1 text-xs text-danger">{avatarError}</p>}
                </div>
              )}

              {/* Đổi tên (admin) */}
              {isAdmin && (
                <form action={renameGroup.bind(null, conversationId)}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("renameGroup")}</label>
                  <div className="flex gap-2">
                    <input name="name" defaultValue={name} className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400" />
                    <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600">
                      <Pencil className="h-3.5 w-3.5" />
                      {t("save")}
                    </button>
                  </div>
                </form>
              )}

              {/* Danh sách thành viên */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("membersTitle")} ({members.length})</p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-2.5 py-1.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                        {initials(m.fullName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{m.fullName}</span>
                        {m.title && <span className="block truncate text-xs text-muted-foreground">{m.title}</span>}
                      </span>
                      {m.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                          <Shield className="h-3 w-3" />
                          {t("roleAdmin")}
                        </span>
                      ) : isAdmin ? (
                        <div className="flex items-center gap-1">
                          <form action={promoteToAdmin.bind(null, conversationId, m.id)}>
                            <button type="submit" className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-2">
                              {t("promote")}
                            </button>
                          </form>
                          {m.id !== meId && (
                            <button
                              type="button"
                              onClick={() => handleRemove(m.id, m.fullName)}
                              title={t("removeMember")}
                              className="rounded-full border border-danger/40 px-2 py-0.5 text-[10px] font-medium text-danger hover:bg-danger-bg"
                            >
                              {t("removeMember")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{t("roleMember")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Thêm thành viên (mọi thành viên) */}
              <form action={addMembers.bind(null, conversationId)}>
                <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5" />
                  {t("addMembersTitle")}
                </p>
                <StaffCheckList staff={candidates} name="memberIds" />
                {!isTcmFamily && (
                  <div className="mt-2 space-y-1 rounded-lg border border-border p-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("historyAccessLabel")}</p>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="radio" name="historyAccess" value="FULL" defaultChecked />
                      {t("historyAccessFull")}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="radio" name="historyAccess" value="FROM_NOW" />
                      {t("historyAccessFromNow")}
                    </label>
                  </div>
                )}
                <button type="submit" className="mt-2 w-full rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600">
                  {t("add")}
                </button>
              </form>

              {/* Rời nhóm */}
              <form action={leaveConversation.bind(null, conversationId)}>
                <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/40 py-2 text-sm font-medium text-danger hover:bg-danger/5">
                  <LogOut className="h-4 w-4" />
                  {t("leave")}
                </button>
              </form>

              {/* Giải tán nhóm (admin) */}
              {isAdmin && !isTcmFamily && (
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    disabled={disbandPending}
                    onClick={handleDisband}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger/10 py-2 text-sm font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("disbandGroup")}
                  </button>
                  {disbandError && <p className="mt-1 text-center text-xs text-danger">{disbandError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
