"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessagesSquare, Sparkles, Minus, X, Users } from "lucide-react";
import { cn, initials, groupAvatarUrl } from "@/lib/utils";
import { ChatConversation } from "@/app/(app)/chat/chat-conversation";
import { loadChatDock, loadChatPanel } from "@/app/(app)/chat/actions";
import type { ConversationView } from "@/app/(app)/chat/conversation-data";
import type { ChatListItem } from "@/app/(app)/chat/types";
import { loadAiPanel } from "@/app/(app)/ai/actions";
import { BoardReportTool, BrainstormTool, CanvaBriefTool, ContentWriterTool, CostSheetTool, TrendTool } from "@/app/(app)/ai/ai-tools";
import { NotConfiguredBanner } from "@/app/(app)/ai/ai-shared";

/**
 * Dock hộp nổi — vừa làm việc ở module khác vừa chat / hỏi AI, không phải rời trang.
 * Hộp KÉO ĐI ĐƯỢC (giữ thanh tiêu đề) và KÉO GIÃN ĐƯỢC (mép phải / mép dưới / góc dưới-phải).
 *
 * ĐẶT Ở `(app)/layout.tsx`, KHÔNG đặt trong <header>: header có `backdrop-blur` nên trở thành
 * containing block, mọi `position: fixed` bên trong sẽ bị nhốt lại (HANDOVER mục 4.4 — repo đã
 * vấp một lần với drawer mobile). Cùng lý do đó, khung hộp dưới đây KHÔNG dùng
 * transform/filter/backdrop-blur: ChatConversation có modal `fixed inset-0 z-50` (poll, nhắc việc,
 * chuyển tiếp) cần phủ toàn màn hình chứ không phải phủ trong hộp.
 *
 * Kéo/giãn theo đúng pattern tay kéo của sidebar.tsx: ref giữ trạng thái đang kéo + listener ở
 * window, KHÔNG đặt state mỗi mousemove cho tới khi có thay đổi thật.
 *
 * Chỉ hiện từ breakpoint lg — màn hình nhỏ không có chỗ vừa xem module vừa mở hộp.
 *
 * State sống trong layout nên giữ nguyên khi điều hướng client giữa các module — đó là mục đích
 * tính năng. Tải lại trang thật (F5) thì mất, có chủ ý.
 */

type BoxKind = "chat" | "ai" | "picker";
type Box = {
  key: string;
  kind: BoxKind;
  conversationId?: string;
  minimized: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

const DEFAULT_W = 380;
const DEFAULT_H = 540;
const MIN_W = 300;
const MIN_H = 240;
const HEADER_H = 41; // thanh tiêu đề — chiều cao khi thu nhỏ
const MARGIN = 16;

/** Ghim hộp vào trong tầm nhìn — dùng cả khi kéo lẫn khi cửa sổ đổi kích thước. */
function clamp(box: Box, vw: number, vh: number): Box {
  const w = Math.min(box.w, Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(box.h, Math.max(MIN_H, vh - MARGIN * 2));
  const visibleH = box.minimized ? HEADER_H : h;
  return {
    ...box,
    w,
    h,
    x: Math.min(Math.max(box.x, MARGIN), Math.max(MARGIN, vw - w - MARGIN)),
    y: Math.min(Math.max(box.y, MARGIN), Math.max(MARGIN, vh - visibleH - MARGIN)),
  };
}

type DragMode = "move" | "e" | "s" | "se";
type DragState = {
  key: string;
  mode: DragMode;
  startMouseX: number;
  startMouseY: number;
  startBox: Box;
};

const DRAG_CURSOR: Record<DragMode, string> = {
  move: "grabbing",
  e: "col-resize",
  s: "row-resize",
  se: "nwse-resize",
};

export function FloatingDock({ canChat, canAi }: { canChat: boolean; canAi: boolean }) {
  const t = useTranslations("dock");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const dragRef = useRef<DragState | null>(null);
  // Chỉ để đổi con trỏ chuột toàn trang khi đang kéo. Toạ độ thật đi qua dragRef để mỗi lần
  // mousemove không kéo theo một vòng render thừa.
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  const close = useCallback((key: string) => {
    setBoxes((b) => {
      // Bỏ cache payload khi đóng — mở lại phải nạp mới, không thì thấy tin nhắn/ghim cũ.
      const gone = b.find((x) => x.key === key);
      if (gone?.conversationId) panelCache.delete(gone.conversationId);
      return b.filter((x) => x.key !== key);
    });
  }, []);
  const toggleMin = useCallback(
    (key: string) => setBoxes((b) => b.map((x) => (x.key === key ? { ...x, minimized: !x.minimized } : x))),
    [],
  );
  /** Đưa hộp vừa chạm lên trên cùng — cần vì hộp giờ chồng nhau được. */
  const raise = useCallback(
    (key: string) => setBoxes((b) => (b[b.length - 1]?.key === key ? b : [...b.filter((x) => x.key !== key), ...b.filter((x) => x.key === key)])),
    [],
  );

  // ── Kéo di chuyển / kéo giãn ──
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startMouseX;
      const dy = e.clientY - d.startMouseY;
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.key !== d.key) return b;
          const next =
            d.mode === "move"
              ? { ...b, x: d.startBox.x + dx, y: d.startBox.y + dy }
              : {
                  ...b,
                  w: d.mode === "s" ? b.w : Math.max(MIN_W, d.startBox.w + dx),
                  h: d.mode === "e" ? b.h : Math.max(MIN_H, d.startBox.h + dy),
                };
          return clamp(next, window.innerWidth, window.innerHeight);
        }),
      );
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragMode(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Con trỏ + chặn bôi đen văn bản trong lúc kéo — dọn lại khi thả (kể cả khi component unmount
  // giữa chừng, nếu không cả trang sẽ kẹt con trỏ "grabbing").
  useEffect(() => {
    if (!dragMode) return;
    document.body.style.cursor = DRAG_CURSOR[dragMode];
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [dragMode]);

  // Thu nhỏ cửa sổ trình duyệt có thể đẩy hộp ra ngoài tầm nhìn → ghim lại.
  useEffect(() => {
    function onResize() {
      setBoxes((prev) => prev.map((b) => clamp(b, window.innerWidth, window.innerHeight)));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function startDrag(key: string, mode: DragState["mode"], e: React.MouseEvent) {
    const box = boxes.find((b) => b.key === key);
    if (!box) return;
    e.preventDefault();
    raise(key);
    dragRef.current = { key, mode, startMouseX: e.clientX, startMouseY: e.clientY, startBox: box };
    setDragMode(mode);
  }

  /** Vị trí cho hộp mới: neo góc dưới-phải rồi lệch dần lên-trái để không che nhau. */
  function spawn(kind: BoxKind, key: string, conversationId?: string) {
    setBoxes((prev) => {
      if (prev.some((b) => b.key === key)) return [...prev.filter((b) => b.key !== key), ...prev.filter((b) => b.key === key)];
      const n = prev.length;
      const base: Box = {
        key,
        kind,
        conversationId,
        minimized: false,
        x: window.innerWidth - DEFAULT_W - MARGIN - n * 36,
        y: window.innerHeight - DEFAULT_H - MARGIN - n * 28,
        w: DEFAULT_W,
        h: DEFAULT_H,
      };
      return [...prev, clamp(base, window.innerWidth, window.innerHeight)];
    });
  }

  function openConversation(id: string) {
    setBoxes((prev) => prev.filter((x) => x.kind !== "picker"));
    spawn("chat", `chat:${id}`, id);
  }

  if (!canChat && !canAi) return null;

  return (
    <>
      {boxes.map((box, i) => (
        <div
          key={box.key}
          onMouseDown={() => raise(box.key)}
          style={{ left: box.x, top: box.y, width: box.w, height: box.minimized ? HEADER_H : box.h, zIndex: 40 + i }}
          className="fixed hidden lg:block"
        >
          {/* Lớp trong chịu bo góc + cắt nội dung; tay kéo nằm NGOÀI lớp này nên không bị cắt
              và không đè lên thanh cuộn của khung chat. */}
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <BoxHeader
              box={box}
              onDragStart={(e) => startDrag(box.key, "move", e)}
              onToggle={() => toggleMin(box.key)}
              onClose={() => close(box.key)}
            />

            {!box.minimized && (
              <div className="min-h-0 flex-1">
                {box.kind === "picker" && <ConversationPicker onPick={openConversation} />}
                {box.kind === "chat" && box.conversationId && <ChatBoxBody conversationId={box.conversationId} />}
                {box.kind === "ai" && <AiPanel />}
              </div>
            )}
          </div>

          {/* Tay kéo giãn — mép phải, mép dưới, góc dưới-phải; lệch hẳn ra ngoài viền để không
              tranh chỗ với thanh cuộn bên trong. Ẩn khi thu nhỏ. */}
          {!box.minimized && (
            <>
              <div onMouseDown={(e) => startDrag(box.key, "e", e)} className="absolute inset-y-3 -right-1 w-2 cursor-col-resize" aria-hidden />
              <div onMouseDown={(e) => startDrag(box.key, "s", e)} className="absolute inset-x-3 -bottom-1 h-2 cursor-row-resize" aria-hidden />
              <div
                onMouseDown={(e) => startDrag(box.key, "se", e)}
                role="separator"
                aria-label={t("resize")}
                className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize rounded-br-xl"
              />
            </>
          )}
        </div>
      ))}

      {/* Nút mở — neo cố định góc dưới-phải, không kéo được */}
      <div className="fixed bottom-4 right-4 z-30 hidden flex-col gap-2 lg:flex">
        {canAi && (
          <button
            type="button"
            onClick={() => spawn("ai", "ai")}
            title={t("openAi")}
            aria-label={t("openAi")}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-chat text-white shadow-lg hover:opacity-90"
          >
            <Sparkles className="h-5 w-5" />
          </button>
        )}
        {canChat && (
          <button
            type="button"
            onClick={() => spawn("picker", "picker")}
            title={t("openChat")}
            aria-label={t("openChat")}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600"
          >
            <MessagesSquare className="h-5 w-5" />
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Thanh tiêu đề = tay kéo di chuyển.
 * Thu nhỏ CHỈ qua nút riêng, không phải bấm vào tiêu đề — nếu tiêu đề vừa kéo vừa bấm thì mỗi lần
 * kéo xong sẽ vô tình thu nhỏ hộp.
 */
function BoxHeader({
  box,
  onDragStart,
  onToggle,
  onClose,
}: {
  box: Box;
  onDragStart: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("dock");
  const title = box.kind === "ai" ? t("aiTitle") : box.kind === "picker" ? t("pickConversation") : null;

  return (
    <div onMouseDown={onDragStart} className="flex flex-none cursor-grab items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 active:cursor-grabbing">
      {box.kind === "chat" && box.conversationId ? (
        <ChatBoxTitle conversationId={box.conversationId} />
      ) : (
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</p>
      )}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        aria-label={t("minimize")}
        className="flex-none rounded p-1 text-muted-foreground hover:bg-surface"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClose}
        aria-label={t("close")}
        className="flex-none rounded p-1 text-muted-foreground hover:bg-surface"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Cache dữ liệu hội thoại theo id: tiêu đề (ở header) và thân hộp là hai component tách rời
// nhưng cùng cần một payload. Không cache thì mỗi hộp gọi loadChatPanel hai lần.
const panelCache = new Map<string, Promise<ConversationView | null>>();
function getPanel(id: string) {
  let p = panelCache.get(id);
  if (!p) {
    p = loadChatPanel(id);
    panelCache.set(id, p);
  }
  return p;
}

function useConversation(id: string) {
  const [view, setView] = useState<ConversationView | null | "error">(null);
  useEffect(() => {
    let alive = true;
    getPanel(id).then((v) => alive && setView(v ?? "error"));
    return () => {
      alive = false;
    };
  }, [id]);
  return view;
}

function ChatBoxTitle({ conversationId }: { conversationId: string }) {
  const t = useTranslations("dock");
  const tChat = useTranslations("chat");
  const view = useConversation(conversationId);
  const loaded = view !== null && view !== "error" ? view : null;

  return (
    <>
      {loaded?.isGroup && loaded.avatarKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh upload qua route có auth (xem groupAvatarUrl)
        <img src={groupAvatarUrl(loaded.id, loaded.avatarKey) ?? undefined} alt="" className="h-7 w-7 flex-none rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
          {loaded?.isGroup ? <Users className="h-4 w-4" /> : initials(loaded?.title ?? "?")}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{loaded?.title ?? t("loading")}</p>
        {loaded && (
          <p className="truncate text-xs text-muted-foreground">
            {loaded.isGroup ? tChat("membersCount", { count: loaded.memberCount }) : (loaded.otherTitle ?? "")}
          </p>
        )}
      </div>
    </>
  );
}

/** Thân hộp chat — dùng lại ĐÚNG component của trang /chat/[id]. */
function ChatBoxBody({ conversationId }: { conversationId: string }) {
  const t = useTranslations("dock");
  const view = useConversation(conversationId);

  if (view === null) return <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>;
  if (view === "error") return <p className="p-4 text-sm text-muted-foreground">{t("chatUnavailable")}</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatConversation
        conversationId={view.id}
        initial={view.initial}
        meId={view.meId}
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

/** Danh sách hội thoại rút gọn để chọn mở hộp nào. */
function ConversationPicker({ onPick }: { onPick: (id: string) => void }) {
  const t = useTranslations("dock");
  const [list, setList] = useState<ChatListItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadChatDock().then((d) => alive && setList(d.list));
    return () => {
      alive = false;
    };
  }, []);

  if (!list) return <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>;
  if (list.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("noConversation")}</p>;

  return (
    <div className="h-full overflow-y-auto">
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2"
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
            {c.type === "GROUP" ? <Users className="h-4 w-4" /> : initials(c.title)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{c.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{c.lastBody ?? ""}</span>
          </span>
          {c.unread > 0 && <span className="flex-none rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
        </button>
      ))}
    </div>
  );
}

/** Panel AI — đúng 6 ToolCard của trang /ai, chọn từng công cụ cho vừa khung hẹp. */
function AiPanel() {
  const t = useTranslations("dock");
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAiPanel>> | null>(null);
  const [tool, setTool] = useState<string>("");

  useEffect(() => {
    let alive = true;
    loadAiPanel().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>;
  const { vis, options, configured, webSearchOn } = data;

  const tools = [
    { key: "brainstorm", on: vis.canBrainstorm, node: <BrainstormTool projects={options} /> },
    { key: "content", on: vis.canContent, node: <ContentWriterTool projects={options} /> },
    { key: "canva", on: vis.canCanva, node: <CanvaBriefTool projects={options} /> },
    { key: "costsheet", on: vis.canCostSheet, node: <CostSheetTool projects={options} /> },
    { key: "board", on: vis.canBoardReport, node: <BoardReportTool /> },
    { key: "trend", on: vis.canTrend, node: <TrendTool webSearchOn={webSearchOn} /> },
  ].filter((x) => x.on);

  if (tools.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("noAiTools")}</p>;
  const active = tools.find((x) => x.key === tool) ?? tools[0];

  return (
    <div className={cn("flex h-full min-h-0 flex-col")}>
      <div className="flex-none border-b border-border p-2">
        <select
          value={active.key}
          onChange={(e) => setTool(e.target.value)}
          aria-label={t("aiPickTool")}
          className="h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm"
        >
          {tools.map((x) => (
            <option key={x.key} value={x.key}>
              {t(`aiTool_${x.key}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!configured && <NotConfiguredBanner />}
        {active.node}
      </div>
    </div>
  );
}
