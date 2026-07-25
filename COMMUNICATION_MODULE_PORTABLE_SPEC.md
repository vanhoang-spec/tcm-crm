# Communication / Chat Module — Portable Implementation Spec

> Source project: TCM CRM (Next.js 16 + TypeScript + Prisma 6 + SQLite dev + next-intl).
> This document is a complete, mechanical porting spec for module ⑨ "Communication" (internal
> name in code/comments: "Trao đổi"). Every source file below is pasted **verbatim** from the
> source repository as of the time this doc was generated. Follow section 11 to rename
> company-specific literals for the target company.

---

## 1. Feature Overview

- **1-1 (DIRECT) chat** — idempotent get-or-create between any two staff members.
- **Group chat (GROUP)** — named, multi-admin, member list.
- **Multi-admin groups** — any admin can promote another member to admin; admins can rename,
  change avatar, add members, disband.
- **Add / promote / leave / disband** group membership flows, each emitting a `SYSTEM` message.
- **Group avatar upload** (admin-only), stored on local disk, served through an authenticated route.
- **History-visible-from-join** — when adding a member, the group admin can choose to grant full
  chat history or restrict the new member to messages from the moment they were added
  (`ConversationMember.historyVisibleFrom`).
- **Pin-to-top per user** — each member can pin/unpin a conversation to the top of *their own*
  conversation list (`ConversationMember.sidebarPinnedAt`) — this does not affect other members.
- **Mute per user** — each member can mute/unmute notifications for a conversation for themselves
  only (`ConversationMember.notificationsMuted`).
- **@mention and @all** — inline mention autocomplete in the composer; mentions bypass mute for
  notification purposes.
- **System messages** for every membership event (`GROUP_CREATED`, `MEMBER_ADDED`, `MEMBER_LEFT`,
  `GROUP_RENAMED`, `ROLE_PROMOTED`, `REMINDER_DUE`), rendered client-side via i18n templates
  (never hardcoded server-side text).
- **Attachments** — image / video / voice / generic file, each with its own MIME allowlist and
  size limit; voice attachments carry a duration (max 5 minutes) and are re-validated server-side.
- **Reply** — quote another message in the same conversation (validated server-side, cannot cross
  conversations).
- **Forward** — copy a message's content (independent record, no back-link) into another
  conversation the user is also a member of. `SYSTEM`, `REMINDER`, and `POLL` messages cannot be
  forwarded.
- **Read receipts** — derived purely from `ConversationMember.lastReadAt` (no dedicated
  read-receipt table); shows "seen by N" / "seen by all" / a "seen by" / "not seen yet" modal.
- **Link preview (unfurl)** — server-side fetch of `og:title` / `og:description` / `og:image` /
  `og:site_name` when a `LINK` message is sent, SSRF-guarded via DNS-resolve-then-check-private-IP.
- **Polling-based near-realtime** — no websockets; the client polls
  `GET /api/chat/[id]/messages?after=...` on an interval configurable in Settings (default 4s,
  clamped 2–60s).
- **Message edit** (TEXT only, sender only, sets `editedAt`), **delete for me** (per-user hide,
  `MessageDeletion`), **delete for everyone** (sender OR group admin; scrubs content, keeps a
  tombstone row so replies/pins don't dangle; also deletes the attachment file from disk).
- **Pin message** — up to 3 pinned messages per conversation at a time, shown in a strip above the
  message list; any member can pin/unpin.
- **In-chat reminders** — `type=REMINDER` message + `Reminder` row; "due" check runs on every app
  layout render (no real cron); supports ONCE/DAILY/WEEKLY/MONTHLY recurrence and ME/GROUP audience;
  idempotent via optimistic-concurrency `UPDATE ... WHERE remindAt = <value just read>`.
- **In-chat polls** — `type=POLL` message + `Poll`/`PollOption`/`PollVote`; supports
  `allowMultiple`, `anonymous`, `hideResultsUntilVoted`, `allowAddOptions`, optional `closesAt`.
- **Message reactions** — Messenger-style, **fully implemented** (not schema-only): each member may
  react with exactly one emoji per message (re-clicking the same emoji removes it, picking a
  different emoji overwrites it). A 7-emoji "quick pick" bar plus a full categorized emoji picker
  (`src/lib/emoji-data.ts`) are both wired up in the UI. See §10 for the one caveat.
- **Super-admin read-only "view all groups"** — staff whose `title` matches a configurable
  comma-separated list (Setting `communication.super_admin_titles`, default `"CEO"`) can browse
  every GROUP conversation and open any of them read-only (cannot send, no compose box shown).
- **Auto-posted celebration messages** into a designated "family" group (constant
  `TCM_FAMILY_GROUP_NAME = "GIA ĐÌNH TCM"`): staff birthday, work anniversary (based on
  `Staff.firstWorkDate`, not `createdAt`), and company birthday — all self-drawn SVG cards (no
  external image assets), de-duplicated per day via `SpecialOccasionLog`.
- **Auto-join "family" group on first act-as login** — any staff whose email ends with the
  hardcoded domain `@tcmbtl.com` is automatically added to the family group the first time they
  are "acted as", with a self-drawn welcome SVG posted by the system.
- **Settings page** (`/settings/communication`) for the two tunables: super-admin titles CSV and
  message-poll interval in seconds.

---

## 2. Architecture Summary

- **No real authentication.** The entire app uses an "act as" cookie stub
  (`src/lib/current-staff.ts` + `src/app/(app)/act-as/actions.ts`) to answer "who am I". Every
  server action / route in this module calls `getCurrentStaffId()` and treats the result as the
  authenticated identity. This is documented in depth in §3/§9/§11 — it is the single most
  important prerequisite to understand before porting.
- **No websockets — polling.** The conversation UI polls
  `GET /api/chat/[id]/messages?after=<lastMessageCreatedAt ISO>` on an interval
  (`Setting("communication","message_poll_seconds")`, default 4s). The poll response also returns
  the *entire* current state of reactions, pins, polls, reminders, and edited/deleted messages for
  the conversation (not just new rows) so that mutations on already-loaded (old) messages are
  patched into the client's state on every tick.
- **Local-disk attachment storage, outside `public/`.** `src/lib/chat-storage.ts` writes files to
  `<cwd>/storage/chat-uploads/YYYY/MM/<32-hex-random>.<ext>` and never serves them statically —
  everything goes through authenticated Next.js route handlers
  (`/api/chat/attachments/[id]`, `/api/chat/group-avatar/[id]`) that check conversation membership
  (or super-admin) before streaming bytes. The DB only stores the relative `storageKey`, so
  swapping to S3/MinIO later only requires changing the 2 functions in that file.
- **Per-member fields drive pin/mute/history-cutoff.** `ConversationMember` carries
  `sidebarPinnedAt`, `notificationsMuted`, `lastReadAt`, and `historyVisibleFrom` — all scoped to
  one (conversation, staff) pair, so behavior like "mute" or "pin to top" never affects other
  members.
- **System messages are regular `Message` rows** with `type="SYSTEM"`, `senderId` = the actor (or
  `null` for system-initiated events like reminder-due or auto-join), and a `systemEvent`
  discriminator string. The `body` column is repurposed as "the secondary variable" (e.g. the name
  of the member added, or the new group name) — the actual sentence is composed **client-side**
  via i18n templates in `chat-conversation.tsx`'s `SystemLine` component, never hardcoded
  server-side (unlike `Notification.title`/`body`, which ARE hardcoded server strings).
- **Notification fan-out pattern.** `notifyNewMessage()` in `src/lib/chat.ts` reads all
  `ConversationMember` rows for the conversation, splits them into "mentioned" (bypasses mute) vs.
  "everyone else" (respects mute), and bulk-inserts `Notification` rows via
  `prisma.notification.createMany`. The sender never receives their own notification.
- **No cron — "check on render".** Special-occasion messages (`src/lib/occasions.ts`) and
  reminder-due checks (`src/lib/chat-reminders.ts`) are invoked from the top-level authenticated
  layout (`src/app/(app)/layout.tsx`) on every request, alongside the app's other reminder checks.
  This means "at 9:00am" really means "the next time anyone loads any page after 9:00am that day" —
  a known limitation of this no-cron architecture, not a bug.

---

## 3. Prerequisites in the target codebase

1. **An "act as" (or equivalent) identity stub**, exposing an async `getCurrentStaffId(): Promise<string | null>`.
   In this codebase (`src/lib/current-staff.ts`):
   - Identity is stored in an HMAC-signed cookie (`tcm_act_as`), signed with
     `createHmac("sha256", SECRET)` where
     `SECRET = process.env.ACT_AS_SECRET ?? "tcm-dev-actas-secret-change-in-prod"` — **a
     hardcoded dev fallback secret shipped in source**, flagged in §9/§11 as a MUST-CHANGE.
   - Signature format: `"<staffId>.<hexHmac>"`; verified with `timingSafeEqual`.
   - If no valid cookie is present, it falls back to a **hardcoded lookup by email**:
     `prisma.staff.findUnique({ where: { email: "ceo@tcm.vn" } })` — **company-specific and must be
     changed** (see §11).
   - `setActAsStaff(staffId)` in `src/app/(app)/act-as/actions.ts` is the only "login" surface in
     the whole app; it also triggers `ensureTcmFamilyMembership()` (the chat module's auto-join
     side effect) — see §11 for why this coupling is dangerous to port blindly.
   - This is NOT real security. Every "permission" in the chat module (group admin, super-admin)
     is enforced only against whatever staffId the cookie currently claims.
2. **A `Staff` model** with at minimum: `id`, `fullName`, `email` (unique), `title` (nullable
   string — used for super-admin title matching), `isActive`, a `department` relation (nullable —
   only `department.name` is read, for the act-as switcher label), `dateOfBirth` (nullable
   `DateTime`, used for birthday auto-posts), `firstWorkDate` (nullable `DateTime`, **distinct from
   `createdAt`** — "actual first day of work", used for work-anniversary auto-posts).
3. **A `Notification` model** — see exact shape in §4. Chat writes rows with:
   `recipientStaffId`, `type` (one of `CHAT_MESSAGE` | `CHAT_MENTION` | `REMINDER_DUE` |
   `POLL_CREATED` — note `POLL_CREATED` is declared in the enum comment but not currently emitted
   by any code path; poll creation notifies via the generic `CHAT_MESSAGE`/`CHAT_MENTION` path
   like any other message), `title`, `body`, `conversationId`. Fan-out call sites:
   `prisma.notification.createMany` in `src/lib/chat.ts::notifyNewMessage()` and
   `src/lib/chat-reminders.ts::checkChatReminders()`.
4. **A generic key/value `Setting` table**, read via two helper functions the chat settings page
   and `isSuperAdmin()`/poll-interval logic call directly (only these two are needed — do not
   port the whole file):
   ```ts
   // src/lib/settings.ts (relevant excerpt — signatures only, port your own impl or copy these)
   export async function getNumberSetting(module: string, key: string, fallback: number): Promise<number> {
     const s = await prisma.setting.findUnique({
       where: { module_key_scope_scopeRef: { module, key, scope: "GLOBAL", scopeRef: "" } },
     });
     const n = s ? Number(s.value) : NaN;
     return Number.isFinite(n) ? n : fallback;
   }

   export async function getStringSetting(module: string, key: string, fallback: string): Promise<string> {
     const s = await prisma.setting.findUnique({
       where: { module_key_scope_scopeRef: { module, key, scope: "GLOBAL", scopeRef: "" } },
     });
     return s && s.value.trim() ? s.value : fallback;
   }
   ```
   Underlying `Setting` model shape (from `prisma/schema.prisma`):
   ```prisma
   model Setting {
     id        String   @id @default(cuid())
     module    String
     key       String
     value     String // JSON or numeric text
     scope     String   @default("GLOBAL") // GLOBAL | TEAM | PROJECT
     scopeRef  String   @default("")
     updatedBy String?
     updatedAt DateTime @updatedAt

     @@unique([module, key, scope, scopeRef])
     @@map("setting")
   }
   ```
   Chat's settings actions write via `prisma.setting.upsert` directly with
   `module: "communication"` and keys `"super_admin_titles"` / `"message_poll_seconds"`.
5. **Local filesystem storage** for attachments — see `src/lib/chat-storage.ts` in full in §6.
   Directory layout: `<process.cwd()>/storage/chat-uploads/YYYY/MM/<32-hex>.<ext>`. This directory
   MUST be added to `.gitignore` (see §8). MIME allowlists, size caps, and a strict
   `storageKey` regex (`/^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/`) guard against path
   traversal. There is **no magic-byte sniffing** — validation is MIME-header-based only
   (`file.type` from the browser `File` object), which is a known, accepted limitation for an
   internal tool (see §10).
6. **next-intl** (`getTranslations` server-side, `useTranslations`/`useLocale` client-side) with a
   namespace structure matching `messages/<locale>.json` → `chat`, `settings.communication`,
   `nav.chat`, `header.actAs`. See §7 for the exact JSON.
7. **An existing pattern for server actions + `revalidatePath`** (Next.js App Router
   `"use server"` actions calling `revalidatePath`) — the target codebase should already have this
   convention since every action file in this module follows it.
8. **An `AuditLog` model is NOT used by chat.** None of the chat code paths write to `AuditLog` —
   do not assume it is a dependency despite the task brief's caution; it was verified absent via
   grep across all chat source files.

---

## 4. Prisma Schema — full copy-pasteable block

Datasource/generator block from the source `prisma/schema.prisma` (SQLite for dev — swap
`provider`/`DATABASE_URL` for Postgres/MySQL in production; the chat schema below uses no
SQLite-specific features):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

### Core chat models (Phase 1 + Phase 2, all currently active in production code)

```prisma
// ─────────────────────────────────────────────────────────
// MODULE ⑨ — COMMUNICATION (internal chat) · Phase 1
// No real auth → "act as" (lib/current-staff.ts) decides "who am I".
// No realtime → client polls /api/chat/[id]/messages every ~4s.
// ─────────────────────────────────────────────────────────

/// Conversation: DIRECT (1-1, name/avatar null, title derived from the other member) or GROUP.
model Conversation {
  id          String   @id @default(cuid())
  type        String   @default("DIRECT") // DIRECT | GROUP
  name        String? // group
  avatarKey   String? // group avatar — 2 forms: starts with "/" = static path under /public
                        // (e.g. "/brand/icon-square.png" for the seeded family group — <img> loads it
                        // directly); does NOT start with "/" = an uploaded-image storageKey (see
                        // lib/chat-storage.ts), served through /api/chat/group-avatar/[id] which checks membership
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  createdBy     Staff?               @relation("ConversationCreatedBy", fields: [createdById], references: [id])
  members       ConversationMember[]
  messages      Message[]
  notifications Notification[]
  pinnedMessages PinnedMessage[]
  reminders     Reminder[]

  @@index([type])
  @@map("conversation")
}

/// Conversation membership. Leaving = hard delete of this row (consistent with the app's
/// "no soft-delete" convention) + a system message.
model ConversationMember {
  id                 String    @id @default(cuid())
  conversationId     String
  staffId            String
  role               String    @default("MEMBER") // ADMIN | MEMBER
  notificationsMuted Boolean   @default(false)
  lastReadAt         DateTime? // per-person unread tracking
  joinedAt           DateTime  @default(now())
  historyVisibleFrom DateTime? // null = full history visible; set = only messages from this point on
                                // (set = the moment they were added, when an admin picks "don't let them
                                // read old history" in addMembers(); NEVER applied to the family group —
                                // that group always has this null)
  sidebarPinnedAt    DateTime? // pins this conversation to the top of THIS person's own list only
                                // (different from PinnedMessage, which pins a message within a conversation)

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  staff        Staff        @relation(fields: [staffId], references: [id])

  @@unique([conversationId, staffId])
  @@index([staffId])
  @@map("conversation_member")
}

/// Message. senderId null for SYSTEM (and for system-authored content like celebration cards).
/// type=LINK uses linkUrl+linkText. systemEvent drives i18n rendering client-side (never hardcoded
/// like Notification text).
model Message {
  id             String    @id @default(cuid())
  conversationId String
  senderId       String? // null for SYSTEM (and system-authored posts)
  type           String    @default("TEXT") // TEXT | LINK | SYSTEM | IMAGE | VIDEO | VOICE | FILE | REMINDER | POLL
  body           String? // text content; for SYSTEM = secondary variable (name of added member / new group name)
  systemEvent    String? // GROUP_CREATED | MEMBER_ADDED | MEMBER_LEFT | GROUP_RENAMED | ROLE_PROMOTED | REMINDER_DUE
  linkUrl        String? // type=LINK
  linkText       String? // type=LINK
  linkPreviewTitle       String? // type=LINK — og:title (unfurled server-side at send time, see lib/link-preview.ts)
  linkPreviewDescription String? // type=LINK — og:description
  linkPreviewImageUrl    String? // type=LINK — og:image (absolute URL on the external site, client loads it directly — not proxied)
  linkPreviewSiteName    String? // type=LINK — og:site_name (falls back to hostname)
  attachmentKey          String? // type=IMAGE|VIDEO|VOICE|FILE — local-disk storage key (see lib/chat-storage.ts), never exposed to the client
  attachmentName         String? // original filename (IMAGE|VIDEO|FILE)
  attachmentMime         String? // server-validated MIME
  attachmentSize         Int? // bytes
  attachmentDurationSec  Int? // type=VOICE — recording length, max 300s (5 min)
  replyToId      String? // reply to another message — MUST be in the same conversation (validated in the action, not enforced at the DB level)
  isForwarded    Boolean   @default(false) // copied from another conversation (independent content copy, no back-link — avoids leaking source-conversation visibility)
  createdAt      DateTime  @default(now())
  editedAt       DateTime? // set when the sender edits content (TEXT only — see editMessage())
  deletedForEveryoneAt DateTime? // "Delete for everyone" — content cleared (body/link/attachment), tombstone shown to ALL; sender OR a group admin can do this
  deletedById          String? // who clicked "Delete for everyone"

  conversation Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       Staff?            @relation("MessageSender", fields: [senderId], references: [id])
  deletedBy    Staff?            @relation("MessageDeletedBy", fields: [deletedById], references: [id])
  mentions     MessageMention[]
  replyTo      Message?          @relation("MessageReply", fields: [replyToId], references: [id], onDelete: SetNull)
  replies      Message[]         @relation("MessageReply")
  reactions    MessageReaction[]
  deletions    MessageDeletion[] // "Delete for me" — one row per person who hid this message for themselves
  pins         PinnedMessage[]
  reminder     Reminder? // type=REMINDER — 1-1, see Reminder.messageId
  poll         Poll? // type=POLL — 1-1, see Poll.messageId

  @@index([conversationId, createdAt])
  @@map("message")
}

/// A reminder created directly in the chat composer — posts a TEXT-ish message (type=REMINDER) as
/// the "reminder scheduled" notice, then the system fires it when remindAt is reached
/// (check-on-render, see lib/chat-reminders.ts). Recurrences other than ONCE auto-advance remindAt
/// to the next occurrence after each firing (no new message is created for recurrences).
/// Idempotency against duplicate firing under concurrent requests: optimistic concurrency directly
/// on remindAt (UPDATE ... WHERE remindAt = <value just read>) — whoever updates first "wins",
/// anyone racing gets updateMany count=0 (WHERE no longer matches) and silently no-ops — no separate
/// log table needed (unlike SpecialOccasionLog).
model Reminder {
  id             String    @id @default(cuid())
  conversationId String
  messageId      String    @unique
  createdById    String?
  title          String
  remindAt       DateTime // next firing time (auto-advances if recurring)
  recurrence     String    @default("ONCE") // ONCE | DAILY | WEEKLY | MONTHLY
  audience       String    @default("ME") // ME (creator only) | GROUP (whole conversation)
  isActive       Boolean   @default(true) // false once a ONCE reminder has fired, or if cancelled
  lastFiredAt    DateTime?
  createdAt      DateTime  @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  message      Message      @relation(fields: [messageId], references: [id], onDelete: Cascade)
  createdBy    Staff?       @relation(fields: [createdById], references: [id])

  @@index([isActive, remindAt])
  @@map("reminder")
}

/// A poll created directly in the chat composer — 1-1 with a Message (type=POLL). ≥2 options
/// required at creation; more can be added later if allowAddOptions. Votes live in PollVote
/// (unique on option+person — 1 person 1 vote per option; allowMultiple decides whether a person
/// may vote on more than one option at once, enforced in the action).
model Poll {
  id                    String    @id @default(cuid())
  messageId             String    @unique
  question              String
  allowMultiple         Boolean   @default(false)
  anonymous             Boolean   @default(false) // hide voter names when viewing results
  hideResultsUntilVoted Boolean   @default(false) // hide numbers from a viewer until THEY have voted (or the poll is closed)
  allowAddOptions       Boolean   @default(false) // other members may add new options
  closesAt              DateTime?
  createdById           String?
  createdAt             DateTime  @default(now())

  message   Message      @relation(fields: [messageId], references: [id], onDelete: Cascade)
  createdBy Staff?        @relation(fields: [createdById], references: [id])
  options   PollOption[]

  @@map("poll")
}

model PollOption {
  id        String   @id @default(cuid())
  pollId    String
  text      String
  sort      Int
  addedById String? // null = added by the poll creator at creation time; set = a member added it later (allowAddOptions)
  createdAt DateTime @default(now())

  poll    Poll       @relation(fields: [pollId], references: [id], onDelete: Cascade)
  addedBy Staff?      @relation(fields: [addedById], references: [id])
  votes   PollVote[]

  @@index([pollId])
  @@map("poll_option")
}

model PollVote {
  id           String   @id @default(cuid())
  pollOptionId String
  staffId      String
  createdAt    DateTime @default(now())

  pollOption PollOption @relation(fields: [pollOptionId], references: [id], onDelete: Cascade)
  staff      Staff      @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([pollOptionId, staffId])
  @@map("poll_vote")
}

/// "Delete for me" — only hides a message from the person who deleted it, no effect on others
/// (distinct from Message.deletedForEveryoneAt). One row per (message, person).
model MessageDeletion {
  id        String   @id @default(cuid())
  messageId String
  staffId   String
  deletedAt DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([messageId, staffId])
  @@map("message_deletion")
}

/// A message pinned to the top of a conversation — MAX 3 messages per conversation at a time
/// (enforced in the pinMessage action by counting before insert — sufficient for an internal
/// deployment of ~30-45 people; no race-guard mechanism like SpecialOccasionLog is needed here).
model PinnedMessage {
  id             String   @id @default(cuid())
  conversationId String
  messageId      String
  pinnedById     String?
  pinnedAt       DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  message      Message      @relation(fields: [messageId], references: [id], onDelete: Cascade)
  pinnedBy     Staff?       @relation(fields: [pinnedById], references: [id])

  @@unique([conversationId, messageId])
  @@map("pinned_message")
}

/// A name-mention inside a message (@name / @all). isAll=true → mentions every member (staffId null).
model MessageMention {
  id        String  @id @default(cuid())
  messageId String
  staffId   String? // null if isAll
  isAll     Boolean @default(false)

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  staff   Staff?  @relation(fields: [staffId], references: [id])

  @@index([staffId])
  @@map("message_mention")
}

/// Reaction (Messenger-style) — each member gets EXACTLY 1 emoji per message; changing emoji =
/// overwrite (update), clicking the same emoji again = remove (delete). Stores the raw Unicode
/// character — no hardcoded allowlist, so any emoji from the full picker (not just the 7
/// quick-reactions) can be chosen. FULLY IMPLEMENTED — UI included (see §6).
model MessageReaction {
  id        String   @id @default(cuid())
  messageId String
  staffId   String
  emoji     String
  createdAt DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  staff   Staff   @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([messageId, staffId])
  @@map("message_reaction")
}

/// Prevents duplicate auto-posted daily messages (birthday/anniversary/company birthday) — inserted
/// BEFORE posting the message (not after), so the unique constraint itself guards against race
/// conditions when multiple requests trigger the check at once (see lib/occasions.ts).
model SpecialOccasionLog {
  id           String   @id @default(cuid())
  occasionType String // STAFF_BIRTHDAY | WORK_ANNIVERSARY | COMPANY_BIRTHDAY
  refId        String // staffId (first 2 types) or the constant "TCM" (company)
  occasionDate DateTime // day (00:00 local) already processed — 1 row per day/type/subject
  messageId    String? // the Message created, if any (kept even if the message is later deleted)
  createdAt    DateTime @default(now())

  @@unique([occasionType, refId, occasionDate])
  @@map("special_occasion_log")
}
```

### Foundation fields chat depends on (subset of `Staff`, `Notification`)

```prisma
model Staff {
  id            String    @id @default(cuid())
  fullName      String
  email         String    @unique
  title         String?
  departmentId  String?
  dateOfBirth   DateTime? // nullable — used for STAFF_BIRTHDAY auto-post
  firstWorkDate DateTime? // nullable — "actual first day of work", used for WORK_ANNIVERSARY; can differ from createdAt
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  department Department? @relation(fields: [departmentId], references: [id])

  // chat-related back-relations (add alongside whatever else Staff already has):
  conversationsCreated       Conversation[]      @relation("ConversationCreatedBy")
  conversationMemberships    ConversationMember[]
  messagesSent               Message[]           @relation("MessageSender")
  messagesDeletedForEveryone Message[]           @relation("MessageDeletedBy")
  messageMentions            MessageMention[]
  messageReactions           MessageReaction[]
  messageDeletions           MessageDeletion[]
  pinnedMessages             PinnedMessage[]
  remindersCreated           Reminder[]
  pollsCreated                Poll[]
  pollOptionsAdded            PollOption[]
  pollVotes                   PollVote[]
  notifications                Notification[]      @relation("NotificationRecipient")

  @@map("staff")
}

/// In-app notifications — no real session, so the UI does NOT filter by "current user" beyond
/// whatever getCurrentStaffId() resolves to.
model Notification {
  id               String   @id @default(cuid())
  recipientStaffId String
  type             String // ... | CHAT_MESSAGE | CHAT_MENTION | REMINDER_DUE | POLL_CREATED (chat-relevant subset — the full enum in the source repo also has many non-chat types)
  title            String
  body             String?
  projectId        String?
  conversationId   String?
  isRead           Boolean  @default(false)
  createdAt        DateTime @default(now())

  recipient    Staff         @relation("NotificationRecipient", fields: [recipientStaffId], references: [id])
  project      Project?      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  conversation Conversation? @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([recipientStaffId, isRead])
  @@map("notification")
}
```

**Company-specific literal to change:** the hardcoded "family group" name constant
`TCM_FAMILY_GROUP_NAME = "GIA ĐÌNH TCM"` in `src/lib/chat.ts` (line ~307). Replace with
`{{COMPANY_FAMILY_GROUP_NAME}}` and edit that one `export const` — every other file imports the
constant rather than hardcoding the string, so this is a single-point edit for the group name
itself. (The auto-join email-domain check and the CEO fallback email are **separate** literals —
see §11, they are NOT controlled by this constant.)

---

## 5. Migration order / setup steps

If the target repo uses `prisma migrate dev`, add the schema block from §4 to your `schema.prisma`
and run `npx prisma migrate dev --name add_communication_module` — a single migration is enough;
you do not need to replay history. The migration folder names below are listed **only** as a
reference of the incremental order in which this feature was originally built, in case you want to
phase your own port the same way:

1. `20260715054314_communication_chat_phase1` — Conversation, ConversationMember, Message,
   MessageMention, base SYSTEM events, Notification CHAT_* types.
2. `20260715080513_chat_attachments_voice_media` — attachment fields on Message (IMAGE/VIDEO/VOICE/FILE),
   duration field.
3. `20260715094303_chat_reply_forward_file` — `replyToId`, `isForwarded`, FILE type + FILE_MIME_TYPES.
4. `20260715102627_chat_link_preview_avatar` — link preview fields on Message, `Conversation.avatarKey`.
5. `20260715105826_staff_dob_reactions_occasions` — `Staff.dateOfBirth`, `MessageReaction`,
   `SpecialOccasionLog`.
6. `20260715112758_chat_edit_pin_delete` — `editedAt`, `deletedForEveryoneAt`/`deletedById`,
   `MessageDeletion`, `PinnedMessage`.
7. `20260715114933_chat_reminder_poll` — `Reminder`, `Poll`, `PollOption`, `PollVote`.
8. `20260715121852_chat_group_admin_actions_staff_firstworkdate` — `ConversationMember.sidebarPinnedAt`,
   `historyVisibleFrom`, `Staff.firstWorkDate`.

(Verified via `ls prisma/migrations` in the source repo — these 8 are the complete and only
chat-related migrations; no later reaction/pin-specific migrations exist beyond #6/#5 above.)

---

## 6. Full source files

Copy these files verbatim into the equivalent paths in the target repo, then apply the renames in
§11. Presented in dependency order: lib → server actions → API routes → UI.

> Note on cross-cutting imports used throughout this module (so you don't have to hunt for them
> file-by-file): `@/lib/prisma` (a singleton `PrismaClient` instance — every Next.js/Prisma app has
> an equivalent, not reproduced here), `@/lib/current-staff` (§3, item 1), `@/lib/settings` (§3,
> item 4), `next-intl`'s `getTranslations`/`useTranslations`/`useLocale`, and `lucide-react` icons
> (any recent version works — no chat-specific icon component exists).

### `src/lib/chat-storage.ts`

Requires: Node's `fs/promises`, `path`, `crypto` (`randomBytes`) — no external dependencies.

```ts
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Local-disk storage for chat attachments (image/video/voice), OUTSIDE `public/` — never goes
 * into the DB, never served statically. Only ever read back through an authenticated route
 * (`/api/chat/attachments/[id]`, checks membership before returning bytes).
 * The DB only stores `storageKey` (not an absolute path) — switching to S3/MinIO later only
 * requires changing these 2 functions, not any call site.
 */

const STORAGE_ROOT = path.join(process.cwd(), "storage", "chat-uploads");
// key shape "YYYY/MM/<32 hex>.<ext>" — strictly validated to prevent path traversal.
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const VOICE_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];
// Common office documents — sent via the "+" generic file button (not the image/video/voice-specific ones).
export const FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "application/json",
];

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB — image/video/file
export const MAX_VOICE_BYTES = 20 * 1024 * 1024; // generous headroom for 5 minutes of compressed audio
export const MAX_VOICE_SECONDS = 300; // 5 minutes

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "image/svg+xml": "svg", // system-generated only (welcome/celebration cards) — not in the user-upload allowlist
};

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Save a buffer to storage/chat-uploads/YYYY/MM/<random>.<ext>, returns the relative storageKey. */
export async function saveChatAttachment(buffer: Buffer, mime: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, yyyy, mm);
  await mkdir(dir, { recursive: true });
  const ext = extForMime(mime);
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `${yyyy}/${mm}/${filename}`;
}

/** Read back a buffer by storageKey. Throws if the key doesn't match the expected shape (anti-traversal). */
export async function readChatAttachment(key: string): Promise<Buffer> {
  if (!KEY_PATTERN.test(key)) throw new Error("INVALID_ATTACHMENT_KEY");
  return readFile(path.join(STORAGE_ROOT, key));
}

/** Delete a file on "Delete for everyone" for a message with an attachment — best-effort, does not throw if already missing/invalid. */
export async function deleteChatAttachment(key: string): Promise<void> {
  if (!KEY_PATTERN.test(key)) return;
  try {
    await unlink(path.join(STORAGE_ROOT, key));
  } catch {
    /* file may already be gone — ignore */
  }
}
```

### `src/lib/link-preview.ts`

Requires: Node's `dns/promises`. No external dependencies (no `cheerio`/`open-graph-scraper` — HTML
parsing is done with hand-rolled regexes deliberately, to avoid pulling in a DOM parser for a
best-effort feature).

```ts
import { lookup } from "dns/promises";

/**
 * Link-preview "unfurl" for type=LINK messages — the server fetches the target page itself, reads
 * og:* tags to render a preview card (image/title/description) right in the chat bubble, WITHOUT
 * the client ever calling out.
 *
 * SSRF risk (server fetches a user-supplied URL): mitigated by resolving DNS first and checking
 * whether the resolved IP is private/loopback/link-local (blocks localhost, 127.0.0.1,
 * 169.254.169.254 — cloud metadata endpoint, 192.168.x, 10.x, 172.16-31.x…). This is a reasonable
 * bar for an internal convenience feature — it does NOT defend against sophisticated DNS-rebinding
 * attacks (which would require pinning the IP at the socket layer; not necessary for this use case).
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 500_000; // enough for most <head> sections; stops early once </head> is seen

export type LinkPreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // malformed → block to be safe
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.slice(7));
  return false;
}

function decodeHtmlEntities(s: string | null): string | null {
  if (!s) return null;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim() || null;
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Returns a preview or null if the URL is invalid/unreachable/not an HTML page. Never throws. */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateOrReservedIp(address)) return null;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TCM-CRM-LinkPreview/1.0)" },
    });
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});

    const title = decodeHtmlEntities(extractMeta(html, "og:title") ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? null);
    const description = decodeHtmlEntities(extractMeta(html, "og:description") ?? extractMeta(html, "description"));
    let imageUrl = extractMeta(html, "og:image");
    if (imageUrl) {
      try {
        const abs = new URL(imageUrl, url);
        imageUrl = abs.protocol === "http:" || abs.protocol === "https:" ? abs.toString() : null;
      } catch {
        imageUrl = null;
      }
    }
    const siteName = decodeHtmlEntities(extractMeta(html, "og:site_name")) ?? url.hostname;

    if (!title && !description && !imageUrl) return null;
    return { title, description, imageUrl, siteName };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

### `src/lib/welcome-card.ts`

Note: text baked into the SVG reads "onboard TCM family" and "TCM — Targeted Marketing · Est 2000"
— both company-specific, see §11.

```ts
/**
 * Generates a welcome image (self-drawn SVG — no external asset dependency) when a new hire
 * (@tcmbtl.com) is auto-added to the family group on first "act as" login (see
 * ensureTcmFamilyMembership() in chat.ts). Internal-only content (server generates it, the only free
 * external input is the staff member's name) so injection risk is low, but the name is still escaped.
 */

const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c"];

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function burstSvg(cx: number, cy: number, color: string, r: number): string {
  const rays = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const x2 = (cx + Math.cos(angle) * r).toFixed(1);
    const y2 = (cy + Math.sin(angle) * r).toFixed(1);
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/><circle cx="${x2}" cy="${y2}" r="3.5" fill="${color}"/>`;
  }).join("");
  return `<g>${rays}<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/></g>`;
}

function confettiSvg(): string {
  return Array.from({ length: 36 }, () => {
    const x = Math.round(Math.random() * 800);
    const y = Math.round(Math.random() * 180);
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const rot = Math.round(Math.random() * 360);
    const size = 5 + Math.round(Math.random() * 5);
    return `<rect x="${x}" y="${y}" width="${size}" height="${(size * 0.4).toFixed(1)}" fill="${color}" opacity="0.8" transform="rotate(${rot} ${x} ${y})" rx="1"/>`;
  }).join("");
}

/** 800×450 SVG image: dark gradient background + fireworks + confetti + "Welcome {name} / onboard TCM family". */
export function buildWelcomeSvg(fullName: string): string {
  const name = xmlEscape(fullName);
  const nameFontSize = name.length > 22 ? 30 : name.length > 14 ? 36 : 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1120"/>
      <stop offset="100%" stop-color="#1a1040"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  ${burstSvg(140, 100, "#fbbf24", 55)}
  ${burstSvg(650, 90, "#f472b6", 60)}
  ${burstSvg(420, 55, "#60a5fa", 45)}
  ${burstSvg(730, 220, "#34d399", 40)}
  ${burstSvg(70, 240, "#a78bfa", 42)}
  ${confettiSvg()}
  <text x="400" y="270" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="${nameFontSize}" font-weight="700" fill="#ffffff">🎉 Welcome ${name} 🎉</text>
  <text x="400" y="320" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="26" font-weight="500" fill="#e7edf7">onboard TCM family</text>
  <text x="400" y="368" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="15" fill="#93a3c2">TCM — Targeted Marketing · Est 2000</text>
</svg>`;
}
```

### `src/lib/celebration-cards.ts`

Note: `buildCompanyBirthdaySvg` bakes in "Happy birthday TCM" text; `COMPANY_FOUNDING_YEAR`/`MONTH`/`DAY`
constants live in `occasions.ts` (next file), not here.

```ts
/**
 * Generates congratulation images (self-drawn SVG — no external asset dependency) for 2 kinds of
 * automatic messages in the family group: staff birthday + company birthday (see lib/occasions.ts).
 * "Motion" (like a GIF) is achieved with CSS @keyframes EMBEDDED in the SVG — the browser still runs
 * the animation even though the image is loaded via a static <img> tag (unlike JS, CSS/SMIL
 * animation inside an SVG works fine through <img src>). Only the staff member's name is free-form
 * input → XML-escaped for safety even though the risk is low (system-generated content).
 */

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c", "#f87171"];

function confettiSvg(count: number, maxY: number): string {
  return Array.from({ length: count }, () => {
    const x = Math.round(Math.random() * 800);
    const y = Math.round(Math.random() * maxY);
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const rot = Math.round(Math.random() * 360);
    const size = 5 + Math.round(Math.random() * 5);
    return `<rect x="${x}" y="${y}" width="${size}" height="${(size * 0.4).toFixed(1)}" fill="${color}" opacity="0.85" transform="rotate(${rot} ${x} ${y})" rx="1"/>`;
  }).join("");
}

/** A 3-tier cake at (cx, baseY) = center of the base, with N candles that have flickering flames (CSS animate). */
function cakeSvg(cx: number, baseY: number, candleCount: number): string {
  const tierW = [220, 170, 120];
  const tierH = 42;
  const tiers = tierW
    .map((w, i) => {
      const y = baseY - (i + 1) * tierH;
      const x = cx - w / 2;
      const fill = i === 0 ? "#f9a8d4" : i === 1 ? "#fbcfe8" : "#fde4f2";
      return `<rect x="${x}" y="${y}" width="${w}" height="${tierH}" rx="8" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="#ffffff" opacity="0.65"/>`;
    })
    .join("");
  const topW = tierW[2];
  const topY = baseY - 3 * tierH;
  const candleSpacing = topW / (candleCount + 1);
  const candles = Array.from({ length: candleCount }, (_, i) => {
    const x = cx - topW / 2 + candleSpacing * (i + 1);
    const stickY = topY - 26;
    const flicker = i % 2 === 0 ? "flicker-a" : "flicker-b";
    return `
      <rect x="${(x - 3).toFixed(1)}" y="${stickY}" width="6" height="26" rx="2" fill="#facc15"/>
      <g class="${flicker}" style="transform-origin: ${x.toFixed(1)}px ${(stickY - 2).toFixed(1)}px;">
        <path d="M ${(x - 5).toFixed(1)} ${(stickY - 2).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 22).toFixed(1)} ${(x + 5).toFixed(1)} ${(stickY - 2).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 10).toFixed(1)} ${(x - 5).toFixed(1)} ${(stickY - 2).toFixed(1)} Z" fill="#fb923c"/>
        <path d="M ${(x - 2.5).toFixed(1)} ${(stickY - 3).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 15).toFixed(1)} ${(x + 2.5).toFixed(1)} ${(stickY - 3).toFixed(1)} Q ${x.toFixed(1)} ${(stickY - 7).toFixed(1)} ${(x - 2.5).toFixed(1)} ${(stickY - 3).toFixed(1)} Z" fill="#fde047"/>
      </g>`;
  }).join("");
  return `<g>${tiers}${candles}</g>`;
}

/** 800×450 image: cake + flickering candles + confetti + "Happy Birthday {name}" baked into the image. */
export function buildBirthdaySvg(fullName: string): string {
  const name = xmlEscape(fullName);
  const nameFontSize = name.length > 20 ? 30 : name.length > 12 ? 36 : 42;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bgBday" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b0764"/>
      <stop offset="100%" stop-color="#831843"/>
    </linearGradient>
    <style>
      @keyframes flickerA { 0% { transform: scale(1) skewX(0deg); opacity: 0.92; } 50% { transform: scale(1.18,1.3) skewX(4deg); opacity: 1; } 100% { transform: scale(0.88,1.05) skewX(-3deg); opacity: 0.85; } }
      @keyframes flickerB { 0% { transform: scale(0.95,1.1) skewX(-3deg); opacity: 0.88; } 50% { transform: scale(1.15,1.05) skewX(3deg); opacity: 1; } 100% { transform: scale(1,1.2) skewX(0deg); opacity: 0.9; } }
      .flicker-a { animation: flickerA 0.9s ease-in-out infinite alternate; }
      .flicker-b { animation: flickerB 1.15s ease-in-out infinite alternate; }
    </style>
  </defs>
  <rect width="800" height="450" fill="url(#bgBday)"/>
  ${confettiSvg(30, 140)}
  ${cakeSvg(400, 390, 5)}
  <text x="400" y="130" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="${nameFontSize}" font-weight="700" fill="#ffffff">🎂 Happy Birthday 🎂</text>
  <text x="400" y="178" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="34" font-weight="700" fill="#fde047">${name}</text>
</svg>`;
}

function burstSvg(cx: number, cy: number, color: string, r: number, animClass: string): string {
  const rays = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const x2 = (cx + Math.cos(angle) * r).toFixed(1);
    const y2 = (cy + Math.sin(angle) * r).toFixed(1);
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="3.5" fill="${color}"/>`;
  }).join("");
  return `<g class="${animClass}" style="transform-origin: ${cx}px ${cy}px;">${rays}<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/></g>`;
}

/** 800×450 image: cake + multicolor twinkling fireworks (CSS twinkle) + "Happy birthday TCM - N years". */
export function buildCompanyBirthdaySvg(years: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bgCo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1120"/>
      <stop offset="100%" stop-color="#0b3b6b"/>
    </linearGradient>
    <style>
      @keyframes flickerA { 0% { transform: scale(1) skewX(0deg); opacity: 0.92; } 50% { transform: scale(1.18,1.3) skewX(4deg); opacity: 1; } 100% { transform: scale(0.88,1.05) skewX(-3deg); opacity: 0.85; } }
      @keyframes flickerB { 0% { transform: scale(0.95,1.1) skewX(-3deg); opacity: 0.88; } 50% { transform: scale(1.15,1.05) skewX(3deg); opacity: 1; } 100% { transform: scale(1,1.2) skewX(0deg); opacity: 0.9; } }
      .flicker-a { animation: flickerA 0.9s ease-in-out infinite alternate; }
      .flicker-b { animation: flickerB 1.15s ease-in-out infinite alternate; }
      @keyframes twinkle { 0% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.35; transform: scale(0.85); } }
      .tw1 { animation: twinkle 1.4s ease-in-out infinite; }
      .tw2 { animation: twinkle 1.7s ease-in-out infinite 0.3s; }
      .tw3 { animation: twinkle 1.2s ease-in-out infinite 0.6s; }
      .tw4 { animation: twinkle 1.9s ease-in-out infinite 0.15s; }
      .tw5 { animation: twinkle 1.5s ease-in-out infinite 0.45s; }
    </style>
  </defs>
  <rect width="800" height="450" fill="url(#bgCo)"/>
  ${burstSvg(120, 90, "#fbbf24", 55, "tw1")}
  ${burstSvg(660, 85, "#f472b6", 60, "tw2")}
  ${burstSvg(400, 50, "#60a5fa", 45, "tw3")}
  ${burstSvg(710, 210, "#34d399", 42, "tw4")}
  ${burstSvg(85, 220, "#a78bfa", 40, "tw5")}
  ${confettiSvg(24, 130)}
  ${cakeSvg(400, 390, 4)}
  <text x="400" y="110" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="38" font-weight="700" fill="#ffffff">🎉 Happy birthday TCM 🎉</text>
  <text x="400" y="160" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="30" font-weight="700" fill="#fde047">${years} years</text>
</svg>`;
}
```

### `src/lib/occasions.ts`

Note: `COMPANY_FOUNDING_YEAR = 2000`, `COMPANY_FOUNDING_MONTH = 7` (August, 0-indexed),
`COMPANY_FOUNDING_DAY = 28` — TCM's actual founding date, company-specific (§11). Also the "Happy
Work Anniversary" TEXT message is hardcoded English in this file (not routed through i18n) — port
this as-is or move it into your i18n system if you want it localized.

Requires: `@/lib/prisma`, `./chat-storage`, `./celebration-cards`, `./chat` (for
`TCM_FAMILY_GROUP_NAME`).

```ts
import { prisma } from "./prisma";
import { saveChatAttachment } from "./chat-storage";
import { buildBirthdaySvg, buildCompanyBirthdaySvg } from "./celebration-cards";
import { TCM_FAMILY_GROUP_NAME } from "./chat";

/**
 * Automatic congratulation messages into the family group — staff birthday, seniority anniversary,
 * company birthday. The app has NO real cron — this runs on a "check-and-notify on every layout
 * render" pattern (like lib/reminders.ts). So "exactly at 9:00am" really means: the message appears
 * as soon as the FIRST person loads a page after 9:00am that day (not to-the-second precise) — a
 * known limitation of this no-cron architecture. Duplicate-send protection via the unique
 * constraint SpecialOccasionLog(occasionType, refId, occasionDate) — safe under concurrent load
 * (insert-before-posting, not check-then-insert).
 */

const COMPANY_FOUNDING_YEAR = 2000;
const COMPANY_FOUNDING_MONTH = 7; // Date.getMonth() is 0-indexed — 7 = August
const COMPANY_FOUNDING_DAY = 28;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "1st"/"2nd"/"3rd"/"4th"... — matches the required "Happy Work Anniversary - 1st year" format. */
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

/** Claims the "slot" for today's send — true if nobody has sent yet (allowed to post), false if already sent. */
async function claimOccasion(occasionType: string, refId: string, occasionDate: Date): Promise<boolean> {
  try {
    await prisma.specialOccasionLog.create({ data: { occasionType, refId, occasionDate } });
    return true;
  } catch {
    return false; // unique constraint violation → already logged today, skip
  }
}

async function postImageMessage(conversationId: string, svg: string, attachmentName: string) {
  const buffer = Buffer.from(svg, "utf8");
  const attachmentKey = await saveChatAttachment(buffer, "image/svg+xml");
  await prisma.message.create({
    data: {
      conversationId,
      senderId: null, // system-authored — UI shows the "TCM" label (see chat-conversation.tsx)
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

  // 1) Company birthday — Aug 28, from 8:00am
  if (now.getMonth() === COMPANY_FOUNDING_MONTH && now.getDate() === COMPANY_FOUNDING_DAY && now.getHours() >= 8) {
    if (await claimOccasion("COMPANY_BIRTHDAY", "TCM", today)) {
      const years = now.getFullYear() - COMPANY_FOUNDING_YEAR;
      await postImageMessage(group.id, buildCompanyBirthdaySvg(years), `company-birthday-${now.getFullYear()}.svg`);
    }
  }

  // 2) Staff birthdays — from 9:00am
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

  // 3) Seniority anniversary — "first day of work" = Staff.firstWorkDate (entered manually at
  // account creation, CAN differ from createdAt = the date they were added to the CRM) — from 10:00am
  if (now.getHours() >= 10) {
    const staffList = await prisma.staff.findMany({
      where: { isActive: true, firstWorkDate: { not: null } },
      select: { id: true, fullName: true, firstWorkDate: true },
    });
    for (const s of staffList) {
      if (!s.firstWorkDate) continue;
      if (s.firstWorkDate.getMonth() !== now.getMonth() || s.firstWorkDate.getDate() !== now.getDate()) continue;
      const years = now.getFullYear() - s.firstWorkDate.getFullYear();
      if (years < 1) continue; // not yet a full year — don't send "0th year"
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
```

### `src/lib/chat-reminders.ts`

Not in the original file list handed to the author of this doc, but it is a hard runtime
dependency (imported by `src/app/(app)/layout.tsx`) — included here for completeness. Requires only
`@/lib/prisma`.

```ts
import { prisma } from "./prisma";

/**
 * "Due" firing for reminders created in chat — check-on-render (like occasions.ts/reminders.ts), NO
 * real cron. When remindAt <= now: post a SYSTEM message (systemEvent=REMINDER_DUE) into the
 * conversation + fan out a Notification to the audience (ME=creator only, GROUP=whole conversation).
 *
 * Idempotency against duplicate firing when multiple requests trigger the check simultaneously
 * (many people opening the app at once around the reminder time): UPDATE ... WHERE remindAt =
 * <value just read> — whoever updates first "wins" (moves remindAt to the new value), anyone racing
 * gets updateMany count=0 (WHERE no longer matches) → silently no-ops. No separate log table needed
 * like SpecialOccasionLog, because each Reminder only ever has 1 "pending" remindAt at a time.
 */

const RECURRENCE_DAYS: Record<string, number> = { DAILY: 1, WEEKLY: 7 };

function nextRemindAt(current: Date, recurrence: string): Date {
  const days = RECURRENCE_DAYS[recurrence];
  if (days) {
    const d = new Date(current);
    d.setDate(d.getDate() + days);
    return d;
  }
  if (recurrence === "MONTHLY") {
    const d = new Date(current);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  return current; // ONCE — not reused (isActive will be set false)
}

export async function checkChatReminders(): Promise<void> {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { isActive: true, remindAt: { lte: now } },
    select: { id: true, conversationId: true, title: true, remindAt: true, recurrence: true, audience: true, createdById: true },
  });

  for (const r of due) {
    const claimed = await prisma.reminder.updateMany({
      where: { id: r.id, remindAt: r.remindAt },
      data: {
        lastFiredAt: now,
        remindAt: r.recurrence === "ONCE" ? r.remindAt : nextRemindAt(r.remindAt, r.recurrence),
        isActive: r.recurrence !== "ONCE",
      },
    });
    if (claimed.count === 0) continue; // lost the race — another request already handled this firing

    await prisma.message.create({
      data: { conversationId: r.conversationId, senderId: null, type: "SYSTEM", systemEvent: "REMINDER_DUE", body: r.title },
    });

    const recipientIds =
      r.audience === "GROUP"
        ? (await prisma.conversationMember.findMany({ where: { conversationId: r.conversationId }, select: { staffId: true } })).map((m) => m.staffId)
        : r.createdById
          ? [r.createdById]
          : [];
    if (recipientIds.length > 0) {
      await prisma.notification.createMany({
        data: recipientIds.map((staffId) => ({
          recipientStaffId: staffId,
          type: "REMINDER_DUE",
          title: r.title,
          body: r.title,
          conversationId: r.conversationId,
        })),
      });
    }
  }
}
```

### `src/lib/emoji-data.ts`

Pure data module powering the reaction feature's quick-pick bar and full emoji picker (§1's
reactions feature — fully implemented, this is its data source). No dependencies.

```ts
/**
 * Emoji data for reactions — 7 Facebook-Messenger-style quick reactions (like/heart/laugh/
 * surprised/sad/crying/fireworks) + a "full picker" set organized by category (standard Unicode,
 * no external asset/library dependency — the browser renders it via the system emoji font).
 */

export const QUICK_REACTIONS = ["👍", "❤️", "😆", "😮", "😢", "😭", "🎉"] as const;

export type EmojiCategory = { key: string; emojis: string[] };

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: "smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
      "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥳", "😏", "😒",
      "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡",
      "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶",
      "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "😴", "🤤", "😪", "🤐", "🥴", "🤢", "🤮",
      "🤧", "😷", "🤒", "🤕", "🥸", "🤠", "😈", "👻", "💀", "🤖", "😺", "😹", "😻",
    ],
  },
  {
    key: "gestures",
    emojis: [
      "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
      "👋", "🤚", "🖐️", "✋", "🖖", "👏", "🙌", "👐", "🤲", "🙏", "✊", "👊", "🤛", "🤜", "💪", "🦵",
      "🦶", "👂", "👃", "👀", "👁️", "🧠", "🦷",
    ],
  },
  {
    key: "hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️",
    ],
  },
  {
    key: "celebration",
    emojis: [
      "🎉", "🎊", "🎈", "🎂", "🍰", "🕯️", "🎁", "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅", "⭐", "🌟", "✨",
      "💫", "🔥", "👑", "💎", "🎆", "🎇", "🧨", "🎯", "🪅",
    ],
  },
  {
    key: "animals",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈",
      "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄", "🐝", "🦋", "🐢", "🐍", "🐳", "🐬", "🦈",
    ],
  },
  {
    key: "food",
    emojis: [
      "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🍕",
      "🍔", "🍟", "🌭", "🍿", "🧁", "🍩", "🍪", "🍫", "🍭", "🍹", "☕", "🍵", "🍜", "🍣",
    ],
  },
  {
    key: "activities",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🏸", "🥊", "🎮", "🎲", "🎯", "🚀", "✈️", "🚗", "🚲",
      "🏖️", "🎨", "🎤", "🎸", "🎬",
    ],
  },
];
```

### `src/lib/current-staff.ts`

**This is the whole "act as" identity stub — read §3 item 1 and §9/§11 carefully before porting.**
Requires: `next/headers` (`cookies`), Node's `crypto` (`createHmac`, `timingSafeEqual`), `@/lib/prisma`.

```ts
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * "Act as" — a DEMO tool standing in for real auth (the app has no login yet). Lets you pick "who
 * am I pretending to be" to test per-person modules (especially Chat: 1-1, group, admin/member,
 * per-person unread/mute). Cookie is HMAC-signed to prevent staffId forgery.
 *
 * ⚠ This is NOT real security: every "permission" (group admin, super-admin) is still nominal until
 * real auth exists. If there is no valid cookie → falls back to the seeded CEO (keeps prior
 * behavior so every audit_log entry has a valid changedBy).
 *
 * TODO(auth): replace with a real session once login exists.
 */

export const ACT_AS_COOKIE = "tcm_act_as";
// Dev fallback — production should set ACT_AS_SECRET as an environment variable.
const SECRET = process.env.ACT_AS_SECRET ?? "tcm-dev-actas-secret-change-in-prod";

export const ACT_AS_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export function signActAs(staffId: string): string {
  const sig = createHmac("sha256", SECRET).update(staffId).digest("hex");
  return `${staffId}.${sig}`;
}

function verifyActAs(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const staffId = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(staffId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return staffId;
}

/** Reads the "acting as" staffId from the cookie (verified + still active). Null if absent/invalid. */
async function readActAsStaffId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(ACT_AS_COOKIE)?.value;
  if (!raw) return null;
  const staffId = verifyActAs(raw);
  if (!staffId) return null;
  const staff = await prisma.staff.findFirst({ where: { id: staffId, isActive: true }, select: { id: true } });
  return staff?.id ?? null;
}

export async function getCurrentStaffId(): Promise<string | null> {
  const acted = await readActAsStaffId();
  if (acted) return acted;
  const ceo = await prisma.staff.findUnique({ where: { email: "ceo@tcm.vn" }, select: { id: true } });
  return ceo?.id ?? null;
}

/** Returns the current staff member (id + name + title + department) — used by header/chat. */
export async function getCurrentStaff() {
  const id = await getCurrentStaffId();
  if (!id) return null;
  return prisma.staff.findUnique({
    where: { id },
    include: { department: true },
  });
}
```

### `src/app/(app)/act-as/actions.ts`

Requires: `next/headers`, `next/cache`, `@/lib/prisma`, `@/lib/current-staff`, `@/lib/chat`
(for `ensureTcmFamilyMembership` — see §11 for why this coupling needs a decision when porting).

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ACT_AS_COOKIE, ACT_AS_COOKIE_OPTS, signActAs } from "@/lib/current-staff";
import { ensureTcmFamilyMembership } from "@/lib/chat";

/**
 * Change who is currently being "acted as" (demo stand-in for real auth). Sets an HMAC-signed
 * cookie. Passing an empty staffId clears the cookie (falls back to the CEO).
 */
export async function setActAsStaff(staffId: string) {
  const store = await cookies();
  if (!staffId) {
    store.delete(ACT_AS_COOKIE);
    revalidatePath("/", "layout");
    return;
  }
  const staff = await prisma.staff.findFirst({ where: { id: staffId, isActive: true }, select: { id: true } });
  if (!staff) return;
  store.set(ACT_AS_COOKIE, signActAs(staff.id), ACT_AS_COOKIE_OPTS);
  // "Becoming staff X" is the closest thing to a "first login" the app has (no real auth) — auto-join
  // the family group for new @tcmbtl.com staff, idempotent so calling every time is harmless.
  await ensureTcmFamilyMembership(staff.id).catch(() => {});
  revalidatePath("/", "layout");
}
```

### `src/lib/chat.ts`

The module's core query/business-logic library. Requires: `@/lib/prisma`, `./settings`
(`getStringSetting`), `./chat-storage` (`saveChatAttachment`), `./welcome-card` (`buildWelcomeSvg`).

```ts
import { prisma } from "./prisma";
import { getStringSetting } from "./settings";
import { saveChatAttachment } from "./chat-storage";
import { buildWelcomeSvg } from "./welcome-card";

/**
 * Pure helpers for module ⑨ Communication (internal chat).
 * "Who am I" comes from getCurrentStaffId (act as). Membership/admin guards are enforced HERE,
 * NEVER trusting the client. Super-admin (a configurable job title) can only VIEW all groups,
 * never send.
 */

export const SUPER_ADMIN_TITLES_DEFAULT = "CEO";

/** Job title on the super-admin list → can view every group chat (read-only). */
export async function isSuperAdmin(staffId: string | null): Promise<boolean> {
  if (!staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { title: true } });
  if (!staff?.title) return false;
  const titles = (await getStringSetting("communication", "super_admin_titles", SUPER_ADMIN_TITLES_DEFAULT))
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return titles.includes(staff.title.trim().toLowerCase());
}

/** Find or create a 1-1 conversation between 2 people (idempotent). DIRECT always has exactly 2 members. */
export async function getOrCreateDirectConversation(meId: string, otherId: string) {
  if (meId === otherId) throw new Error("Không thể tự chat với chính mình.");
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ members: { some: { staffId: meId } } }, { members: { some: { staffId: otherId } } }],
    },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      type: "DIRECT",
      createdById: meId,
      members: { create: [{ staffId: meId, role: "MEMBER" }, { staffId: otherId, role: "MEMBER" }] },
    },
  });
}

/** Staff's membership in a conversation (or null). */
export function getMembership(conversationId: string, staffId: string) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_staffId: { conversationId, staffId } },
  });
}

/** Requires membership — throws if not a member. Returns the membership row. */
export async function assertMember(conversationId: string, staffId: string) {
  const m = await getMembership(conversationId, staffId);
  if (!m) throw new Error("NOT_MEMBER");
  return m;
}

/** Requires the person to be a group admin — throws otherwise. */
export async function assertAdmin(conversationId: string, staffId: string) {
  const m = await getMembership(conversationId, staffId);
  if (!m || m.role !== "ADMIN") throw new Error("NOT_ADMIN");
  return m;
}

export type ConversationListItem = {
  id: string;
  type: string;
  title: string; // group name or the other person's name (DIRECT)
  avatarKey: string | null;
  lastBody: string | null;
  lastAt: Date | null;
  lastIsSystem: boolean;
  unread: number;
  muted: boolean;
  role: string;
  memberCount: number;
  pinned: boolean; // pinned to the top of THIS person's own list (ConversationMember.sidebarPinnedAt)
};

/** A staff member's conversation list + last message + unread count + membership state. */
export async function listConversationsForStaff(staffId: string): Promise<ConversationListItem[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { staffId },
    include: {
      conversation: {
        include: {
          members: { include: { staff: { select: { id: true, fullName: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const items = await Promise.all(
    memberships.map(async (m) => {
      const conv = m.conversation;
      const last = conv.messages[0] ?? null;
      const other = conv.members.find((mem) => mem.staffId !== staffId);
      const title = conv.type === "GROUP" ? conv.name ?? "—" : other?.staff.fullName ?? "—";
      const unread = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: staffId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      return {
        id: conv.id,
        type: conv.type,
        title,
        avatarKey: conv.avatarKey,
        lastBody: last?.body ?? (last?.systemEvent ? "•" : last?.linkText ?? null),
        lastAt: last?.createdAt ?? null,
        lastIsSystem: last?.type === "SYSTEM",
        unread,
        muted: m.notificationsMuted,
        role: m.role,
        memberCount: conv.members.length,
        pinned: !!m.sidebarPinnedAt,
      } satisfies ConversationListItem;
    }),
  );

  // Pinned first, then by most recent message — matches the convention of most chat apps.
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0);
  });
  return items;
}

export type ForwardTarget = { id: string; type: string; title: string };

/** A staff member's conversation list, lightweight for the "Forward" picker (no last message/unread needed). */
export async function listConversationsForForward(staffId: string): Promise<ForwardTarget[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { staffId },
    include: {
      conversation: {
        include: { members: { include: { staff: { select: { id: true, fullName: true } } } } },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });
  return memberships.map((m) => {
    const conv = m.conversation;
    const other = conv.members.find((mem) => mem.staffId !== staffId);
    const title = conv.type === "GROUP" ? conv.name ?? "—" : other?.staff.fullName ?? "—";
    return { id: conv.id, type: conv.type, title };
  });
}

/** Mark a conversation as read (only if a member). */
export async function markConversationRead(conversationId: string, staffId: string) {
  await prisma.conversationMember.updateMany({
    where: { conversationId, staffId },
    data: { lastReadAt: new Date() },
  });
}

/** Validate a mention id list ⊆ conversation members; returns the set of valid ids. */
export async function validateMentionIds(conversationId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const members = await prisma.conversationMember.findMany({
    where: { conversationId, staffId: { in: ids } },
    select: { staffId: true },
  });
  return members.map((m) => m.staffId);
}

/**
 * Notification fan-out for a new message.
 * - Mentioned people (or @all) → CHAT_MENTION (IGNORES mute — important messages).
 * - Everyone else (not muted) → CHAT_MESSAGE.
 * - The sender receives nothing.
 */
export async function notifyNewMessage(opts: {
  conversationId: string;
  senderId: string;
  senderName: string;
  convType: string;
  convName: string | null;
  preview: string;
  mentionStaffIds: string[];
  mentionAll: boolean;
}) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: opts.conversationId },
    select: { staffId: true, notificationsMuted: true },
  });
  const mentioned = new Set(opts.mentionAll ? members.map((m) => m.staffId) : opts.mentionStaffIds);
  const title = opts.convType === "GROUP" ? opts.convName ?? "Nhóm" : opts.senderName;

  const rows = members
    .filter((m) => m.staffId !== opts.senderId)
    .map((m) => {
      const isMention = mentioned.has(m.staffId);
      if (!isMention && m.notificationsMuted) return null; // mute only blocks regular messages, not mentions
      const body = opts.convType === "GROUP" ? `${opts.senderName}: ${opts.preview}` : opts.preview;
      return {
        recipientStaffId: m.staffId,
        type: isMention ? "CHAT_MENTION" : "CHAT_MESSAGE",
        title: isMention ? `${title} — @${opts.senderName}` : title,
        body,
        conversationId: opts.conversationId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) await prisma.notification.createMany({ data: rows });
}

/** Writes 1 system message (join/leave/rename/promote). body = secondary variable (person's name / new group name). */
export async function addSystemMessage(
  conversationId: string,
  actorId: string | null,
  systemEvent: string,
  body: string | null,
) {
  return prisma.message.create({
    data: { conversationId, senderId: actorId, type: "SYSTEM", systemEvent, body },
  });
}

/** Set of pinned message ids in a conversation (used to flag `pinned` when mapping messages). */
export async function getPinnedMessageIds(conversationId: string): Promise<Set<string>> {
  const rows = await prisma.pinnedMessage.findMany({ where: { conversationId }, select: { messageId: true } });
  return new Set(rows.map((r) => r.messageId));
}

/** Groups raw MessageReaction rows (already joined with staff.fullName) by emoji → for ChatMessageReactionGroup[]. */
export function groupReactions(
  reactions: { emoji: string; staffId: string; staff: { fullName: string } }[],
  meId: string | null,
): { emoji: string; count: number; reactedByMe: boolean; staffNames: string[] }[] {
  const map = new Map<string, { count: number; reactedByMe: boolean; staffNames: string[] }>();
  for (const r of reactions) {
    const entry = map.get(r.emoji) ?? { count: 0, reactedByMe: false, staffNames: [] };
    entry.count += 1;
    entry.staffNames.push(r.staff.fullName);
    if (r.staffId === meId) entry.reactedByMe = true;
    map.set(r.emoji, entry);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

export type PollOptionView = { id: string; text: string; voteCount: number; votedByMe: boolean; voterNames: string[] };
export type PollView = {
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
  options: PollOptionView[];
};

/**
 * Merges Poll + PollOption + PollVote (already joined with staff.fullName) into a client view.
 * canSeeResults: closed OR hideResultsUntilVoted is off OR the current viewer has voted.
 * anonymous → voterNames is always empty (never reveals identity even if canSeeResults=true).
 */
export function buildPollView(
  poll: { id: string; question: string; allowMultiple: boolean; anonymous: boolean; hideResultsUntilVoted: boolean; allowAddOptions: boolean; closesAt: Date | null },
  options: { id: string; text: string; votes: { staffId: string; staff: { fullName: string } }[] }[],
  meId: string | null,
): PollView {
  const closed = poll.closesAt ? poll.closesAt.getTime() <= Date.now() : false;
  const voterIds = new Set<string>();
  for (const o of options) for (const v of o.votes) voterIds.add(v.staffId);
  const myVoted = meId ? options.some((o) => o.votes.some((v) => v.staffId === meId)) : false;
  const canSeeResults = closed || !poll.hideResultsUntilVoted || myVoted;
  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    anonymous: poll.anonymous,
    hideResultsUntilVoted: poll.hideResultsUntilVoted,
    allowAddOptions: poll.allowAddOptions,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    closed,
    totalVoters: voterIds.size,
    myVoted,
    canSeeResults,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      voteCount: o.votes.length,
      votedByMe: meId ? o.votes.some((v) => v.staffId === meId) : false,
      voterNames: poll.anonymous ? [] : o.votes.map((v) => v.staff.fullName),
    })),
  };
}

/** Trims a preview for a notification/list. */
export function previewText(s: string, max = 120): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export const TCM_FAMILY_GROUP_NAME = "GIA ĐÌNH TCM";
const AUTO_JOIN_EMAIL_DOMAIN = "@tcmbtl.com";

/**
 * Auto-join on "first act-as login": a new hire whose email is @tcmbtl.com (filtered per the
 * original requirement — legacy staff on other domains are NOT affected) is automatically added to
 * the seeded "family group" if not already a member, along with a welcome image (self-drawn
 * fireworks SVG) posted by the system. Called from setActAsStaff (the only "become staff X" point
 * in the app, since there's no real auth yet — see src/app/(app)/act-as/actions.ts). Idempotent:
 * already a member → no-op, safe to call repeatedly.
 */
export async function ensureTcmFamilyMembership(staffId: string): Promise<void> {
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, fullName: true, email: true } });
  if (!staff || !staff.email.toLowerCase().endsWith(AUTO_JOIN_EMAIL_DOMAIN)) return;

  const group = await prisma.conversation.findFirst({ where: { type: "GROUP", name: TCM_FAMILY_GROUP_NAME } });
  if (!group) return; // group not seeded yet — skip (deliberately not auto-created here, to avoid duplicate-creation races under concurrent requests)

  const already = await getMembership(group.id, staffId);
  if (already) return;

  await prisma.conversationMember.create({ data: { conversationId: group.id, staffId, role: "MEMBER" } });
  await addSystemMessage(group.id, null, "MEMBER_ADDED", staff.fullName);

  const svg = buildWelcomeSvg(staff.fullName);
  const buffer = Buffer.from(svg, "utf8");
  const attachmentKey = await saveChatAttachment(buffer, "image/svg+xml");
  await prisma.message.create({
    data: {
      conversationId: group.id,
      senderId: null, // system-authored — UI shows the "TCM" label (see chat-conversation.tsx)
      type: "IMAGE",
      attachmentKey,
      attachmentName: `welcome-${staff.id}.svg`,
      attachmentMime: "image/svg+xml",
      attachmentSize: buffer.byteLength,
    },
  });
}
```

### `src/app/(app)/chat/types.ts`

Pure TypeScript types shared between server pages, the API route, and client components. No
runtime dependencies.

```ts
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

/** A conversation member's "read" state — used to derive per-message read receipts. */
export type ChatReadState = { staffId: string; fullName: string; lastReadAt: string | null };

/** 1 reaction group (e.g. all the 👍) grouped by emoji — count + whether "I" reacted + reactor names (hover). */
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

/** type=REMINDER — the "reminder scheduled" notice shown directly in the chat window (not the "due" moment — that's a separate SYSTEM message). */
export type ChatReminder = {
  id: string;
  title: string;
  remindAt: string;
  recurrence: string; // ONCE | DAILY | WEEKLY | MONTHLY
  audience: string; // ME | GROUP
  isActive: boolean;
};

export type ChatPollOption = { id: string; text: string; voteCount: number; votedByMe: boolean; voterNames: string[] };

/** type=POLL — see the canSeeResults/anonymous rules in lib/chat.ts buildPollView(). */
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

/** A message currently pinned (used for the "pinned messages" bar at the top of a conversation) — same
 * shape as ChatMessageReplyPreview so replyPreviewText() can be reused to render its preview. */
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
```

### `src/app/(app)/chat/actions.ts`

Requires: `next/cache` (`revalidatePath`), `next/navigation` (`redirect`), `next-intl/server`
(`getTranslations`), `@/lib/prisma`, `@/lib/current-staff`, `@/lib/chat` (most exports),
`@/lib/chat-storage` (attachment helpers + MIME/size constants), `@/lib/utils`
(`formatDuration` — see §3 note), `@/lib/link-preview` (`fetchLinkPreview`).

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import {
  getOrCreateDirectConversation,
  getMembership,
  assertMember,
  assertAdmin,
  addSystemMessage,
  markConversationRead,
  notifyNewMessage,
  validateMentionIds,
  previewText,
  listConversationsForForward,
  TCM_FAMILY_GROUP_NAME,
  type ForwardTarget,
} from "@/lib/chat";
import {
  saveChatAttachment,
  deleteChatAttachment,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  VOICE_MIME_TYPES,
  FILE_MIME_TYPES,
  MAX_MEDIA_BYTES,
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
} from "@/lib/chat-storage";
import { formatDuration } from "@/lib/utils";
import { fetchLinkPreview } from "@/lib/link-preview";

export type SendState = { error?: string; ok?: number };

function revalidateConv(conversationId: string) {
  revalidatePath("/chat");
  revalidatePath(`/chat/${conversationId}`);
}

/** Start (or reopen) a 1-1 chat, then navigate into the conversation. */
export async function startDirectChat(formData: FormData) {
  const meId = await getCurrentStaffId();
  const otherId = String(formData.get("staffId") ?? "");
  if (!meId || !otherId || otherId === meId) return;
  const other = await prisma.staff.findFirst({ where: { id: otherId, isActive: true }, select: { id: true } });
  if (!other) return;
  const conv = await getOrCreateDirectConversation(meId, otherId);
  revalidatePath("/chat");
  redirect(`/chat/${conv.id}`);
}

/** Create a new group; the creator is ADMIN. Emits GROUP_CREATED + MEMBER_ADDED system messages. */
export async function createGroup(formData: FormData) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const name = String(formData.get("name") ?? "").trim();
  const memberIds = formData.getAll("memberIds").map(String).filter((id) => id && id !== meId);
  if (!name || memberIds.length === 0) return;

  const valid = await prisma.staff.findMany({ where: { id: { in: memberIds }, isActive: true }, select: { id: true, fullName: true } });
  const conv = await prisma.conversation.create({
    data: {
      type: "GROUP",
      name,
      createdById: meId,
      members: { create: [{ staffId: meId, role: "ADMIN" }, ...valid.map((s) => ({ staffId: s.id, role: "MEMBER" }))] },
    },
  });
  await addSystemMessage(conv.id, meId, "GROUP_CREATED", null);
  for (const s of valid) await addSystemMessage(conv.id, meId, "MEMBER_ADDED", s.fullName);
  revalidatePath("/chat");
  redirect(`/chat/${conv.id}`);
}

/** Send a message (TEXT or LINK) + mentions + notification fan-out. */
export async function sendMessage(conversationId: string, _prev: SendState, formData: FormData): Promise<SendState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };

  const kind = String(formData.get("kind") ?? "TEXT");
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (!conv) return { error: t("errNotMember") };
  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });

  let preview = "";
  let data: {
    type: string;
    body?: string | null;
    linkText?: string | null;
    linkUrl?: string | null;
    linkPreviewTitle?: string | null;
    linkPreviewDescription?: string | null;
    linkPreviewImageUrl?: string | null;
    linkPreviewSiteName?: string | null;
    attachmentKey?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
    attachmentSize?: number | null;
    attachmentDurationSec?: number | null;
  };

  if (kind === "LINK") {
    const linkUrl = String(formData.get("linkUrl") ?? "").trim();
    const linkText = String(formData.get("linkText") ?? "").trim();
    if (!/^https?:\/\/.+/i.test(linkUrl)) return { error: t("errLinkUrlRequired") };
    // Unfurl preview (og:title/description/image) — best-effort, does not block sending on failure/timeout.
    const linkPreview = await fetchLinkPreview(linkUrl).catch(() => null);
    data = {
      type: "LINK",
      linkUrl,
      linkText: linkText || linkUrl,
      body: null,
      linkPreviewTitle: linkPreview?.title ?? null,
      linkPreviewDescription: linkPreview?.description ?? null,
      linkPreviewImageUrl: linkPreview?.imageUrl ?? null,
      linkPreviewSiteName: linkPreview?.siteName ?? null,
    };
    preview = linkText || linkUrl;
  } else if (kind === "IMAGE" || kind === "VIDEO" || kind === "VOICE" || kind === "FILE") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: t("errFileRequired") };

    const allowedMime = kind === "IMAGE" ? IMAGE_MIME_TYPES : kind === "VIDEO" ? VIDEO_MIME_TYPES : kind === "VOICE" ? VOICE_MIME_TYPES : FILE_MIME_TYPES;
    if (!allowedMime.includes(file.type)) return { error: t("errFileType") };

    const maxBytes = kind === "VOICE" ? MAX_VOICE_BYTES : MAX_MEDIA_BYTES;
    if (file.size > maxBytes) return { error: t("errFileTooLarge") };

    let durationSec: number | null = null;
    if (kind === "VOICE") {
      const raw = Number(formData.get("durationSec") ?? NaN);
      durationSec = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
      if (durationSec && durationSec > MAX_VOICE_SECONDS) return { error: t("errVoiceTooLong") };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachmentKey = await saveChatAttachment(buffer, file.type);
    data = {
      type: kind,
      body: null,
      attachmentKey,
      attachmentName: file.name || null,
      attachmentMime: file.type,
      attachmentSize: file.size,
      attachmentDurationSec: durationSec,
    };
    preview =
      kind === "IMAGE" ? t("previewImage") :
      kind === "VIDEO" ? t("previewVideo") :
      kind === "FILE" ? t("previewFile", { name: file.name || "" }) :
      t("previewVoice", { duration: formatDuration(durationSec ?? 0) });
  } else {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return { error: t("errEmptyMessage") };
    data = { type: "TEXT", body };
    preview = body;
  }

  const mentionAll = String(formData.get("mentionAll") ?? "") === "1";
  const rawMentionIds = String(formData.get("mentionIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const mentionStaffIds = mentionAll ? [] : await validateMentionIds(conversationId, rawMentionIds);

  // Reply: only valid if the original message belongs to the SAME conversation (never trust the client — validated here).
  const rawReplyToId = String(formData.get("replyToId") ?? "").trim();
  let replyToId: string | null = null;
  if (rawReplyToId) {
    const original = await prisma.message.findUnique({ where: { id: rawReplyToId }, select: { conversationId: true } });
    if (original?.conversationId === conversationId) replyToId = rawReplyToId;
  }

  const msg = await prisma.message.create({ data: { conversationId, senderId: meId, replyToId, ...data } });
  if (mentionAll) {
    await prisma.messageMention.create({ data: { messageId: msg.id, isAll: true } });
  } else if (mentionStaffIds.length > 0) {
    await prisma.messageMention.createMany({ data: mentionStaffIds.map((sid) => ({ messageId: msg.id, staffId: sid })) });
  }

  await markConversationRead(conversationId, meId);
  await notifyNewMessage({
    conversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv.type,
    convName: conv.name,
    preview: previewText(preview),
    mentionStaffIds,
    mentionAll,
  });

  revalidateConv(conversationId);
  return { ok: Date.now() };
}

/**
 * Add members (member or admin, either can do this). `historyAccess` = "FULL" | "FROM_NOW" — chosen
 * for the WHOLE batch of adds, controlling whether they can read old chat history. NOT applied to
 * the family group — that group always grants FULL history regardless of the form choice (same rule
 * as ensureTcmFamilyMembership() uses for the auto-join flow).
 */
export async function addMembers(conversationId: string, formData: FormData) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertMember(conversationId, meId);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (conv?.type !== "GROUP") return;

  const existing = await prisma.conversationMember.findMany({ where: { conversationId }, select: { staffId: true } });
  const existingSet = new Set(existing.map((m) => m.staffId));
  const ids = formData.getAll("memberIds").map(String).filter((id) => id && !existingSet.has(id));
  if (ids.length === 0) return;
  const valid = await prisma.staff.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, fullName: true } });

  const isTcmFamily = conv.name === TCM_FAMILY_GROUP_NAME;
  const historyAccess = String(formData.get("historyAccess") ?? "FULL");
  const historyVisibleFrom = !isTcmFamily && historyAccess === "FROM_NOW" ? new Date() : null;

  await prisma.conversationMember.createMany({ data: valid.map((s) => ({ conversationId, staffId: s.id, role: "MEMBER", historyVisibleFrom })) });
  for (const s of valid) await addSystemMessage(conversationId, meId, "MEMBER_ADDED", s.fullName);
  revalidateConv(conversationId);
}

/** Promote a member to admin (admin only). */
export async function promoteToAdmin(conversationId: string, staffId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertAdmin(conversationId, meId);
  const target = await prisma.conversationMember.findUnique({ where: { conversationId_staffId: { conversationId, staffId } } });
  if (!target || target.role === "ADMIN") return;
  await prisma.conversationMember.update({ where: { conversationId_staffId: { conversationId, staffId } }, data: { role: "ADMIN" } });
  const s = await prisma.staff.findUnique({ where: { id: staffId }, select: { fullName: true } });
  await addSystemMessage(conversationId, meId, "ROLE_PROMOTED", s?.fullName ?? "—");
  revalidateConv(conversationId);
}

/** Rename the group (admin only). */
export async function renameGroup(conversationId: string, formData: FormData) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertAdmin(conversationId, meId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.conversation.update({ where: { id: conversationId }, data: { name } });
  await addSystemMessage(conversationId, meId, "GROUP_RENAMED", name);
  revalidateConv(conversationId);
}

/** Leave the group (self). If the last admin leaves while others remain → auto-promote the earliest-joined member. */
export async function leaveConversation(conversationId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const me = await getMembership(conversationId, meId);
  if (!me) return;
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (conv?.type !== "GROUP") return; // cannot leave a DIRECT conversation

  const staff = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });
  await prisma.conversationMember.delete({ where: { conversationId_staffId: { conversationId, staffId: meId } } });
  await addSystemMessage(conversationId, meId, "MEMBER_LEFT", staff?.fullName ?? "—");

  const remaining = await prisma.conversationMember.findMany({ where: { conversationId }, orderBy: { joinedAt: "asc" } });
  if (remaining.length > 0 && !remaining.some((m) => m.role === "ADMIN")) {
    const heir = remaining[0];
    await prisma.conversationMember.update({ where: { id: heir.id }, data: { role: "ADMIN" } });
    const heirStaff = await prisma.staff.findUnique({ where: { id: heir.staffId }, select: { fullName: true } });
    await addSystemMessage(conversationId, null, "ROLE_PROMOTED", heirStaff?.fullName ?? "—");
  }
  revalidatePath("/chat");
  redirect("/chat");
}

export type DisbandState = { error?: string };

/**
 * Disband a group (admin only) — hard-deletes the Conversation, cascading to every member/message/
 * reaction/pin/poll/reminder (declared onDelete: Cascade in the schema). The family group is
 * protected from disbanding because several system features depend on it BY NAME (auto-joining new
 * staff — ensureTcmFamilyMembership, automatic celebration messages — lib/occasions.ts).
 */
export async function disbandGroup(conversationId: string): Promise<DisbandState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  if (conv?.type !== "GROUP") return { error: t("errNotMember") };
  if (conv.name === TCM_FAMILY_GROUP_NAME) return { error: t("errCannotDisbandTcmFamily") };
  await assertAdmin(conversationId, meId);

  await prisma.conversation.delete({ where: { id: conversationId } });
  revalidatePath("/chat");
  redirect("/chat");
}

/** Change the group avatar (admin only) — stored via chat-storage like any other attachment. */
export async function updateGroupAvatar(conversationId: string, formData: FormData): Promise<{ error?: string }> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (conv?.type !== "GROUP") return { error: t("errNotMember") };
  await assertAdmin(conversationId, meId);

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: t("errFileRequired") };
  if (!IMAGE_MIME_TYPES.includes(file.type)) return { error: t("errFileType") };
  if (file.size > MAX_MEDIA_BYTES) return { error: t("errFileTooLarge") };

  const buffer = Buffer.from(await file.arrayBuffer());
  const avatarKey = await saveChatAttachment(buffer, file.type);
  await prisma.conversation.update({ where: { id: conversationId }, data: { avatarKey } });
  revalidateConv(conversationId);
  return {};
}

/** Pin/unpin a conversation to the top of THIS person's own conversation list (no effect on others). */
export async function toggleConversationPin(conversationId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const m = await getMembership(conversationId, meId);
  if (!m) return;
  await prisma.conversationMember.update({
    where: { conversationId_staffId: { conversationId, staffId: meId } },
    data: { sidebarPinnedAt: m.sidebarPinnedAt ? null : new Date() },
  });
  revalidatePath("/chat");
}

/** Toggle notifications for yourself in this conversation. */
export async function toggleMute(conversationId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const m = await getMembership(conversationId, meId);
  if (!m) return;
  await prisma.conversationMember.update({
    where: { conversationId_staffId: { conversationId, staffId: meId } },
    data: { notificationsMuted: !m.notificationsMuted },
  });
  revalidateConv(conversationId);
}

/** Mark as read (used when opening or when the poll receives a new message). */
export async function markRead(conversationId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await markConversationRead(conversationId, meId);
  revalidatePath("/chat");
}

/**
 * Messenger-style reaction — each person gets exactly 1 emoji per message: clicking a new emoji
 * overwrites, clicking the currently-selected emoji again removes it. Called directly from a client
 * component (not a form action).
 */
export async function toggleReaction(messageId: string, emoji: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) return;
  await assertMember(message.conversationId, meId);

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_staffId: { messageId, staffId: meId } },
  });
  if (existing && existing.emoji === emoji) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
  } else {
    await prisma.messageReaction.create({ data: { messageId, staffId: meId, emoji } });
  }
  revalidateConv(message.conversationId);
}

const MAX_PINNED_PER_CONVERSATION = 3;

export type EditState = { error?: string; ok?: number };

/** Edit message content — sender only, only while still TEXT and not deleted. Sets editedAt. */
export async function editMessage(messageId: string, body: string): Promise<EditState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const trimmed = body.trim();
  if (!trimmed) return { error: t("errEmptyMessage") };

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.senderId !== meId) return { error: t("errNotMember") };
  if (message.type !== "TEXT" || message.deletedForEveryoneAt) return { error: t("errEditNotAllowed") };

  await prisma.message.update({ where: { id: messageId }, data: { body: trimmed, editedAt: new Date() } });
  revalidateConv(message.conversationId);
  return { ok: Date.now() };
}

/** "Delete for me" — only hides the message from the person who deleted it (any member, even on someone else's message). */
export async function deleteMessageForMe(messageId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) return;
  await assertMember(message.conversationId, meId);
  await prisma.messageDeletion.upsert({
    where: { messageId_staffId: { messageId, staffId: meId } },
    update: {},
    create: { messageId, staffId: meId },
  });
  revalidateConv(message.conversationId);
}

/**
 * "Delete for everyone" — sender OR group admin. Fully scrubs content (body/link/attachment) from
 * the record, keeping a tombstone (deletedForEveryoneAt) so the message still shows "was deleted"
 * instead of vanishing (avoids breaking any reply/pin pointing at it). Also cleans up the attachment
 * file on disk + drops any pin + reactions.
 */
export async function deleteMessageForEveryone(messageId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedForEveryoneAt) return;

  const membership = await assertMember(message.conversationId, meId);
  const isSender = message.senderId === meId;
  const isAdmin = membership.role === "ADMIN";
  if (!isSender && !isAdmin) return;

  if (message.attachmentKey) await deleteChatAttachment(message.attachmentKey);

  await prisma.$transaction([
    prisma.pinnedMessage.deleteMany({ where: { messageId } }),
    prisma.messageReaction.deleteMany({ where: { messageId } }),
    prisma.message.update({
      where: { id: messageId },
      data: {
        deletedForEveryoneAt: new Date(),
        deletedById: meId,
        body: null,
        linkUrl: null,
        linkText: null,
        linkPreviewTitle: null,
        linkPreviewDescription: null,
        linkPreviewImageUrl: null,
        linkPreviewSiteName: null,
        attachmentKey: null,
        attachmentName: null,
        attachmentMime: null,
        attachmentSize: null,
        attachmentDurationSec: null,
      },
    }),
  ]);
  revalidateConv(message.conversationId);
}

export type PinState = { error?: string; ok?: number };

/** Pin a message to the top of the conversation — max 3 messages per conversation at a time. Any member. */
export async function pinMessage(conversationId: string, messageId: string): Promise<PinState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  await assertMember(conversationId, meId);

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedForEveryoneAt: true } });
  if (!message || message.conversationId !== conversationId || message.deletedForEveryoneAt) return { error: t("errPinInvalid") };

  const count = await prisma.pinnedMessage.count({ where: { conversationId } });
  if (count >= MAX_PINNED_PER_CONVERSATION) return { error: t("errPinLimitReached", { max: MAX_PINNED_PER_CONVERSATION }) };

  await prisma.pinnedMessage.upsert({
    where: { conversationId_messageId: { conversationId, messageId } },
    update: {},
    create: { conversationId, messageId, pinnedById: meId },
  });
  revalidateConv(conversationId);
  return { ok: Date.now() };
}

/** Unpin — any member. */
export async function unpinMessage(conversationId: string, messageId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  await assertMember(conversationId, meId);
  await prisma.pinnedMessage.deleteMany({ where: { conversationId, messageId } });
  revalidateConv(conversationId);
}

export type ReminderState = { error?: string; ok?: number };
const REMINDER_RECURRENCES = ["ONCE", "DAILY", "WEEKLY", "MONTHLY"];
const REMINDER_AUDIENCES = ["ME", "GROUP"];

/** Create a reminder — posts a type=REMINDER message immediately as the "scheduled" notice; "due" firing is handled in lib/chat-reminders.ts. */
export async function createReminder(conversationId: string, _prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: t("errReminderTitleRequired") };
  const remindAtRaw = String(formData.get("remindAt") ?? "");
  const remindAt = remindAtRaw ? new Date(remindAtRaw) : null;
  if (!remindAt || Number.isNaN(remindAt.getTime())) return { error: t("errReminderTimeRequired") };
  if (remindAt.getTime() <= Date.now()) return { error: t("errReminderTimeMustBeFuture") };
  const recurrence = String(formData.get("recurrence") ?? "ONCE");
  const audience = String(formData.get("audience") ?? "ME");
  if (!REMINDER_RECURRENCES.includes(recurrence) || !REMINDER_AUDIENCES.includes(audience)) return { error: t("errReminderTimeRequired") };

  const msg = await prisma.message.create({ data: { conversationId, senderId: meId, type: "REMINDER" } });
  await prisma.reminder.create({ data: { conversationId, messageId: msg.id, createdById: meId, title, remindAt, recurrence, audience } });

  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  await markConversationRead(conversationId, meId);
  await notifyNewMessage({
    conversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv?.type ?? "GROUP",
    convName: conv?.name ?? null,
    preview: t("reminderPreview", { title }),
    mentionStaffIds: [],
    mentionAll: false,
  });

  revalidateConv(conversationId);
  return { ok: Date.now() };
}

export type PollState = { error?: string; ok?: number };

/** Create a poll — ≥2 options required at creation; per-poll settings match the requirements (allowMultiple/anonymous/hideResultsUntilVoted/allowAddOptions/closesAt). */
export async function createPoll(conversationId: string, _prev: PollState, formData: FormData): Promise<PollState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };

  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: t("errPollQuestionRequired") };
  const options = formData
    .getAll("options")
    .map((o) => String(o).trim())
    .filter(Boolean);
  if (options.length < 2) return { error: t("errPollMinOptions") };

  const allowMultiple = String(formData.get("allowMultiple") ?? "") === "1";
  const anonymous = String(formData.get("anonymous") ?? "") === "1";
  const hideResultsUntilVoted = String(formData.get("hideResultsUntilVoted") ?? "") === "1";
  const allowAddOptions = String(formData.get("allowAddOptions") ?? "") === "1";
  const closesAtRaw = String(formData.get("closesAt") ?? "");
  const closesAt = closesAtRaw ? new Date(closesAtRaw) : null;
  if (closesAt && (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now())) return { error: t("errPollClosesAtInvalid") };

  const msg = await prisma.message.create({ data: { conversationId, senderId: meId, type: "POLL" } });
  await prisma.poll.create({
    data: {
      messageId: msg.id,
      question,
      allowMultiple,
      anonymous,
      hideResultsUntilVoted,
      allowAddOptions,
      closesAt,
      createdById: meId,
      options: { create: options.map((text, i) => ({ text, sort: i })) },
    },
  });

  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true, name: true } });
  await markConversationRead(conversationId, meId);
  await notifyNewMessage({
    conversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv?.type ?? "GROUP",
    convName: conv?.name ?? null,
    preview: t("pollPreview", { question }),
    mentionStaffIds: [],
    mentionAll: false,
  });

  revalidateConv(conversationId);
  return { ok: Date.now() };
}

/** Vote/unvote 1 option — for single-choice polls, a new vote automatically replaces the old one (allowMultiple=false). */
export async function votePollOption(pollOptionId: string) {
  const meId = await getCurrentStaffId();
  if (!meId) return;
  const option = await prisma.pollOption.findUnique({
    where: { id: pollOptionId },
    include: { poll: { include: { message: { select: { conversationId: true } } } } },
  });
  if (!option) return;
  const conversationId = option.poll.message.conversationId;
  await assertMember(conversationId, meId);
  if (option.poll.closesAt && option.poll.closesAt.getTime() <= Date.now()) return;

  const existing = await prisma.pollVote.findUnique({ where: { pollOptionId_staffId: { pollOptionId, staffId: meId } } });
  if (existing) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
  } else {
    if (!option.poll.allowMultiple) {
      await prisma.pollVote.deleteMany({ where: { staffId: meId, pollOption: { pollId: option.pollId } } });
    }
    await prisma.pollVote.create({ data: { pollOptionId, staffId: meId } });
  }
  revalidateConv(conversationId);
}

export type AddPollOptionState = { error?: string };

/** Add a new option to an open poll — only if the poll has allowAddOptions and is not yet closed. */
export async function addPollOption(pollId: string, text: string): Promise<AddPollOptionState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { message: { select: { conversationId: true } } } });
  if (!poll) return { error: t("errPollInvalid") };
  const conversationId = poll.message.conversationId;
  const membership = await getMembership(conversationId, meId);
  if (!membership) return { error: t("errNotMember") };
  if (!poll.allowAddOptions) return { error: t("errPollAddOptionNotAllowed") };
  if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) return { error: t("errPollClosed") };
  const trimmed = text.trim();
  if (!trimmed) return { error: t("errPollOptionRequired") };

  const count = await prisma.pollOption.count({ where: { pollId } });
  await prisma.pollOption.create({ data: { pollId, text: trimmed, sort: count, addedById: meId } });
  revalidateConv(conversationId);
  return {};
}

/** A staff member's conversation list for the "Forward" picker (called directly from a client component). */
export async function getForwardTargets(): Promise<ForwardTarget[]> {
  const meId = await getCurrentStaffId();
  if (!meId) return [];
  return listConversationsForForward(meId);
}

export type ForwardState = { error?: string; ok?: number };

/**
 * Forward 1 message into a different conversation — creates an INDEPENDENT record (copies content,
 * no back-link to the original) so the content/visibility of the source conversation is never
 * leaked into the target one. The forwarder must be a member of BOTH sides (able to see the
 * original + able to send at the destination).
 */
export async function forwardMessage(messageId: string, targetConversationId: string): Promise<ForwardState> {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!meId) return { error: t("errNotMember") };

  const original = await prisma.message.findUnique({ where: { id: messageId } });
  // REMINDER/POLL cannot be forwarded — their real content lives in a separate Reminder/Poll table
  // (1-1 by messageId); forwarding by copying body/link like other types would produce an empty,
  // broken message.
  if (!original || ["SYSTEM", "REMINDER", "POLL"].includes(original.type)) return { error: t("errForwardInvalid") };
  await assertMember(original.conversationId, meId);

  const targetMembership = await getMembership(targetConversationId, meId);
  if (!targetMembership) return { error: t("errNotMember") };
  const conv = await prisma.conversation.findUnique({ where: { id: targetConversationId }, select: { type: true, name: true } });
  if (!conv) return { error: t("errNotMember") };
  const me = await prisma.staff.findUnique({ where: { id: meId }, select: { fullName: true } });

  await prisma.message.create({
    data: {
      conversationId: targetConversationId,
      senderId: meId,
      type: original.type,
      body: original.body,
      linkUrl: original.linkUrl,
      linkText: original.linkText,
      attachmentKey: original.attachmentKey,
      attachmentName: original.attachmentName,
      attachmentMime: original.attachmentMime,
      attachmentSize: original.attachmentSize,
      attachmentDurationSec: original.attachmentDurationSec,
      isForwarded: true,
    },
  });

  const preview =
    original.type === "IMAGE" ? t("previewImage") :
    original.type === "VIDEO" ? t("previewVideo") :
    original.type === "FILE" ? t("previewFile", { name: original.attachmentName ?? "" }) :
    original.type === "VOICE" ? t("previewVoice", { duration: formatDuration(original.attachmentDurationSec ?? 0) }) :
    original.type === "LINK" ? (original.linkText || original.linkUrl || "") :
    (original.body ?? "");

  await markConversationRead(targetConversationId, meId);
  await notifyNewMessage({
    conversationId: targetConversationId,
    senderId: meId,
    senderName: me?.fullName ?? "—",
    convType: conv.type,
    convName: conv.name,
    preview: previewText(preview),
    mentionStaffIds: [],
    mentionAll: false,
  });

  revalidateConv(targetConversationId);
  return { ok: Date.now() };
}
```

### `src/app/(app)/chat/layout.tsx`

Server component. Requires: `@/lib/current-staff`, `@/lib/chat` (`listConversationsForStaff`,
`isSuperAdmin`), `@/lib/prisma`.

```tsx
import { getCurrentStaffId } from "@/lib/current-staff";
import { listConversationsForStaff, isSuperAdmin } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { ChatShell } from "./chat-shell";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const meId = await getCurrentStaffId();
  const [items, superAdmin, staffRows] = await Promise.all([
    meId ? listConversationsForStaff(meId) : Promise.resolve([]),
    isSuperAdmin(meId),
    prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, title: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const list = items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    avatarKey: i.avatarKey,
    lastBody: i.lastBody,
    lastAt: i.lastAt?.toISOString() ?? null,
    lastIsSystem: i.lastIsSystem,
    unread: i.unread,
    muted: i.muted,
    memberCount: i.memberCount,
    pinned: i.pinned,
  }));
  const staff = staffRows.filter((s) => s.id !== meId).map((s) => ({ id: s.id, fullName: s.fullName, title: s.title }));

  return (
    <ChatShell list={list} staff={staff} superAdmin={superAdmin}>
      {children}
    </ChatShell>
  );
}
```

### `src/app/(app)/chat/chat-shell.tsx`

Client component. Requires: `next/navigation` (`usePathname`), `@/lib/utils` (`cn`).

```tsx
"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ChatListItem, ChatStaff } from "./types";
import { ConversationList } from "./conversation-list";

export function ChatShell({
  list,
  staff,
  superAdmin,
  children,
}: {
  list: ChatListItem[];
  staff: ChatStaff[];
  superAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inConversation = pathname !== "/chat";

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-border bg-surface">
      {/* Left column: conversation list — hidden on mobile when a conversation is open */}
      <aside
        className={cn(
          "w-full flex-none flex-col border-r border-border lg:flex lg:w-80",
          inConversation ? "hidden lg:flex" : "flex",
        )}
      >
        <ConversationList list={list} staff={staff} superAdmin={superAdmin} />
      </aside>

      {/* Right column: conversation — hidden on mobile while on the list */}
      <section className={cn("min-w-0 flex-1 flex-col", inConversation ? "flex" : "hidden lg:flex")}>
        {children}
      </section>
    </div>
  );
}
```

### `src/app/(app)/chat/conversation-list.tsx`

Client component. Requires: `next/link`, `next/navigation` (`usePathname`, `useRouter`),
`next-intl` (`useTranslations`, `useLocale`), `lucide-react` (`Search`, `BellOff`, `Users`, `User`,
`Pin`), `@/lib/utils` (`cn`, `initials`, `groupAvatarUrl`).

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Search, BellOff, Users, User, Pin } from "lucide-react";
import { cn, initials, groupAvatarUrl } from "@/lib/utils";
import type { ChatListItem, ChatStaff } from "./types";
import { NewChatDialog } from "./new-chat-dialog";
import { toggleConversationPin } from "./actions";

function shortTime(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }).format(d);
}

export function ConversationList({ list, staff, superAdmin }: { list: ChatListItem[]; staff: ChatStaff[]; superAdmin: boolean }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = list.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase()));

  async function handleTogglePin(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    await toggleConversationPin(conversationId);
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h1 className="text-sm font-semibold text-foreground">{t("title")}</h1>
        <NewChatDialog staff={staff} />
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-8 pr-3 text-sm outline-none focus:border-brand-400"
          />
        </div>
      </div>

      {superAdmin && (
        <Link
          href="/chat/all"
          className={cn(
            "mx-2 mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50",
            pathname === "/chat/all" && "bg-brand-50",
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {t("superAdminView")}
        </Link>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyList")}</p>
        ) : (
          <ul>
            {filtered.map((c) => {
              const active = pathname === `/chat/${c.id}`;
              return (
                <li key={c.id} className={cn("group relative flex items-center border-b border-border/60 hover:bg-surface-2", active && "bg-brand-50 hover:bg-brand-50")}>
                  <Link href={`/chat/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
                    {c.type === "GROUP" && c.avatarKey ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static public path OR uploaded image via authenticated route (see groupAvatarUrl)
                      <img src={groupAvatarUrl(c.id, c.avatarKey) ?? undefined} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
                    ) : (
                      <span className="relative flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {c.type === "GROUP" ? <Users className="h-5 w-5" /> : initials(c.title)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {c.pinned && <Pin className="h-3 w-3 flex-none text-brand-600" />}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.title}</span>
                        {c.muted && <BellOff className="h-3 w-3 flex-none text-muted-foreground" />}
                        <span className="flex-none text-[11px] text-muted-foreground">{shortTime(c.lastAt, locale)}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {c.lastIsSystem ? "•" : c.lastBody ?? "—"}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-4 min-w-4 flex-none items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-none text-white">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex-none">
                      {c.type === "GROUP" ? (
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">{t("groupBadge")}</span>
                      ) : (
                        <User className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => handleTogglePin(e, c.id)}
                    title={c.pinned ? t("unpinConversation") : t("pinConversation")}
                    className={cn(
                      "mr-2 flex-none rounded-lg p-1.5 hover:bg-surface",
                      c.pinned ? "text-brand-600" : "text-muted-foreground opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

### `src/app/(app)/chat/new-chat-dialog.tsx`

Client component. Requires: `next-intl`, `lucide-react` (`Plus`, `X`, `User`, `Users`),
`@/lib/utils` (`initials`, `cn`), `./staff-picker` (`StaffCheckList`), `./actions`
(`startDirectChat`, `createGroup`).

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, User, Users } from "lucide-react";
import { initials, cn } from "@/lib/utils";
import type { ChatStaff } from "./types";
import { StaffCheckList } from "./staff-picker";
import { startDirectChat, createGroup } from "./actions";

export function NewChatDialog({ staff }: { staff: ChatStaff[] }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [q, setQ] = useState("");

  const filtered = staff.filter((s) => s.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("newChatMenu")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("direct")}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "direct" ? "bg-brand-500 text-white" : "text-muted-foreground")}
                >
                  <User className="h-3.5 w-3.5" />
                  {t("newDirect")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("group")}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", mode === "group" ? "bg-brand-500 text-white" : "text-muted-foreground")}
                >
                  <Users className="h-3.5 w-3.5" />
                  {t("newGroup")}
                </button>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === "direct" ? (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">{t("pickPerson")}</p>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="mb-2 h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-brand-400"
                />
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  {filtered.map((s) => (
                    <form key={s.id} action={startDirectChat}>
                      <input type="hidden" name="staffId" value={s.id} />
                      <button type="submit" className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left hover:bg-surface-2">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                          {initials(s.fullName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">{s.fullName}</span>
                          {s.title && <span className="block truncate text-xs text-muted-foreground">{s.title}</span>}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ) : (
              <form action={createGroup}>
                <p className="mb-1 text-sm font-medium text-foreground">{t("createGroupTitle")}</p>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("groupName")}</label>
                <input
                  name="name"
                  required
                  placeholder={t("groupNamePlaceholder")}
                  className="mb-3 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand-400"
                />
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("pickMembers")}</label>
                <StaffCheckList staff={staff} name="memberIds" />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2">
                    {t("cancel")}
                  </button>
                  <button type="submit" className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
                    {t("create")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

### `src/app/(app)/chat/staff-picker.tsx`

Client component. Requires: `next-intl`, `@/lib/utils` (`initials`, `cn`).

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { initials, cn } from "@/lib/utils";
import type { ChatStaff } from "./types";

/**
 * Multi-select checkbox list of staff (used for creating a group + adding members).
 * Renders <input type="checkbox" name={name}> so it submits via FormData.getAll(name).
 */
export function StaffCheckList({ staff, name }: { staff: ChatStaff[]; name: string }) {
  const t = useTranslations("chat");
  const [q, setQ] = useState("");
  const filtered = staff.filter((s) => s.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="rounded-lg border border-border">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="h-9 w-full rounded-t-lg border-b border-border bg-surface-2 px-3 text-sm outline-none focus:border-brand-400"
      />
      <div className="max-h-56 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("noOneToAdd")}</p>
        ) : (
          filtered.map((s) => (
            <label key={s.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2")}>
              <input type="checkbox" name={name} value={s.id} className="h-4 w-4 accent-brand-500" />
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                {initials(s.fullName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{s.fullName}</span>
                {s.title && <span className="block truncate text-xs text-muted-foreground">{s.title}</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
```

### `src/app/(app)/chat/group-manager.tsx`

Client component. Requires: `next-intl`, `lucide-react` (`Settings2`, `X`, `UserPlus`, `Shield`,
`LogOut`, `Pencil`, `Camera`, `Trash2`), `@/lib/utils` (`initials`), `./staff-picker`
(`StaffCheckList`), `./actions` (`renameGroup`, `addMembers`, `promoteToAdmin`,
`leaveConversation`, `disbandGroup`, `updateGroupAvatar`).

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2, X, UserPlus, Shield, LogOut, Pencil, Camera, Trash2 } from "lucide-react";
import { initials } from "@/lib/utils";
import type { ChatStaff } from "./types";
import { StaffCheckList } from "./staff-picker";
import { renameGroup, addMembers, promoteToAdmin, leaveConversation, disbandGroup, updateGroupAvatar } from "./actions";

type Member = { id: string; fullName: string; title: string | null; role: string };

export function GroupManager({
  conversationId,
  name,
  members,
  candidates,
  myRole,
  isTcmFamily,
  avatarUrl,
}: {
  conversationId: string;
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
              {/* Group avatar (admin) */}
              {isAdmin && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("groupAvatar")}</label>
                  <div className="flex items-center gap-3">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview of the current group avatar, already a valid path/route
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

              {/* Rename (admin) */}
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

              {/* Member list */}
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
                        <form action={promoteToAdmin.bind(null, conversationId, m.id)}>
                          <button type="submit" className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-2">
                            {t("promote")}
                          </button>
                        </form>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{t("roleMember")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Add members (any member) */}
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

              {/* Leave group */}
              <form action={leaveConversation.bind(null, conversationId)}>
                <button type="submit" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger/40 py-2 text-sm font-medium text-danger hover:bg-danger/5">
                  <LogOut className="h-4 w-4" />
                  {t("leave")}
                </button>
              </form>

              {/* Disband group (admin) */}
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
```

### `src/app/(app)/chat/page.tsx`

Server component — the empty-state placeholder shown at `/chat` before a conversation is picked.
Requires: `next-intl/server`, `lucide-react` (`MessagesSquare`).

```tsx
import { getTranslations } from "next-intl/server";
import { MessagesSquare } from "lucide-react";

export default async function ChatIndexPage() {
  const t = await getTranslations("chat");
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-2 p-8 text-center lg:flex">
      <MessagesSquare className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{t("emptyConversation")}</p>
    </div>
  );
}
```

### `src/app/(app)/chat/all/page.tsx`

Server component — the super-admin "view all groups" listing page. Requires: `next/navigation`
(`notFound`), `next/link`, `lucide-react` (`Users`), `next-intl/server`, `@/lib/prisma`,
`@/lib/current-staff`, `@/lib/chat` (`isSuperAdmin`).

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isSuperAdmin } from "@/lib/chat";

export default async function AllGroupsPage() {
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();
  if (!(await isSuperAdmin(meId))) notFound();

  const groups = await prisma.conversation.findMany({
    where: { type: "GROUP" },
    include: {
      _count: { select: { members: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <h1 className="text-sm font-semibold text-foreground">{t("superAdminView")}</h1>
        <p className="text-xs text-muted-foreground">{t("superAdminViewHint")}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/chat/${g.id}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-surface-2">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Users className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{g.name ?? "—"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t("membersCount", { count: g._count.members })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

### `src/app/(app)/chat/[id]/page.tsx`

Server component — the main conversation view; the biggest data-fetching page in the module.
Requires: `next/navigation` (`notFound`), `next/link`, `lucide-react` (`ArrowLeft`, `Bell`,
`BellOff`, `Users`), `next-intl/server`, `@/lib/prisma`, `@/lib/current-staff`, `@/lib/chat`
(`isSuperAdmin`, `markConversationRead`, `groupReactions`, `buildPollView`,
`TCM_FAMILY_GROUP_NAME`), `@/lib/settings` (`getNumberSetting`), `@/lib/utils` (`initials`,
`groupAvatarUrl`), `../chat-conversation` (`ChatConversation`), `../group-manager`
(`GroupManager`), `../actions` (`toggleMute`).

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { isSuperAdmin, markConversationRead, groupReactions, buildPollView, TCM_FAMILY_GROUP_NAME } from "@/lib/chat";
import { getNumberSetting } from "@/lib/settings";
import { initials, groupAvatarUrl } from "@/lib/utils";
import type { ChatMessage, ChatReadState, ChatPinnedMessage, ChatReminder, ChatPoll } from "../types";
import { ChatConversation } from "../chat-conversation";
import { GroupManager } from "../group-manager";
import { toggleMute } from "../actions";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("chat");
  const meId = await getCurrentStaffId();

  // Read ahead to know the "only view history from..." cutoff (if an admin added this member with "don't allow reading old history" checked).
  const myMembership = meId ? await prisma.conversationMember.findUnique({ where: { conversationId_staffId: { conversationId: id, staffId: meId } } }) : null;

  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      members: { include: { staff: { select: { id: true, fullName: true, title: true } } }, orderBy: { joinedAt: "asc" } },
      messages: {
        where: {
          ...(meId ? { deletions: { none: { staffId: meId } } } : {}), // "Delete for me"
          ...(myMembership?.historyVisibleFrom ? { createdAt: { gte: myMembership.historyVisibleFrom } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 300,
        include: {
          sender: { select: { id: true, fullName: true } },
          mentions: { include: { staff: { select: { id: true, fullName: true } } } },
          reactions: { select: { messageId: true, emoji: true, staffId: true, staff: { select: { fullName: true } } } },
          replyTo: {
            select: {
              id: true,
              type: true,
              body: true,
              linkText: true,
              attachmentName: true,
              attachmentDurationSec: true,
              sender: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });
  if (!conv) notFound();

  const membership = meId ? conv.members.find((m) => m.staffId === meId) ?? null : null;
  const superAdmin = !membership && (await isSuperAdmin(meId));
  if (!membership && !superAdmin) notFound();

  if (membership && meId) await markConversationRead(id, meId);

  // Re-read read-state AFTER markConversationRead (conv.members fetched above may still hold this
  // person's stale lastReadAt) — source for per-message read receipts (compared against createdAt).
  const memberReadRows = await prisma.conversationMember.findMany({
    where: { conversationId: id },
    select: { staffId: true, lastReadAt: true, staff: { select: { fullName: true } } },
  });
  const readState: ChatReadState[] = memberReadRows.map((r) => ({
    staffId: r.staffId,
    fullName: r.staff.fullName,
    lastReadAt: r.lastReadAt ? r.lastReadAt.toISOString() : null,
  }));
  const allMemberIds = conv.members.map((m) => m.staffId);

  const isGroup = conv.type === "GROUP";
  const other = conv.members.find((m) => m.staffId !== meId);
  const title = isGroup ? conv.name ?? "—" : other?.staff.fullName ?? "—";
  const subtitle = isGroup ? t("membersCount", { count: conv.members.length }) : other?.staff.title ?? "";

  const pollSeconds = await getNumberSetting("communication", "message_poll_seconds", 4);

  const pinnedRows = await prisma.pinnedMessage.findMany({
    where: { conversationId: id },
    orderBy: { pinnedAt: "asc" },
    include: {
      message: {
        select: { id: true, type: true, body: true, linkText: true, attachmentName: true, attachmentDurationSec: true, sender: { select: { fullName: true } } },
      },
      pinnedBy: { select: { fullName: true } },
    },
  });
  const pinnedMessageIds = new Set(pinnedRows.map((p) => p.messageId));
  const pinned: ChatPinnedMessage[] = pinnedRows.map((p) => ({
    id: p.id,
    messageId: p.messageId,
    type: p.message.type,
    senderName: p.message.sender?.fullName ?? null,
    body: p.message.body,
    linkText: p.message.linkText,
    attachmentName: p.message.attachmentName,
    attachmentDurationSec: p.message.attachmentDurationSec,
    pinnedByName: p.pinnedBy?.fullName ?? null,
  }));

  const pollRows = await prisma.poll.findMany({
    where: { message: { conversationId: id } },
    include: { options: { orderBy: { sort: "asc" }, include: { votes: { include: { staff: { select: { fullName: true } } } } } } },
  });
  const pollsByMessageId: Record<string, ChatPoll> = {};
  for (const p of pollRows) pollsByMessageId[p.messageId] = buildPollView(p, p.options, meId);

  const reminderRows = await prisma.reminder.findMany({ where: { conversationId: id } });
  const remindersByMessageId: Record<string, ChatReminder> = {};
  for (const r of reminderRows) {
    remindersByMessageId[r.messageId] = {
      id: r.id,
      title: r.title,
      remindAt: r.remindAt.toISOString(),
      recurrence: r.recurrence,
      audience: r.audience,
      isActive: r.isActive,
    };
  }

  const initial: ChatMessage[] = conv.messages.map((m) => ({
    id: m.id,
    type: m.type,
    senderId: m.senderId,
    senderName: m.sender?.fullName ?? null,
    body: m.body,
    systemEvent: m.systemEvent,
    linkUrl: m.linkUrl,
    linkText: m.linkText,
    linkPreviewTitle: m.linkPreviewTitle,
    linkPreviewDescription: m.linkPreviewDescription,
    linkPreviewImageUrl: m.linkPreviewImageUrl,
    linkPreviewSiteName: m.linkPreviewSiteName,
    attachmentName: m.attachmentName,
    attachmentMime: m.attachmentMime,
    attachmentSize: m.attachmentSize,
    attachmentDurationSec: m.attachmentDurationSec,
    isForwarded: m.isForwarded,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          type: m.replyTo.type,
          senderName: m.replyTo.sender?.fullName ?? null,
          body: m.replyTo.body,
          linkText: m.replyTo.linkText,
          attachmentName: m.replyTo.attachmentName,
          attachmentDurationSec: m.replyTo.attachmentDurationSec,
        }
      : null,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deletedForEveryone: !!m.deletedForEveryoneAt,
    pinned: pinnedMessageIds.has(m.id),
    mentions: m.mentions.map((x) => ({ staffId: x.staffId, name: x.staff?.fullName ?? null, isAll: x.isAll })),
    reactions: groupReactions(m.reactions, meId),
    reminder: remindersByMessageId[m.id] ?? null,
    poll: pollsByMessageId[m.id] ?? null,
  }));

  const memberIdsSet = new Set(conv.members.map((m) => m.staffId));
  const mentionMembers = conv.members.filter((m) => m.staffId !== meId).map((m) => ({ id: m.staffId, fullName: m.staff.fullName, title: m.staff.title }));
  const managerMembers = conv.members.map((m) => ({ id: m.staffId, fullName: m.staff.fullName, title: m.staff.title, role: m.role }));
  const candidates = isGroup
    ? (await prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true, title: true }, orderBy: { fullName: "asc" } })).filter((s) => !memberIdsSet.has(s.id))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Conversation header */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Link href="/chat" className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 lg:hidden" aria-label={t("close")}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {isGroup && conv.avatarKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- static public path OR uploaded image via authenticated route (see groupAvatarUrl)
          <img src={groupAvatarUrl(id, conv.avatarKey) ?? undefined} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {isGroup ? <Users className="h-5 w-5" /> : initials(title)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {superAdmin ? t("superAdminViewHint") : subtitle}
          </p>
        </div>

        {membership && (
          <form action={toggleMute.bind(null, id)}>
            <button type="submit" title={membership.notificationsMuted ? t("unmute") : t("mute")} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2">
              {membership.notificationsMuted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </button>
          </form>
        )}
        {isGroup && membership && (
          <GroupManager
            conversationId={id}
            name={conv.name ?? ""}
            members={managerMembers}
            candidates={candidates}
            myRole={membership.role}
            isTcmFamily={conv.name === TCM_FAMILY_GROUP_NAME}
            avatarUrl={groupAvatarUrl(id, conv.avatarKey)}
          />
        )}
      </div>

      <ChatConversation
        conversationId={id}
        initial={initial}
        meId={meId}
        members={mentionMembers}
        canSend={!!membership}
        pollSeconds={pollSeconds}
        initialReadState={readState}
        allMemberIds={allMemberIds}
        isAdmin={membership?.role === "ADMIN"}
        initialPinned={pinned}
      />
    </div>
  );
}
```

### `src/app/api/chat/[id]/messages/route.ts`

The polling endpoint. `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Requires: `next/server`,
`@/lib/prisma`, `@/lib/current-staff`, `@/lib/chat` (`getMembership`, `isSuperAdmin`,
`groupReactions`, `buildPollView`).

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMembership, isSuperAdmin, groupReactions, buildPollView } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polling endpoint — the client calls this every ~N seconds while a conversation is open to fetch
 * new messages. (The app has no realtime; this is the simple "near-realtime" mechanism.)
 * Guard: must be a member, or a super-admin (read-only view).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const membership = await getMembership(conversationId, meId);
  if (!membership && !(await isSuperAdmin(meId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const validAfter = afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : null;

  const [messages, members, reactions, pinnedRows, updatedRows, pollRows, reminderRows] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId,
        ...(validAfter || membership?.historyVisibleFrom
          ? {
              createdAt: {
                ...(validAfter ? { gt: validAfter } : {}),
                ...(membership?.historyVisibleFrom ? { gte: membership.historyVisibleFrom } : {}),
              },
            }
          : {}),
        deletions: { none: { staffId: meId } }, // "Delete for me" — never return a message this person hid for themselves
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        sender: { select: { id: true, fullName: true } },
        mentions: { include: { staff: { select: { id: true, fullName: true } } } },
        replyTo: {
          select: {
            id: true,
            type: true,
            body: true,
            linkText: true,
            attachmentName: true,
            attachmentDurationSec: true,
            sender: { select: { fullName: true } },
          },
        },
      },
    }),
    // Each member's "read" state — returned on EVERY poll (even with no new messages) so already-
    // displayed OLD messages also update "seen by" when someone else opens the conversation later.
    prisma.conversationMember.findMany({
      where: { conversationId },
      select: { staffId: true, lastReadAt: true, staff: { select: { fullName: true } } },
    }),
    // Reactions can appear on OLD messages (outside the "after" window) — return ALL reactions for
    // the conversation on every poll (like read-state) so the client can patch the right message, not just new ones.
    prisma.messageReaction.findMany({
      where: { message: { conversationId } },
      select: { messageId: true, emoji: true, staffId: true, staff: { select: { fullName: true } } },
    }),
    // Pinned messages — return ALL of them every poll (like reactions/read-state), max 3 so it's cheap.
    prisma.pinnedMessage.findMany({
      where: { conversationId },
      orderBy: { pinnedAt: "asc" },
      include: {
        message: {
          select: {
            id: true,
            type: true,
            body: true,
            linkText: true,
            attachmentName: true,
            attachmentDurationSec: true,
            sender: { select: { fullName: true } },
          },
        },
        pinnedBy: { select: { fullName: true } },
      },
    }),
    // Edited/deleted-for-everyone messages can be OUTSIDE the "after" window (an already-loaded old
    // message) — return a separate "updated" channel every poll (like reaction/pin) so the client
    // can patch the right message instead of only new ones.
    prisma.message.findMany({
      where: { conversationId, OR: [{ editedAt: { not: null } }, { deletedForEveryoneAt: { not: null } }] },
      select: {
        id: true,
        body: true,
        linkUrl: true,
        linkText: true,
        linkPreviewTitle: true,
        linkPreviewDescription: true,
        linkPreviewImageUrl: true,
        linkPreviewSiteName: true,
        attachmentName: true,
        attachmentMime: true,
        attachmentSize: true,
        attachmentDurationSec: true,
        editedAt: true,
        deletedForEveryoneAt: true,
      },
    }),
    // Polls can receive new votes on OLD messages — return ALL polls for the conversation on every
    // poll (like reaction/pin); poll count per conversation is small so this is cheap.
    prisma.poll.findMany({
      where: { message: { conversationId } },
      include: { options: { orderBy: { sort: "asc" }, include: { votes: { include: { staff: { select: { fullName: true } } } } } } },
    }),
    // Reminders can change remindAt/isActive after they fire (see lib/chat-reminders.ts) — return all.
    prisma.reminder.findMany({ where: { conversationId } }),
  ]);

  const pinnedMessageIds = new Set(pinnedRows.map((p) => p.messageId));
  const pollsByMessageId: Record<string, ReturnType<typeof buildPollView>> = {};
  for (const p of pollRows) pollsByMessageId[p.messageId] = buildPollView(p, p.options, meId);
  const remindersByMessageId: Record<string, { id: string; title: string; remindAt: string; recurrence: string; audience: string; isActive: boolean }> = {};
  for (const r of reminderRows) {
    remindersByMessageId[r.messageId] = {
      id: r.id,
      title: r.title,
      remindAt: r.remindAt.toISOString(),
      recurrence: r.recurrence,
      audience: r.audience,
      isActive: r.isActive,
    };
  }

  const reactionsByMessageId: Record<string, ReturnType<typeof groupReactions>> = {};
  const byMessage = new Map<string, typeof reactions>();
  for (const r of reactions) {
    const arr = byMessage.get(r.messageId) ?? [];
    arr.push(r);
    byMessage.set(r.messageId, arr);
  }
  for (const [msgId, rows] of byMessage) {
    reactionsByMessageId[msgId] = groupReactions(rows, meId);
  }

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      type: m.type,
      senderId: m.senderId,
      senderName: m.sender?.fullName ?? null,
      body: m.body,
      systemEvent: m.systemEvent,
      linkUrl: m.linkUrl,
      linkText: m.linkText,
      linkPreviewTitle: m.linkPreviewTitle,
      linkPreviewDescription: m.linkPreviewDescription,
      linkPreviewImageUrl: m.linkPreviewImageUrl,
      linkPreviewSiteName: m.linkPreviewSiteName,
      attachmentName: m.attachmentName,
      attachmentMime: m.attachmentMime,
      attachmentSize: m.attachmentSize,
      attachmentDurationSec: m.attachmentDurationSec,
      isForwarded: m.isForwarded,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            type: m.replyTo.type,
            senderName: m.replyTo.sender?.fullName ?? null,
            body: m.replyTo.body,
            linkText: m.replyTo.linkText,
            attachmentName: m.replyTo.attachmentName,
            attachmentDurationSec: m.replyTo.attachmentDurationSec,
          }
        : null,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedForEveryone: !!m.deletedForEveryoneAt,
      pinned: pinnedMessageIds.has(m.id),
      mentions: m.mentions.map((x) => ({ staffId: x.staffId, name: x.staff?.fullName ?? null, isAll: x.isAll })),
      reactions: reactionsByMessageId[m.id] ?? [],
      reminder: remindersByMessageId[m.id] ?? null,
      poll: pollsByMessageId[m.id] ?? null,
    })),
    members: members.map((mem) => ({
      staffId: mem.staffId,
      fullName: mem.staff.fullName,
      lastReadAt: mem.lastReadAt ? mem.lastReadAt.toISOString() : null,
    })),
    reactions: reactionsByMessageId,
    pinned: pinnedRows.map((p) => ({
      id: p.id,
      messageId: p.messageId,
      type: p.message.type,
      senderName: p.message.sender?.fullName ?? null,
      body: p.message.body,
      linkText: p.message.linkText,
      attachmentName: p.message.attachmentName,
      attachmentDurationSec: p.message.attachmentDurationSec,
      pinnedByName: p.pinnedBy?.fullName ?? null,
    })),
    updated: updatedRows.map((m) => ({
      id: m.id,
      body: m.body,
      linkUrl: m.linkUrl,
      linkText: m.linkText,
      linkPreviewTitle: m.linkPreviewTitle,
      linkPreviewDescription: m.linkPreviewDescription,
      linkPreviewImageUrl: m.linkPreviewImageUrl,
      linkPreviewSiteName: m.linkPreviewSiteName,
      attachmentName: m.attachmentName,
      attachmentMime: m.attachmentMime,
      attachmentSize: m.attachmentSize,
      attachmentDurationSec: m.attachmentDurationSec,
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedForEveryone: !!m.deletedForEveryoneAt,
    })),
    polls: pollsByMessageId,
    reminders: remindersByMessageId,
    serverTime: new Date().toISOString(),
  });
}
```

### `src/app/api/chat/attachments/[id]/route.ts`

`runtime = "nodejs"`, `dynamic = "force-dynamic"`. Requires: `next/server`, `@/lib/prisma`,
`@/lib/current-staff`, `@/lib/chat` (`getMembership`, `isSuperAdmin`), `@/lib/chat-storage`
(`readChatAttachment`).

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMembership, isSuperAdmin } from "@/lib/chat";
import { readChatAttachment } from "@/lib/chat-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves chat attachment binaries (image/video/voice) — id = Message.id (each message has at most
 * 1 file). Guard: must be a member of the conversation containing that message, or super-admin
 * (read-only view). NEVER exposes storageKey/filesystem path — only the message id is in the URL.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, attachmentKey: true, attachmentMime: true, attachmentName: true },
  });
  if (!message?.attachmentKey) return new NextResponse(null, { status: 404 });

  const membership = await getMembership(message.conversationId, meId);
  if (!membership && !(await isSuperAdmin(meId))) return new NextResponse(null, { status: 403 });

  let buffer: Buffer;
  try {
    buffer = await readChatAttachment(message.attachmentKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": message.attachmentMime ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(message.attachmentName ?? "file").replace(/["\\]/g, "_")}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
```

### `src/app/api/chat/group-avatar/[id]/route.ts`

`runtime = "nodejs"`, `dynamic = "force-dynamic"`. Requires: `next/server`, `@/lib/prisma`,
`@/lib/current-staff`, `@/lib/chat` (`getMembership`, `isSuperAdmin`), `@/lib/chat-storage`
(`readChatAttachment`).

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";
import { getMembership, isSuperAdmin } from "@/lib/chat";
import { readChatAttachment } from "@/lib/chat-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves an admin-uploaded group avatar — id = Conversation.id. Guard: must be a member of that
 * conversation, or super-admin. If avatarKey is a static path (starts with "/") this route is NOT
 * used (the client loads it directly — see lib/utils.ts groupAvatarUrl()).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await ctx.params;
  const meId = await getCurrentStaffId();
  if (!meId) return new NextResponse(null, { status: 401 });

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { avatarKey: true } });
  if (!conv?.avatarKey || conv.avatarKey.startsWith("/")) return new NextResponse(null, { status: 404 });

  const membership = await getMembership(conversationId, meId);
  if (!membership && !(await isSuperAdmin(meId))) return new NextResponse(null, { status: 403 });

  let buffer: Buffer;
  try {
    buffer = await readChatAttachment(conv.avatarKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const ext = conv.avatarKey.split(".").pop() ?? "";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

### `src/app/(app)/settings/communication/actions.ts`

Requires: `next/cache` (`revalidatePath`), `next-intl/server`, `@/lib/prisma`,
`@/lib/current-staff`.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaffId } from "@/lib/current-staff";

export type CommunicationSettingsState = { error?: string; success?: boolean };

async function upsertSetting(key: string, value: string, staffId: string | null) {
  await prisma.setting.upsert({
    where: { module_key_scope_scopeRef: { module: "communication", key, scope: "GLOBAL", scopeRef: "" } },
    update: { value, updatedBy: staffId },
    create: { module: "communication", key, value, updatedBy: staffId },
  });
}

export async function saveCommunicationSettings(
  _prev: CommunicationSettingsState,
  formData: FormData,
): Promise<CommunicationSettingsState> {
  const t = await getTranslations("settings.communication");
  const superAdminTitles = String(formData.get("superAdminTitles") ?? "").trim();
  const pollSeconds = Number(formData.get("pollSeconds") ?? NaN);
  if (!superAdminTitles || !Number.isFinite(pollSeconds) || pollSeconds < 2 || pollSeconds > 60) {
    return { error: t("errorInvalid") };
  }
  const staffId = await getCurrentStaffId();
  await upsertSetting("super_admin_titles", superAdminTitles, staffId);
  await upsertSetting("message_poll_seconds", String(Math.round(pollSeconds)), staffId);
  revalidatePath("/settings/communication");
  revalidatePath("/chat", "layout");
  return { success: true };
}
```

### `src/app/(app)/settings/communication/communication-settings-form.tsx`

Client component. Requires: `react` (`useActionState`), `next-intl`.

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveCommunicationSettings, type CommunicationSettingsState } from "./actions";

const input = "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function CommunicationSettingsForm({ superAdminTitles, pollSeconds }: { superAdminTitles: string; pollSeconds: number }) {
  const [state, formAction, pending] = useActionState<CommunicationSettingsState, FormData>(saveCommunicationSettings, {});
  const t = useTranslations("settings.communication");

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-border bg-surface p-6">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("superAdminTitles")}</label>
        <p className="mb-1 text-xs text-muted-foreground">{t("superAdminTitlesHint")}</p>
        <input name="superAdminTitles" defaultValue={superAdminTitles} className={input} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">{t("pollSeconds")}</label>
        <p className="mb-1 text-xs text-muted-foreground">{t("pollSecondsHint")}</p>
        <input name="pollSeconds" type="number" min={2} max={60} defaultValue={pollSeconds} className={input} />
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {t("save")}
        </button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.success && <span className="text-sm text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}
```

### `src/app/(app)/settings/communication/page.tsx`

Server component. Requires: `next/link`, `lucide-react` (`ArrowLeft`), `next-intl/server`,
`@/lib/settings` (`getNumberSetting`, `getStringSetting`), `@/lib/chat`
(`SUPER_ADMIN_TITLES_DEFAULT`).

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getNumberSetting, getStringSetting } from "@/lib/settings";
import { SUPER_ADMIN_TITLES_DEFAULT } from "@/lib/chat";
import { CommunicationSettingsForm } from "./communication-settings-form";

export default async function SettingsCommunicationPage() {
  const [t, tIndex, superAdminTitles, pollSeconds] = await Promise.all([
    getTranslations("settings.communication"),
    getTranslations("settings.index"),
    getStringSetting("communication", "super_admin_titles", SUPER_ADMIN_TITLES_DEFAULT),
    getNumberSetting("communication", "message_poll_seconds", 4),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {tIndex("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      <CommunicationSettingsForm superAdminTitles={superAdminTitles} pollSeconds={pollSeconds} />
    </div>
  );
}
```

### `src/app/(app)/chat/chat-conversation.tsx`

The largest file in the module (1776 lines) — the entire message list, composer, reactions,
reply/forward, edit/delete, pin, reminder, and poll UI live here as one client component plus its
co-located sub-components. Requires: `react` (`useState`, `useRef`, `useEffect`, `useCallback`,
`useActionState`), `next-intl` (`useTranslations`, `useLocale`), `lucide-react` (many icons, listed
in the import block below), `@/lib/utils` (`cn`, `initials`, `formatDuration`), `./types` (all chat
types), `./actions` (`sendMessage`, `markRead`, `getForwardTargets`, `forwardMessage`,
`toggleReaction`, `editMessage`, `deleteMessageForMe`, `deleteMessageForEveryone`, `pinMessage`,
`unpinMessage`, `createReminder`, `createPoll`, `votePollOption`, `addPollOption`, and their state
types), `@/lib/emoji-data` (`QUICK_REACTIONS`, `EMOJI_CATEGORIES`).

```tsx
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
import { cn, initials, formatDuration } from "@/lib/utils";
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

const MAX_VOICE_SECONDS = 300; // 5 minutes — matches src/lib/chat-storage.ts (server-side re-check)
const MAX_MEDIA_MB = 10; // image/video/file — matches src/lib/chat-storage.ts
const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,.json";

type ForwardTarget = { id: string; type: string; title: string };

function fmtTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Short preview label for a quote-reply (composer + inside a message bubble). */
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

/** Full (untruncated) content for "Copy message" — LINK copies the raw URL, media copies a type label. */
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

/**
 * Derives "who has read this message" purely from ConversationMember.lastReadAt (there is no
 * dedicated read-receipt table) — a member is considered to have read message M if their
 * lastReadAt >= M.createdAt. Never counts the sender (they always "read" their own message, they
 * are not a recipient).
 */
function getReadInfo(message: ChatMessage, readState: ChatReadState[], allMemberIds: string[]) {
  const others = allMemberIds.filter((id) => id !== message.senderId);
  const msgTime = new Date(message.createdAt).getTime();
  const readers = others
    .map((id) => readState.find((r) => r.staffId === id))
    .filter((r): r is ChatReadState => !!r?.lastReadAt && new Date(r.lastReadAt).getTime() >= msgTime);
  return { readers, allRead: others.length > 0 && readers.length === others.length };
}

/** Highlights @all / @Name tokens in the body based on the message's mentions. */
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
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Fetches messages newer than the last one currently held — used both by the periodic poll and by
  // "refresh now" right after sending (instead of relying on the `initial` prop changing, avoiding
  // cross-component setState bugs). Read-state (each member's lastReadAt) is always refreshed on
  // every poll — even with no new messages — so already-displayed old messages also reflect "seen by
  // whom" once someone else reads later.
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
      // Reaction/pin/poll-vote/reminder/edit/delete-for-everyone can happen on OLD messages (outside
      // the "after" window) — always patch EVERY currently-displayed message with the latest
      // snapshot on every poll.
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
      /* silent — the next poll/refresh will retry */
    }
  }, [conversationId, meId]);

  // Poll for new messages on the configured cadence (settings.communication.message_poll_seconds)
  useEffect(() => {
    const iv = setInterval(refreshNow, Math.max(2, pollSeconds) * 1000);
    return () => clearInterval(iv);
  }, [refreshNow, pollSeconds]);

  // Auto-scroll when a new message arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Clicking an emoji (quick-pick / full picker / an already-reacted pill) → toggle then refresh immediately (don't wait for the next poll).
  async function handleToggleReaction(messageId: string, emoji: string) {
    setReactionPickerMessageId(null);
    setFullEmojiPickerMessageId(null);
    await toggleReaction(messageId, emoji);
    refreshNow();
  }

  // Close the "..." menu / quick-pick reaction bar on an outside click (both share the data-chat-menu marker).
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
      /* clipboard permission may be blocked — not a critical action, ignore */
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
          // System-authored messages (e.g. the welcome image for a new member) have senderId=null but
          // type≠SYSTEM — show the "TCM" label instead of leaving it blank.
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
                            // eslint-disable-next-line @next/next/no-img-element -- preview image from an external site, loaded directly (not proxied)
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
                    // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated route, cannot be optimized via next/image
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
                  <span>{fmtTime(m.createdAt, locale)}</span>
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
                      <div className="group/seen relative flex-none">
                        <span className="cursor-default underline decoration-dotted underline-offset-2">{t("seenByCount", { count: readers.length })}</span>
                        <div
                          className={cn(
                            "pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-56 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-normal text-foreground shadow-lg group-hover/seen:block",
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
                      onClick={() => setReactionPickerMessageId((id) => (id === m.id ? null : m.id))}
                      title={t("react")}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <SmilePlus className="h-3.5 w-3.5" />
                    </button>
                    {reactionPickerMessageId === m.id && (
                      <div
                        data-chat-menu
                        className={cn(
                          "absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-xl",
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
                      onClick={() => setOpenMenuMessageId((id) => (id === m.id ? null : m.id))}
                      title={t("moreActions")}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-surface-2"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {openMenuMessageId === m.id && (
                      <div
                        data-chat-menu
                        className={cn("absolute bottom-full z-20 mb-1 w-48 rounded-xl border border-border bg-surface p-1 shadow-xl", mine ? "right-0" : "left-0")}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated/onClose read the latest value via closure
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated/onClose read the latest value via closure
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
  const dt = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(reminder.remindAt));
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
              {t("pollClosesAt", { date: new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(poll.closesAt)) })}
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

  // Inline @mention — the token is inserted directly into text (e.g. "@Nguyễn Văn A "); mentionIds
  // is recomputed every render by checking whether the token still appears in bodyText (simple, and
  // automatically "un-mentions" if the user deletes/edits the name portion by hand — matching the
  // behavior of common chat apps).
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

  // Close the "+" menu on an outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) setPlusOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Clean up on unmount (still recording / still holding a preview URL)
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
    setMode("text"); // wait until a file is chosen before switching mode, to avoid flashing an empty preview
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = kind === "IMAGE" ? "image/*" : kind === "VIDEO" ? "video/*" : FILE_ACCEPT;
    input.dataset.kind = kind;
    input.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const kind = e.target.dataset.kind as "IMAGE" | "VIDEO" | "FILE" | undefined;
    if (!file || !kind) return;
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) {
      setFileError(t("errFileTooLarge"));
      e.target.value = "";
      return;
    }
    setFileError(null);
    setPendingFile(file);
    setMode(kind === "IMAGE" ? "image" : kind === "VIDEO" ? "video" : "file");
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

  // reset after a successful send
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
      onSent(); // refresh the message list immediately instead of waiting for the next poll tick
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearAttachmentState/onSent/onClearReply read the latest value via closure every render, no need to list them
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
   * Shift+Enter inserts a new line. If the current line is a list format (numbered "1. "/"1) " or a
   * bullet "- "/"* "/"•") → auto-continues with the next item (increment number / repeat bullet) on
   * the new line, like Notion/Word. An empty list line (pressing Shift+Enter twice in a row) → drops
   * the marker, ending the list.
   */
  function insertNewlineWithListContinuation() {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? bodyText.length;
    const lineStart = bodyText.lastIndexOf("\n", caret - 1) + 1;
    const currentLine = bodyText.slice(lineStart, caret);

    const numbered = currentLine.match(/^(\s*)(\d+)([.)])\s(.*)$/);
    const bullet = currentLine.match(/^(\s*)([-*•])\s(.*)$/);

    if ((numbered && numbered[4].trim() === "") || (bullet && bullet[3].trim() === "")) {
      // The list line is empty — end the list: strip the marker instead of continuing it
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

    if (e.nativeEvent.isComposing) return; // IME composition in progress (e.g. Vietnamese input method) — do not intercept Enter

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
  // Combined list in display order — used to navigate with up/down arrows + Enter to select.
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
```

### `src/components/layout/act-as-switcher.tsx`

Not part of the chat module itself, but the ONE UI surface that drives the entire "who am I" stub
that this module (and the whole app) depends on — included in full because you cannot exercise
per-person chat features (1-1, admin/member, mute, unread) without it. Requires: `react`
(`useState`, `useRef`, `useEffect`, `useTransition`), `next/navigation` (`useRouter`), `next-intl`,
`lucide-react` (`ChevronDown`, `UserCog`, `Search`), `@/app/(app)/act-as/actions`
(`setActAsStaff`), `@/lib/utils` (`initials`, `cn`).

```tsx
"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, UserCog, Search } from "lucide-react";
import { setActAsStaff } from "@/app/(app)/act-as/actions";
import { initials, cn } from "@/lib/utils";

export type ActAsStaff = { id: string; fullName: string; title: string | null; departmentName: string | null };

export function ActAsSwitcher({ staff, currentId }: { staff: ActAsStaff[]; currentId: string | null }) {
  const t = useTranslations("header.actAs");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const current = staff.find((s) => s.id === currentId) ?? null;
  const filtered = staff.filter((s) => s.fullName.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(id: string) {
    if (id === currentId || pending) return;
    setOpen(false);
    startTransition(async () => {
      await setActAsStaff(id);
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title={t("label")}
        aria-label={t("label")}
        className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 hover:bg-surface-2 disabled:opacity-60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initials(current?.fullName)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-96 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <UserCog className="h-3.5 w-3.5" />
            {t("heading")}
          </div>
          <div className="relative px-1 pb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 w-full rounded-lg border border-border bg-surface-2 pl-8 pr-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                s.id === currentId && "bg-brand-50",
              )}
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                {initials(s.fullName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{s.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[s.title, s.departmentName].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Relevant excerpts from `src/lib/utils.ts` (do not port the whole file — only these exports are used by chat)

Verified via grep that chat files import exactly `cn`, `initials`, `groupAvatarUrl`, and
`formatDuration` from this module (plus `formatDate`/`formatNumber` are used elsewhere in the app,
not by chat). `groupAvatarUrl` has a pre-existing bug worth noting when porting: the string literal
compares against `"\"` (a single escaped backslash) instead of `"/"` — see the exact source below,
verbatim, and treat this as a known bug to decide whether to fix during porting (not something to
silently "correct" without flagging it to whoever reviews this port).

```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Duration formatted as m:ss (used for voice message length displays). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Initials for an avatar — takes up to the last 2 words of a full name (e.g. "Nguyễn Văn A" → "VA"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * URL for <img> to load a chat group avatar. Conversation.avatarKey has 2 forms: starts with "/" =
 * static path under /public (e.g. the TCM logo for the family group) → load directly; otherwise =
 * an uploaded-image storageKey (lib/chat-storage.ts) → must go through the membership-checked
 * route. Pure function, works on both client/server.
 */
export function groupAvatarUrl(conversationId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  return avatarKey.startsWith("/") ? avatarKey : `/api/chat/group-avatar/${conversationId}`;
}
```

## 7. i18n — full `chat`, `settings.communication`, `nav.chat`, act-as message keys

Merge these fragments into your `messages/<locale>.json` files. Both are complete, valid JSON
objects taken verbatim from the source repo's `messages/vi.json` and `messages/en.json`.

### `nav.chat` and `header.actAs` (both locales)

```json
// vi.json
{
  "nav": { "chat": "Trao đổi" },
  "header": {
    "actAs": {
      "label": "Đang đóng vai",
      "heading": "Đóng vai nhân sự (demo)",
      "searchPlaceholder": "Tìm nhân sự…"
    }
  }
}
```

```json
// en.json
{
  "nav": { "chat": "Chat" },
  "header": {
    "actAs": {
      "label": "Acting as",
      "heading": "Act as staff (demo)",
      "searchPlaceholder": "Search staff…"
    }
  }
}
```

### `chat` namespace — `messages/vi.json`

```json
{
  "title": "Trao đổi",
  "subtitle": "Kênh trao đổi nội bộ TCM",
  "newChatMenu": "Tạo mới",
  "newDirect": "Chat 1-1",
  "newGroup": "Tạo nhóm",
  "searchPlaceholder": "Tìm hội thoại…",
  "emptyList": "Chưa có hội thoại nào",
  "emptyConversation": "Chọn một hội thoại để bắt đầu",
  "directBadge": "1-1",
  "groupBadge": "Nhóm",
  "membersCount": "{count} thành viên",
  "you": "Bạn",
  "roleAdmin": "Quản trị",
  "roleMember": "Thành viên",
  "superAdminView": "Xem tất cả nhóm (quản trị hệ thống)",
  "superAdminViewHint": "Chế độ giám sát — chỉ xem, không gửi được.",
  "readOnlyNotMember": "Bạn không phải thành viên của nhóm này — chỉ xem.",
  "mutedBadge": "Đã tắt thông báo",
  "startDirectTitle": "Bắt đầu chat 1-1",
  "pickPerson": "Chọn người để trò chuyện",
  "createGroupTitle": "Tạo nhóm mới",
  "groupName": "Tên nhóm",
  "groupNamePlaceholder": "VD: BTC Sự kiện ABC",
  "pickMembers": "Chọn thành viên",
  "create": "Tạo",
  "start": "Bắt đầu",
  "cancel": "Hủy",
  "close": "Đóng",
  "save": "Lưu",
  "composerPlaceholder": "Nhập tin nhắn… (gõ @ để nhắc tên, Enter để gửi, Shift+Enter xuống dòng)",
  "send": "Gửi",
  "attachLink": "Đính kèm link",
  "linkText": "Nội dung hiển thị",
  "linkTextPlaceholder": "VD: Bảng dự toán sự kiện",
  "linkUrl": "Đường dẫn (URL)",
  "linkUrlPlaceholder": "https://…",
  "insertLink": "Chèn link",
  "openLink": "Mở link",
  "mentionAll": "tất cả",
  "manageGroup": "Quản lý nhóm",
  "renameGroup": "Đổi tên nhóm",
  "addMembers": "Thêm thành viên",
  "promote": "Bổ nhiệm quản trị",
  "leave": "Rời nhóm",
  "leaveConfirm": "Rời khỏi nhóm này? Bạn sẽ không nhận tin nhắn mới nữa.",
  "mute": "Tắt thông báo",
  "unmute": "Bật thông báo",
  "membersTitle": "Thành viên",
  "addMembersTitle": "Thêm thành viên vào nhóm",
  "add": "Thêm",
  "noOneToAdd": "Không còn nhân sự nào để thêm",
  "sysCreated": "{actor} đã tạo nhóm",
  "sysAdded": "{actor} đã thêm {name}",
  "sysLeft": "{name} đã rời nhóm",
  "sysRenamed": "{actor} đã đổi tên nhóm thành “{newName}”",
  "sysPromoted": "{actor} đã bổ nhiệm {name} làm quản trị",
  "errNotMember": "Bạn không phải thành viên của hội thoại này.",
  "errNotAdmin": "Chỉ quản trị nhóm mới thực hiện được thao tác này.",
  "errEmptyMessage": "Tin nhắn trống.",
  "errGroupNameRequired": "Vui lòng nhập tên nhóm.",
  "errPickMembers": "Vui lòng chọn ít nhất 1 thành viên.",
  "errLinkUrlRequired": "Vui lòng nhập đường dẫn hợp lệ.",
  "plusMenu": "Đính kèm",
  "attachImage": "Gửi hình ảnh",
  "attachVideo": "Gửi video",
  "attachVoice": "Ghi âm thoại",
  "recording": "Đang ghi âm",
  "recordingHint": "Tối đa 5 phút",
  "stopRecording": "Dừng & xem lại",
  "cancelRecording": "Hủy ghi âm",
  "micPermissionError": "Không thể truy cập micro. Vui lòng cho phép quyền micro và thử lại.",
  "previewImage": "[Hình ảnh]",
  "previewVideo": "[Video]",
  "previewVoice": "[Tin nhắn thoại · {duration}]",
  "errFileRequired": "Vui lòng chọn file.",
  "errFileType": "Định dạng file không được hỗ trợ.",
  "errFileTooLarge": "File vượt quá 10MB.",
  "errVoiceTooLong": "Tin nhắn thoại vượt quá 5 phút.",
  "reply": "Trả lời",
  "forward": "Chuyển tiếp",
  "forwardedLabel": "Đã chuyển tiếp",
  "forwardTitle": "Chuyển tiếp tin nhắn",
  "searchConversations": "Tìm hội thoại…",
  "loading": "Đang tải…",
  "noConversations": "Không có hội thoại nào.",
  "replyingTo": "Đang trả lời {name}",
  "attachFile": "Gửi file",
  "previewFile": "[File · {name}]",
  "errForwardInvalid": "Không thể chuyển tiếp tin nhắn này.",
  "sentTick": "Đã gửi",
  "readByAll": "Đã xem bởi tất cả",
  "seenByCount": "Đã xem bởi {count} người",
  "systemSenderLabel": "TCM",
  "react": "Bày tỏ cảm xúc",
  "moreReactions": "Thêm cảm xúc khác",
  "emojiPickerTitle": "Chọn biểu tượng cảm xúc",
  "emojiCategorySmileys": "Mặt cười",
  "emojiCategoryGestures": "Cử chỉ tay",
  "emojiCategoryHearts": "Trái tim",
  "emojiCategoryCelebration": "Ăn mừng",
  "emojiCategoryAnimals": "Động vật",
  "emojiCategoryFood": "Đồ ăn",
  "emojiCategoryActivities": "Hoạt động",
  "moreActions": "Thêm thao tác",
  "edit": "Chỉnh sửa",
  "editedLabel": "đã chỉnh sửa",
  "copyMessage": "Sao chép tin nhắn",
  "seenBy": "Đã xem bởi",
  "notSeenYet": "Chưa xem",
  "noOne": "Không có ai",
  "pin": "Ghim tin nhắn",
  "unpin": "Bỏ ghim",
  "pinned": "Đã ghim",
  "deleteForMe": "Xóa cho tôi",
  "deleteForEveryone": "Xóa cho tất cả",
  "messageDeletedForEveryone": "Tin nhắn này đã bị xóa",
  "errEditNotAllowed": "Không thể chỉnh sửa tin nhắn này.",
  "errPinInvalid": "Không thể ghim tin nhắn này.",
  "errPinLimitReached": "Mỗi hội thoại chỉ ghim tối đa {max} tin nhắn — vui lòng bỏ ghim bớt trước khi ghim thêm.",
  "attachReminder": "Nhắc hẹn",
  "attachPoll": "Bình chọn",
  "reminderModalTitle": "Tạo nhắc hẹn",
  "reminderTitleLabel": "Tiêu đề",
  "reminderTitlePlaceholder": "VD: Họp báo giá dự án ABC",
  "reminderTimeLabel": "Thời gian nhắc",
  "reminderRecurrenceLabel": "Lặp lại",
  "reminderAudienceLabel": "Nhắc cho",
  "audienceMe": "Chỉ mình tôi",
  "audienceGroup": "Cả nhóm",
  "reminderCreate": "Tạo nhắc hẹn",
  "recurrenceOnce": "Không lặp lại",
  "recurrenceDaily": "Hằng ngày",
  "recurrenceWeekly": "Hằng tuần",
  "recurrenceMonthly": "Hằng tháng",
  "reminderDone": "Đã nhắc xong",
  "sysReminderDue": "🔔 {title}",
  "errReminderTitleRequired": "Vui lòng nhập tiêu đề nhắc hẹn.",
  "errReminderTimeRequired": "Vui lòng chọn thời gian nhắc hợp lệ.",
  "errReminderTimeMustBeFuture": "Thời gian nhắc phải ở tương lai.",
  "reminderPreview": "[Nhắc hẹn] {title}",
  "pollModalTitle": "Tạo bình chọn",
  "pollQuestionLabel": "Nội dung bình chọn",
  "pollQuestionPlaceholder": "VD: Chọn ngày họp team tuần này?",
  "pollOptionsLabel": "Các phương án",
  "pollOptionNPlaceholder": "Phương án {n}",
  "pollAddOption": "Thêm phương án",
  "pollClosesAtLabel": "Thời gian kết thúc bình chọn (tùy chọn)",
  "pollSettingAllowMultiple": "Cho phép chọn nhiều phương án",
  "pollSettingAnonymous": "Ẩn tên người bình chọn",
  "pollSettingHideResults": "Ẩn kết quả cho tới khi tôi bình chọn",
  "pollSettingAllowAddOptions": "Cho phép thành viên khác thêm phương án",
  "pollCreate": "Tạo bình chọn",
  "errPollQuestionRequired": "Vui lòng nhập nội dung bình chọn.",
  "errPollMinOptions": "Cần ít nhất 2 phương án.",
  "errPollClosesAtInvalid": "Thời gian kết thúc bình chọn phải ở tương lai.",
  "pollPreview": "[Bình chọn] {question}",
  "pollAnonymous": "Ẩn danh",
  "pollMultipleChoice": "Chọn nhiều phương án",
  "pollClosed": "Đã kết thúc",
  "pollClosesAt": "Kết thúc lúc {date}",
  "pollOptionPlaceholder": "Nhập phương án mới…",
  "pollResultsHiddenUntilVoted": "Kết quả sẽ hiện sau khi bạn bình chọn.",
  "pollTotalVoters": "{count} người đã bình chọn",
  "errPollInvalid": "Không tìm thấy bình chọn này.",
  "errPollAddOptionNotAllowed": "Bình chọn này không cho phép thêm phương án.",
  "errPollClosed": "Bình chọn đã kết thúc.",
  "errPollOptionRequired": "Vui lòng nhập nội dung phương án.",
  "disbandGroup": "Giải tán nhóm",
  "disbandGroupConfirm": "Giải tán nhóm này? Toàn bộ tin nhắn, thành viên sẽ bị xóa vĩnh viễn và không thể khôi phục.",
  "errCannotDisbandTcmFamily": "Không thể giải tán nhóm \"GIA ĐÌNH TCM\" — nhóm hệ thống dùng cho tự động thêm nhân sự mới và tin chúc mừng tự động.",
  "groupAvatar": "Ảnh đại diện nhóm",
  "changeAvatar": "Đổi ảnh",
  "historyAccessLabel": "Cho thành viên mới đọc lịch sử chat",
  "historyAccessFull": "Cho phép đọc toàn bộ lịch sử",
  "historyAccessFromNow": "Không cho đọc lịch sử cũ (chỉ thấy tin từ lúc được thêm)",
  "pinConversation": "Ghim lên đầu",
  "unpinConversation": "Bỏ ghim"
}
```

### `chat` namespace — `messages/en.json`

```json
{
  "title": "Chat",
  "subtitle": "TCM internal communication channel",
  "newChatMenu": "New",
  "newDirect": "Direct chat",
  "newGroup": "New group",
  "searchPlaceholder": "Search conversations…",
  "emptyList": "No conversations yet",
  "emptyConversation": "Select a conversation to start",
  "directBadge": "1-1",
  "groupBadge": "Group",
  "membersCount": "{count} members",
  "you": "You",
  "roleAdmin": "Admin",
  "roleMember": "Member",
  "superAdminView": "View all groups (system admin)",
  "superAdminViewHint": "Oversight mode — read-only, cannot send.",
  "readOnlyNotMember": "You are not a member of this group — read-only.",
  "mutedBadge": "Muted",
  "startDirectTitle": "Start a direct chat",
  "pickPerson": "Pick someone to chat with",
  "createGroupTitle": "Create a new group",
  "groupName": "Group name",
  "groupNamePlaceholder": "e.g. Event ABC crew",
  "pickMembers": "Pick members",
  "create": "Create",
  "start": "Start",
  "cancel": "Cancel",
  "close": "Close",
  "save": "Save",
  "composerPlaceholder": "Type a message… (type @ to mention, Enter to send, Shift+Enter for a new line)",
  "send": "Send",
  "attachLink": "Attach link",
  "linkText": "Display text",
  "linkTextPlaceholder": "e.g. Event budget sheet",
  "linkUrl": "URL",
  "linkUrlPlaceholder": "https://…",
  "insertLink": "Insert link",
  "openLink": "Open link",
  "mentionAll": "all",
  "manageGroup": "Manage group",
  "renameGroup": "Rename group",
  "addMembers": "Add members",
  "promote": "Make admin",
  "leave": "Leave group",
  "leaveConfirm": "Leave this group? You will stop receiving new messages.",
  "mute": "Mute notifications",
  "unmute": "Unmute notifications",
  "membersTitle": "Members",
  "addMembersTitle": "Add members to group",
  "add": "Add",
  "noOneToAdd": "No more staff to add",
  "sysCreated": "{actor} created the group",
  "sysAdded": "{actor} added {name}",
  "sysLeft": "{name} left the group",
  "sysRenamed": "{actor} renamed the group to “{newName}”",
  "sysPromoted": "{actor} made {name} an admin",
  "errNotMember": "You are not a member of this conversation.",
  "errNotAdmin": "Only a group admin can do this.",
  "errEmptyMessage": "Empty message.",
  "errGroupNameRequired": "Please enter a group name.",
  "errPickMembers": "Please pick at least 1 member.",
  "errLinkUrlRequired": "Please enter a valid URL.",
  "plusMenu": "Attach",
  "attachImage": "Send image",
  "attachVideo": "Send video",
  "attachVoice": "Record voice message",
  "recording": "Recording",
  "recordingHint": "Max 5 minutes",
  "stopRecording": "Stop & review",
  "cancelRecording": "Cancel recording",
  "micPermissionError": "Could not access the microphone. Please allow mic access and try again.",
  "previewImage": "[Image]",
  "previewVideo": "[Video]",
  "previewVoice": "[Voice message · {duration}]",
  "errFileRequired": "Please choose a file.",
  "errFileType": "This file type is not supported.",
  "errFileTooLarge": "File exceeds 10MB.",
  "errVoiceTooLong": "Voice message exceeds 5 minutes.",
  "reply": "Reply",
  "forward": "Forward",
  "forwardedLabel": "Forwarded",
  "forwardTitle": "Forward message",
  "searchConversations": "Search conversations…",
  "loading": "Loading…",
  "noConversations": "No conversations.",
  "replyingTo": "Replying to {name}",
  "attachFile": "Send file",
  "previewFile": "[File · {name}]",
  "errForwardInvalid": "This message cannot be forwarded.",
  "sentTick": "Sent",
  "readByAll": "Seen by all",
  "seenByCount": "Seen by {count}",
  "systemSenderLabel": "TCM",
  "react": "React",
  "moreReactions": "More reactions",
  "emojiPickerTitle": "Pick an emoji",
  "emojiCategorySmileys": "Smileys",
  "emojiCategoryGestures": "Gestures",
  "emojiCategoryHearts": "Hearts",
  "emojiCategoryCelebration": "Celebration",
  "emojiCategoryAnimals": "Animals",
  "emojiCategoryFood": "Food",
  "emojiCategoryActivities": "Activities",
  "moreActions": "More actions",
  "edit": "Edit",
  "editedLabel": "edited",
  "copyMessage": "Copy message",
  "seenBy": "Seen by",
  "notSeenYet": "Not seen yet",
  "noOne": "No one",
  "pin": "Pin message",
  "unpin": "Unpin",
  "pinned": "Pinned",
  "deleteForMe": "Delete for me",
  "deleteForEveryone": "Delete for everyone",
  "messageDeletedForEveryone": "This message was deleted",
  "errEditNotAllowed": "This message cannot be edited.",
  "errPinInvalid": "This message cannot be pinned.",
  "errPinLimitReached": "Each conversation can pin at most {max} messages — unpin one first.",
  "attachReminder": "Reminder",
  "attachPoll": "Poll",
  "reminderModalTitle": "Create reminder",
  "reminderTitleLabel": "Title",
  "reminderTitlePlaceholder": "E.g. Quote review meeting for project ABC",
  "reminderTimeLabel": "Remind at",
  "reminderRecurrenceLabel": "Repeat",
  "reminderAudienceLabel": "Remind",
  "audienceMe": "Just me",
  "audienceGroup": "Whole group",
  "reminderCreate": "Create reminder",
  "recurrenceOnce": "Does not repeat",
  "recurrenceDaily": "Daily",
  "recurrenceWeekly": "Weekly",
  "recurrenceMonthly": "Monthly",
  "reminderDone": "Reminder sent",
  "sysReminderDue": "🔔 {title}",
  "errReminderTitleRequired": "Please enter a reminder title.",
  "errReminderTimeRequired": "Please choose a valid reminder time.",
  "errReminderTimeMustBeFuture": "Reminder time must be in the future.",
  "reminderPreview": "[Reminder] {title}",
  "pollModalTitle": "Create poll",
  "pollQuestionLabel": "Poll question",
  "pollQuestionPlaceholder": "E.g. Which day should we meet this week?",
  "pollOptionsLabel": "Options",
  "pollOptionNPlaceholder": "Option {n}",
  "pollAddOption": "Add option",
  "pollClosesAtLabel": "Poll closing time (optional)",
  "pollSettingAllowMultiple": "Allow selecting multiple options",
  "pollSettingAnonymous": "Hide voter names",
  "pollSettingHideResults": "Hide results until I vote",
  "pollSettingAllowAddOptions": "Allow other members to add options",
  "pollCreate": "Create poll",
  "errPollQuestionRequired": "Please enter the poll question.",
  "errPollMinOptions": "At least 2 options are required.",
  "errPollClosesAtInvalid": "Poll closing time must be in the future.",
  "pollPreview": "[Poll] {question}",
  "pollAnonymous": "Anonymous",
  "pollMultipleChoice": "Multiple choice",
  "pollClosed": "Closed",
  "pollClosesAt": "Closes at {date}",
  "pollOptionPlaceholder": "Enter a new option…",
  "pollResultsHiddenUntilVoted": "Results will show after you vote.",
  "pollTotalVoters": "{count} people voted",
  "errPollInvalid": "This poll could not be found.",
  "errPollAddOptionNotAllowed": "This poll does not allow adding options.",
  "errPollClosed": "This poll is closed.",
  "errPollOptionRequired": "Please enter the option text.",
  "disbandGroup": "Disband group",
  "disbandGroupConfirm": "Disband this group? All messages and members will be permanently deleted and cannot be recovered.",
  "errCannotDisbandTcmFamily": "\"GIA ĐÌNH TCM\" cannot be disbanded — this system group is used for auto-adding new staff and automatic celebration messages.",
  "groupAvatar": "Group avatar",
  "changeAvatar": "Change photo",
  "historyAccessLabel": "Let new members read chat history",
  "historyAccessFull": "Allow reading full history",
  "historyAccessFromNow": "Do not allow old history (only see messages from when added)",
  "pinConversation": "Pin to top",
  "unpinConversation": "Unpin"
}
```

### `settings.communication` namespace — both locales

```json
// vi.json
{
  "title": "Trao đổi nội bộ",
  "desc": "Cấu hình kênh communication (super-admin, nhịp cập nhật).",
  "superAdminTitles": "Chức danh super-admin",
  "superAdminTitlesHint": "Danh sách chức danh được xem tất cả nhóm chat (phân cách bằng dấu phẩy). VD: CEO, BD Director.",
  "pollSeconds": "Nhịp cập nhật tin nhắn (giây)",
  "pollSecondsHint": "Chu kỳ tự tải tin nhắn mới khi đang mở hội thoại. Mặc định 4 giây.",
  "save": "Lưu cài đặt",
  "saved": "Đã lưu",
  "errorInvalid": "Giá trị không hợp lệ."
}
```

```json
// en.json
{
  "title": "Internal chat",
  "desc": "Configure the communication channel (super-admin, refresh cadence).",
  "superAdminTitles": "Super-admin titles",
  "superAdminTitlesHint": "Titles allowed to view all group chats (comma-separated). e.g. CEO, BD Director.",
  "pollSeconds": "Message refresh interval (seconds)",
  "pollSecondsHint": "How often new messages auto-load while a conversation is open. Default 4 seconds.",
  "save": "Save settings",
  "saved": "Saved",
  "errorInvalid": "Invalid value."
}
```

---

## 8. Wiring checklist (non-chat files that need small edits)

1. **`src/components/layout/nav-items.ts`** — add the nav entry (this repo places it as item ⑨,
   flagged `accent: true` so it stands out from other nav items):
   ```ts
   { module: "⑨", labelKey: "chat", href: "/chat", icon: MessagesSquare, status: "active", accent: true },
   ```
   Requires `MessagesSquare` from `lucide-react` and a `nav.chat` i18n key (§7).

2. **`src/components/layout/sidebar.tsx`** — no chat-specific code beyond consuming the
   `accent`/`accent-chat` styling already defined by the nav-items entry above:
   ```tsx
   <Icon className={cn("h-[18px] w-[18px] shrink-0", item.accent && !isActive && "text-accent-chat")} strokeWidth={2} />
   <span className={cn("flex-1 truncate", item.accent && !isActive && "font-semibold text-accent-chat")}>
   ...
   ? "bg-accent-chat text-white shadow-sm"
   ```
   This requires the `--accent-chat` / `--accent-chat-bg` CSS custom properties defined in
   `src/app/globals.css` (light + dark variants):
   ```css
   --accent-chat: #7c3aed;
   --accent-chat-bg: #f3e8ff;
   --color-accent-chat: var(--accent-chat);
   --color-accent-chat-bg: var(--accent-chat-bg);
   /* dark theme override */
   --accent-chat: #a78bfa;
   --accent-chat-bg: #2e1a5c;
   ```
   If your target design system doesn't want a dedicated "chat accent color", you can drop the
   `accent`/`accent-chat` styling and just use the nav item like any other — it's cosmetic only.

3. **`src/components/layout/header.tsx`** — mounts `<ActAsSwitcher staff={actAsStaff} currentId={currentStaffId} />`
   in the top-right action cluster, alongside the language switcher, theme toggle, and notification
   bell:
   ```tsx
   <ActAsSwitcher staff={actAsStaff} currentId={currentStaffId} />
   ```
   `Header` takes `actAsStaff: ActAsStaff[]` and `currentStaffId: string | null` as props — both
   supplied by the layout below.

4. **`src/app/(app)/layout.tsx`** (the app shell layout, NOT `src/app/(app)/chat/layout.tsx`) —
   this is where `getCurrentStaffId()`, the full active-staff list (for the act-as switcher), and
   the two "check on render" calls for this module are wired in:
   ```ts
   import { checkSpecialOccasions } from "@/lib/occasions";
   import { checkChatReminders } from "@/lib/chat-reminders";
   // ...
   await Promise.all([/* ...other reminder checks... */, checkSpecialOccasions(), checkChatReminders()]);
   // ...
   const staffRows = await prisma.staff.findMany({
     where: { isActive: true },
     select: { id: true, fullName: true, title: true, department: { select: { name: true } } },
     orderBy: { fullName: "asc" },
   });
   const actAsStaff = staffRows.map((s) => ({ id: s.id, fullName: s.fullName, title: s.title, departmentName: s.department?.name ?? null }));
   // <Header reminderCount={reminderCount} actAsStaff={actAsStaff} currentStaffId={currentStaffId} />
   ```
   If your target codebase doesn't already have a "reminder bell" badge (`unread Notification`
   count in the header), you can drop that part — it's a pre-existing app feature chat merely
   contributes rows to (via `CHAT_MESSAGE`/`CHAT_MENTION`/`REMINDER_DUE` notifications), not
   something chat introduces on its own.

5. **`src/app/(app)/settings/page.tsx`** (settings index/tile grid) — add the tile:
   ```tsx
   { href: "/settings/communication", icon: MessagesSquare, title: t("communicationTitle"), desc: t("communicationDesc") },
   ```
   This requires 2 more i18n keys not listed in §7 because they live in a different namespace
   (`settings.index`) than the ones this doc extracted — add
   `settings.index.communicationTitle` / `settings.index.communicationDesc` yourself, matching
   the pattern of the other tiles already on that page.

6. **`.gitignore`** — add the attachment storage directory (already present in the source repo):
   ```gitignore
   # chat attachment binaries (local disk, outside public/ — see src/lib/chat-storage.ts)
   /storage
   ```

7. **`prisma/seed.ts`** (optional, but needed if you want the family group + sample conversations
   seeded like the source repo does) — seed pattern used in the source (guarded by
   `conversation.count() === 0` for sample data, and a separate `findFirst` guard for the family
   group so re-running `db:seed` on an existing DB still creates it if missing):
   ```ts
   import { TCM_FAMILY_GROUP_NAME } from "../src/lib/chat";
   // ...
   { module: "communication", key: "super_admin_titles", value: "CEO, BD Director" }, // Setting row default
   // ...
   if (!(await prisma.conversation.findFirst({ where: { type: "GROUP", name: TCM_FAMILY_GROUP_NAME } }))) {
     const allStaff = await prisma.staff.findMany({ where: { isActive: true }, select: { id: true, fullName: true } });
     if (allStaff.length > 0) {
       const family = await prisma.conversation.create({
         data: {
           type: "GROUP",
           name: TCM_FAMILY_GROUP_NAME,
           avatarKey: "/brand/icon-square.png", // ← company-specific static logo path, see §11
           createdById: ceo.id,
           members: { create: allStaff.map((s) => ({ staffId: s.id, role: s.id === ceo.id ? "ADMIN" : "MEMBER" })) },
         },
       });
       // ... (sample welcome messages, see prisma/seed.ts in the source repo for the full block)
     }
   }
   ```
   The `avatarKey: "/brand/icon-square.png"` line means you must either (a) place an equivalent
   square logo asset at that path under your target repo's `public/brand/`, or (b) change this to
   `null`/omit it so the family group falls back to text initials instead of a logo image.

---

## 9. Environment variables / config required

- **`ACT_AS_SECRET`** — HMAC signing secret for the "act as" cookie
  (`src/lib/current-staff.ts`). **Currently falls back to a hardcoded dev value if unset:**
  `"tcm-dev-actas-secret-change-in-prod"`. This is shipped in source control. **MUST be set to a
  real random secret in any deployment** (even an internal one) — the fallback string is visible
  to anyone who can read this repository's source, which defeats the HMAC signature's entire
  purpose (forging the cookie becomes trivial: `HMAC-SHA256("tcm-dev-actas-secret-change-in-prod", <any staffId>)`).
- No other chat-specific environment variables exist. `DATABASE_URL` (Prisma's standard datasource
  variable) is a pre-existing app-wide dependency, not something chat introduces.
- The local attachment storage path (`storage/chat-uploads/`) is a hardcoded relative path
  (`process.cwd()`-relative) in `src/lib/chat-storage.ts`, not an env var. If your deployment target
  has an ephemeral filesystem (e.g. most serverless/container platforms without a persistent
  volume), **uploaded chat attachments and group avatars will be lost on every redeploy/restart** —
  this is a real operational risk to flag before going to production; the code comments already
  anticipate swapping to S3/MinIO later by noting only `saveChatAttachment`/`readChatAttachment` in
  `chat-storage.ts` would need to change.

---

## 10. Known limitations (carried over honestly)

- **No real authentication.** Every "permission" in this module (group admin, super-admin,
  membership) is enforced only against whatever staffId the "act as" HMAC cookie currently claims.
  There is no login, no session, no password. This is explicitly a demo/internal-tool pattern, not
  something to expose to untrusted users. See §3 item 1, §9.
- **Polling, not websockets.** Near-realtime is achieved by the client polling
  `GET /api/chat/[id]/messages` every N seconds (configurable 2–60s, default 4s). This means: (a)
  message latency is bounded by the poll interval, not instant; (b) every open conversation tab
  generates recurring DB load proportional to `(open tabs) / (poll interval)` — there is no
  connection-based backpressure or presence tracking.
- **Notifications are conversation-scoped, not globally deduplicated in the UI beyond the standard
  `Notification.isRead` flag** — verified from code: `notifyNewMessage` always inserts a fresh row
  per recipient per message (no "coalesce multiple unread messages in the same conversation into
  one notification" logic). The header's badge count is a simple
  `prisma.notification.count({ where: { isRead: false } })` across the WHOLE `Notification` table
  (not scoped per-recipient!) — this is a pre-existing app-wide characteristic (see
  `src/app/(app)/layout.tsx`), not something specific to chat, but it means the "unread" badge in
  this no-real-auth demo app is effectively global, not per-person. Confirm whether your target
  app's notification system is per-recipient before assuming this scoping carries over correctly.
- **Leaving a group is a hard delete** of the `ConversationMember` row (consistent with the app's
  broader "no soft-delete" convention) — there is no "rejoin and see what you missed" unless an
  admin re-adds you, and re-adding creates a brand-new membership row (so `historyVisibleFrom` can
  reset the history cutoff for that person again, per admin choice at re-add time).
- **Message reactions are fully implemented, not schema-only** — contrary to what the porting brief
  speculated might be the case, both the `MessageReaction` schema AND the complete UI (quick-pick
  bar, full categorized emoji picker, reaction pills with hover-to-see-names, toggle logic) exist
  and work end-to-end. There is nothing "unimplemented" to flag here.
- **No magic-byte / content-sniffing validation on uploads** — `chat-storage.ts` and `actions.ts`
  validate attachments purely by the browser-supplied `File.type` (MIME header) against an
  allowlist, plus a byte-size cap. A malicious client could lie about `File.type` (e.g. label an
  executable as `image/png`). This is an accepted risk for an internal tool with a small trusted
  user base, not something the source code tries to harden against — flag this explicitly if
  porting into a context with less-trusted uploaders.
- **Link preview SSRF guard is DNS-resolve-time only**, not a full network-layer protection —
  documented directly in the source comments (`src/lib/link-preview.ts`) as intentionally not
  defending against DNS-rebinding attacks, which would require pinning the resolved IP at the
  socket layer. Reasonable for an internal-convenience feature, not bulletproof.
- **No cron; "check on render" for reminders and celebrations.** Both `checkSpecialOccasions()` and
  `checkChatReminders()` run on every request to the authenticated app layout — meaning under zero
  traffic (e.g. overnight), a reminder that "fires" at 3am will not actually post until the first
  person loads any page after 3am. If your deployment target has an actual task scheduler
  available, consider moving these two calls to a real cron job instead of leaving them coupled to
  page renders — but note doing so changes the idempotency assumptions only slightly (the
  optimistic-concurrency/unique-constraint guards already make concurrent firers safe either way).
- **`groupAvatarUrl()` has a likely typo/bug** in `src/lib/utils.ts` — see the callout at the end of
  §6 for the exact line and recommended fix.
- **The auto-join-on-act-as-login feature (`ensureTcmFamilyMembership`) is tightly coupled to the
  act-as demo mechanism**, not to a real login/signup event. If your target app has real
  authentication, you will need to decide where the equivalent "first login" hook lives (e.g. an
  actual sign-up completion handler, an SSO first-login callback) — see §11 for the exact literals
  this feature depends on.

---

## 11. Manual rename checklist for the target company

Every literal below is TCM-specific and must be located and changed for a different company. None
of these are parameterized via environment variables or Settings rows in the source code — they are
hardcoded string/date literals inside the files listed.

1. **`TCM_FAMILY_GROUP_NAME = "GIA ĐÌNH TCM"`** — `src/lib/chat.ts` (~line 307). The single
   exported constant controlling the "family group" name everywhere else in the codebase (every
   other file imports this constant rather than hardcoding the string) — change this one line and
   the group-protection logic (`disbandGroup`, `addMembers` history rule) automatically follows.
   Also update the display string in the i18n key `chat.errCannotDisbandTcmFamily` in both
   `messages/vi.json` and `messages/en.json` (§7) — it contains the literal text
   `"GIA ĐÌNH TCM"` hardcoded inside the translation string itself, which does NOT auto-update from
   the constant above.

2. **The CEO-fallback email `"ceo@tcm.vn"`** — `src/lib/current-staff.ts`,
   `getCurrentStaffId()`. **This is the single most dangerous hidden dependency in the whole
   module**: if no "act as" cookie is present (e.g. a fresh browser, or the cookie expired), the
   ENTIRE APP silently falls back to whichever staff row has this exact email. If the target
   company's seed data does not contain a staff member with email `ceo@tcm.vn`, `getCurrentStaffId()`
   returns `null` for anyone without an active act-as cookie, and every chat action / page will
   behave as "not logged in" (redirects, 401s, empty states) until someone explicitly picks an
   identity via the act-as switcher. Decide on a target-company-appropriate fallback (a different
   seeded email, or removing the fallback entirely and forcing act-as selection).

3. **`AUTO_JOIN_EMAIL_DOMAIN = "@tcmbtl.com"`** — `src/lib/chat.ts`, used by
   `ensureTcmFamilyMembership()`. Controls which staff emails trigger auto-join into the family
   group on first act-as login. Must be changed to the target company's real email domain (note in
   the source repo this is DELIBERATELY a different domain than the CEO fallback email's `@tcm.vn` —
   the code comment explains this filters out "legacy staff on other domains" from the auto-join
   behavior; decide whether the target company wants an analogous domain-based filter or a simpler
   "auto-join everyone" rule).

4. **`ACT_AS_SECRET` dev fallback `"tcm-dev-actas-secret-change-in-prod"`** —
   `src/lib/current-staff.ts`. MUST-CHANGE for any real deployment — see §9. Not company-branded
   text, but a literal secret value that must never be reused across deployments/companies.

5. **Company founding date constants** — `src/lib/occasions.ts`:
   `COMPANY_FOUNDING_YEAR = 2000`, `COMPANY_FOUNDING_MONTH = 7` (August, 0-indexed),
   `COMPANY_FOUNDING_DAY = 28`. Change to the target company's actual founding date, or remove the
   "company birthday" auto-post feature entirely if not wanted.

6. **"Happy birthday TCM" baked into the SVG** — `src/lib/celebration-cards.ts`,
   `buildCompanyBirthdaySvg()`, the line:
   `<text ...>🎉 Happy birthday TCM 🎉</text>`. Hardcoded English text inside the generated SVG
   markup (not i18n'd) — change the literal string "TCM" to the target company name (or
   internationalize the whole card generator if you want it localized, which the source code does
   not do).

7. **"onboard TCM family" + "TCM — Targeted Marketing · Est 2000" baked into the SVG** —
   `src/lib/welcome-card.ts`, `buildWelcomeSvg()`, the lines:
   ```
   <text ...>onboard TCM family</text>
   <text ...>TCM — Targeted Marketing · Est 2000</text>
   ```
   Both are hardcoded, non-i18n'd English text describing the source company by name and tagline.
   Change or remove.

8. **`avatarKey: "/brand/icon-square.png"`** — `prisma/seed.ts`, in the family-group seed block
   (§8 item 7). A static asset path pointing at TCM's square logo under `public/brand/`. Replace
   with the target company's equivalent logo asset path, or omit the field entirely to fall back to
   text-initials avatar rendering.

9. **`super_admin_titles` default seed value `"CEO, BD Director"`** — `prisma/seed.ts` (the
   `Setting` row seeded for `module: "communication", key: "super_admin_titles"`) and the code
   default `SUPER_ADMIN_TITLES_DEFAULT = "CEO"` in `src/lib/chat.ts`. These are organizational job
   titles, not brand literals, but still worth reviewing — the target company's actual title
   taxonomy for "who gets to view all group chats read-only" will likely differ.

10. **`User-Agent` string in the link-preview fetch** — `src/lib/link-preview.ts`:
    `"Mozilla/5.0 (compatible; TCM-CRM-LinkPreview/1.0)"`. Cosmetic (identifies the crawler to
    external sites you unfurl links from) but contains "TCM-CRM" — rename to match the target
    product name if you care about outbound User-Agent branding.

11. **`systemSenderLabel: "TCM"` i18n key** — `messages/vi.json` and `messages/en.json`, `chat`
    namespace (§7). This is the label shown in the chat UI whenever a message has `senderId: null`
    (system-authored posts: welcome cards, celebration cards, reminder-due system lines). Change to
    the target company's short name/brand initials.

12. **`"BTC — Activation Tết"` and other Vietnamese sample-data strings in `prisma/seed.ts`'s chat
    seeding block** (~line 1162 onward) — these are demo/sample conversation content (group name,
    sample messages, staff names like "Yến", "Thảo") used only to populate a fresh dev database with
    realistic-looking data. Not required for the feature to function; regenerate or delete this
    block for the target company's own demo data, or skip seeding chat sample data entirely.

None of the core Prisma schema, server actions, API routes, or UI component code (§4, §6) contain
any OTHER TCM-specific literals beyond what's listed above — verified by reading every file in full
and cross-checking against the constants/strings called out in code comments throughout the source.
