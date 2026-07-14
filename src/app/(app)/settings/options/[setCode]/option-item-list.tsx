"use client";

import { useRef, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { OptionItemRow } from "./option-item-row";
import { reorderOptionItems } from "./actions";

type Item = { id: string; code: string; labelVi: string; labelEn: string | null; isActive: boolean };

/**
 * Danh sách danh mục kéo-thả đổi thứ tự (HTML5 DnD, không cần thư viện) — lưu ngay khi thả.
 * Cha (page.tsx) truyền `key` theo thứ tự id hiện tại của `items` để component tự remount và
 * đồng bộ lại state khi server xác nhận thứ tự mới — tránh setState trong effect.
 */
export function OptionItemList({ setCode, items }: { setCode: string; items: Item[] }) {
  const [order, setOrder] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const t = useTranslations("settings.options");
  const dragIndex = useRef<number | null>(null);

  function handleDrop(dropIndex: number) {
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    setDragId(null);
    if (fromIndex === null || fromIndex === dropIndex) return;

    const next = [...order];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    setOrder(next);
    startTransition(() => {
      reorderOptionItems(setCode, next.map((i) => i.id));
    });
  }

  return (
    <div className="space-y-2">
      {order.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => {
            dragIndex.current = index;
            setDragId(item.id);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
          onDragEnd={() => {
            dragIndex.current = null;
            setDragId(null);
          }}
          className={cn("flex items-start gap-2", dragId === item.id && "opacity-50")}
        >
          <span
            className="mt-3 cursor-grab text-muted-foreground active:cursor-grabbing"
            title={t("dragHint")}
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <OptionItemRow item={item} setCode={setCode} />
          </div>
        </div>
      ))}
    </div>
  );
}
