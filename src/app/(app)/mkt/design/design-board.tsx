"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { HandMetal, Upload, RotateCcw, XCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { parseChannelsCsv } from "@/lib/mkt";
import { acceptDesignOrder, deliverDesignOrder, releaseDesignOrder, cancelDesignOrder, type DesignState } from "./actions";

export type DesignOrderView = {
  id: string;
  postId: string;
  postTitle: string;
  brief: string;
  channels: string;
  dueDate: string | null;
  overdue: boolean;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  deliverableLinkUrl: string | null;
  designerNote: string | null;
  imageCount: number;
};

const input = "h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
const btnPrimary = "inline-flex h-8 items-center gap-1 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50";

const TONE: Record<string, "success" | "warning" | "brand" | "neutral"> = {
  NEW: "warning",
  IN_PROGRESS: "brand",
  DELIVERED: "success",
  CANCELED: "neutral",
};

const ERR: Record<string, string> = { TAKEN: "errTaken", NOT_YOURS: "errNotYours", BAD_URL: "errBadUrl", WRONG_STATE: "errWrongState", NOT_FOUND: "errNotFound" };

function DeliverForm({ order }: { order: DesignOrderView }) {
  const t = useTranslations("mkt.design");
  const [state, action, pending] = useActionState<DesignState, FormData>(deliverDesignOrder.bind(null, order.id), {});
  const [link, setLink] = useState(order.deliverableLinkUrl ?? "");
  const [note, setNote] = useState(order.designerNote ?? "");
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
        {t("fLink")}
        <input name="deliverableLinkUrl" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" className={input + " mt-1"} required />
      </label>
      <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
        {t("fNote")}
        <input name="designerNote" value={note} onChange={(e) => setNote(e.target.value)} className={input + " mt-1"} />
      </label>
      <button type="submit" disabled={pending} className={btnPrimary}>
        <Upload className="h-3.5 w-3.5" /> {pending ? "…" : t("deliverBtn")}
      </button>
      {state.error && <span className="text-[11px] text-danger">{t(ERR[state.error] ?? "errGeneric")}</span>}
    </form>
  );
}

function AcceptButton({ id }: { id: string }) {
  const t = useTranslations("mkt.design");
  const [state, action, pending] = useActionState<DesignState, FormData>(acceptDesignOrder.bind(null, id), {});
  return (
    <form action={action} className="inline">
      <button type="submit" disabled={pending} className={btnPrimary}>
        <HandMetal className="h-3.5 w-3.5" /> {pending ? "…" : t("acceptBtn")}
      </button>
      {state.error && <span className="ml-2 text-[11px] text-danger">{t(ERR[state.error] ?? "errGeneric")}</span>}
    </form>
  );
}

export function DesignBoard({ orders, meId, canReview }: { orders: DesignOrderView[]; meId: string | null; canReview: boolean }) {
  const t = useTranslations("mkt.design");
  if (orders.length === 0) return <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const mine = o.assigneeId === meId;
        const canDeliver = o.status !== "DELIVERED" && o.status !== "CANCELED" && (mine || canReview);
        return (
          <li key={o.id} className={"rounded-xl border bg-surface p-4 " + (o.overdue && o.status !== "DELIVERED" ? "border-danger/40" : "border-border")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/mkt/${o.postId}`} className="text-sm font-medium text-foreground hover:text-brand-600 hover:underline">
                  {o.postTitle}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {parseChannelsCsv(o.channels).map((c) => (
                    <span key={c} className="rounded border border-border px-1.5 py-0.5">
                      {c === "LINKEDIN" ? "LinkedIn 1200×627" : "Fanpage 1080×1080"}
                    </span>
                  ))}
                  {o.dueDate && <span className={o.overdue && o.status !== "DELIVERED" ? "font-medium text-danger" : ""}>· {t("due", { date: o.dueDate })}</span>}
                  {o.assigneeName && <span>· {t("assignedTo", { name: o.assigneeName })}</span>}
                  {o.imageCount > 0 && <span>· {t("hasImages", { n: o.imageCount })}</span>}
                </p>
              </div>
              <Badge tone={TONE[o.status] ?? "neutral"}>{t(`status${o.status}` as "statusNEW")}</Badge>
            </div>

            <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-foreground">{o.brief}</p>

            {o.deliverableLinkUrl && (
              <p className="mt-2 text-xs">
                <a href={o.deliverableLinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> {t("openFile")}
                </a>
                {o.designerNote && <span className="ml-2 text-muted-foreground">— {o.designerNote}</span>}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {o.status === "NEW" && <AcceptButton id={o.id} />}
              {(mine || canReview) && o.status === "IN_PROGRESS" && (
                <form action={releaseDesignOrder.bind(null, o.id)} className="inline">
                  <button type="submit" className={btn}>
                    <RotateCcw className="h-3.5 w-3.5" /> {t("releaseBtn")}
                  </button>
                </form>
              )}
              {canReview && o.status !== "DELIVERED" && o.status !== "CANCELED" && (
                <form
                  action={cancelDesignOrder.bind(null, o.id)}
                  onSubmit={(e) => {
                    if (!window.confirm(t("confirmCancel"))) e.preventDefault();
                  }}
                  className="inline"
                >
                  <button type="submit" className={btn + " text-danger"}>
                    <XCircle className="h-3.5 w-3.5" /> {t("cancelBtn")}
                  </button>
                </form>
              )}
            </div>

            {canDeliver && <DeliverForm order={o} />}
          </li>
        );
      })}
    </ul>
  );
}
