"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  LESSON_BLOCK_TYPES,
  MAX_BLOCKS_PER_LESSON,
  MAX_ITEMS_PER_BLOCK,
  type LessonBlock,
  type LessonBlockType,
} from "@/lib/client-kb";
import { updateLesson, type KbFormState } from "./actions";

const input =
  "rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** Mỗi dòng cần khoá ổn định riêng — index làm khoá sẽ nhảy nội dung khi xoá/di chuyển block. */
type Row = { key: string; block: LessonBlock };

/**
 * Dọn trước khi gửi: Zod bắt mọi trường `min(1)` sau trim, mà chính trình soạn thảo lại tạo khối
 * RỖNG và ô rỗng. Không dọn thì một ô để trống ở khối thứ 12 làm hỏng cả lần lưu, người dùng chỉ
 * nhận đúng một câu "Nội dung bài không hợp lệ" rồi phải tự dò 40 khối. Ô chưa điền = chưa phải
 * nội dung, bỏ đi đúng ý người dùng; khối nào rỗng sạch thì bỏ luôn cả khối.
 */
function pruneBlocks(blocks: LessonBlock[]): LessonBlock[] {
  const out: LessonBlock[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph") {
      if (b.text.trim()) out.push(b);
    } else if (b.type === "bullets") {
      const items = b.items.filter((x) => x.trim());
      if (items.length) out.push({ type: "bullets", items });
    } else {
      const items = b.items.filter((x) => x.term.trim() && x.definition.trim());
      if (items.length) out.push({ type: "terms", items });
    }
  }
  return out;
}

function emptyBlock(type: LessonBlockType): LessonBlock {
  switch (type) {
    case "heading":
      return { type: "heading", text: "" };
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "bullets":
      return { type: "bullets", items: [""] };
    case "terms":
      return { type: "terms", items: [{ term: "", definition: "" }] };
  }
}

/**
 * Trình soạn bài dạng BLOCK — không phải rich text. Người dùng chọn loại khối (tiêu đề / đoạn văn
 * / gạch đầu dòng / thuật ngữ), nội dung luôn là văn bản thuần nên không có đường nào nhét HTML.
 * Server validate lại toàn bộ bằng Zod trước khi ghi.
 */
export function LessonEditor({
  clientId,
  lessonId,
  title,
  blocks,
}: {
  clientId: string;
  lessonId: string;
  title: string;
  blocks: LessonBlock[];
}) {
  const t = useTranslations("clients.kb");
  const [state, formAction, pending] = useActionState<KbFormState, FormData>(updateLesson.bind(null, clientId, lessonId), {});
  const [rows, setRows] = useState<Row[]>(blocks.map((b, i) => ({ key: `b${i}`, block: b })));
  // Ô tiêu đề phải là CONTROLLED: React 19 gọi requestFormReset sau mỗi lần chạy form action, kể
  // cả khi action trả lỗi — để `defaultValue` thì tiêu đề vừa gõ bị trả về giá trị cũ trong khi
  // các khối (nằm trong state) vẫn còn, người dùng không hiểu vì sao mất đúng một ô. Đây là chốt
  // A5 của repo ("giữ dữ liệu form khi validation lỗi") ở dạng rẻ nhất cho form một ô.
  const [titleValue, setTitleValue] = useState(title);
  // Bộ đếm khoá nằm NGOÀI vòng render: bấm thêm nhiều khối trong cùng một tick mà đọc state thì
  // cả loạt nhận cùng một số, sinh khoá React trùng nhau và các khối sau bị nuốt mất.
  const nextKey = useRef(blocks.length);

  const blockLabel = (type: LessonBlockType) => {
    switch (type) {
      case "heading":
        return t("blockHeading");
      case "paragraph":
        return t("blockParagraph");
      case "bullets":
        return t("blockBullets");
      case "terms":
        return t("blockTerms");
    }
  };

  const patch = (key: string, block: LessonBlock) => setRows((r) => r.map((x) => (x.key === key ? { ...x, block } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((r) => {
      const j = i + dir;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = (type: LessonBlockType) => {
    if (rows.length >= MAX_BLOCKS_PER_LESSON) return;
    setRows((r) => [...r, { key: `b${nextKey.current++}`, block: emptyBlock(type) }]);
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="blocksJson" value={JSON.stringify(pruneBlocks(rows.map((r) => r.block)))} />

      <label className="block space-y-1 text-xs text-muted-foreground">
        {t("lessonTitle")}
        <input
          name="title"
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          required
          className={input + " w-full text-base font-semibold"}
        />
      </label>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{blockLabel(r.block.type)}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} aria-label={t("moveUp")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} aria-label={t("moveDown")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                  aria-label={t("removeBlock")}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-2">
              {r.block.type === "heading" && (
                <input
                  value={r.block.text}
                  onChange={(e) => patch(r.key, { type: "heading", text: e.target.value })}
                  placeholder={t("blockHeadingPlaceholder")}
                  className={input + " w-full font-semibold"}
                />
              )}
              {r.block.type === "paragraph" && (
                <textarea
                  value={r.block.text}
                  onChange={(e) => patch(r.key, { type: "paragraph", text: e.target.value })}
                  rows={4}
                  placeholder={t("blockParagraphPlaceholder")}
                  className={input + " w-full"}
                />
              )}
              {r.block.type === "bullets" && (
                <BulletsEditor
                  items={r.block.items}
                  onChange={(items) => patch(r.key, { type: "bullets", items })}
                  addLabel={t("addBullet")}
                  removeLabel={t("removeBlock")}
                  placeholder={t("blockBulletPlaceholder")}
                />
              )}
              {r.block.type === "terms" && (
                <TermsEditor
                  items={r.block.items}
                  onChange={(items) => patch(r.key, { type: "terms", items })}
                  addLabel={t("addTerm")}
                  removeLabel={t("removeBlock")}
                  termPlaceholder={t("blockTermPlaceholder")}
                  defPlaceholder={t("blockDefinitionPlaceholder")}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("addBlock")}</span>
        {LESSON_BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => add(type)}
            disabled={rows.length >= MAX_BLOCKS_PER_LESSON}
            className="h-9 rounded-lg border border-dashed border-border-strong px-3 text-xs font-medium text-brand-600 hover:bg-surface-2 disabled:opacity-50"
          >
            <Plus className="mr-1 inline h-3 w-3" />
            {blockLabel(type)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:h-10"
        >
          {pending ? "..." : t("saveLessonBtn")}
        </button>
        {state.error && <span className="text-xs font-medium text-danger">{state.error}</span>}
        {state.success && <span className="text-xs font-medium text-success">{t("saved")}</span>}
      </div>
    </form>
  );
}

function BulletsEditor({
  items,
  onChange,
  addLabel,
  removeLabel,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  removeLabel: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={it}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={placeholder}
            className={input + " min-w-0 flex-1"}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={removeLabel}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        disabled={items.length >= MAX_ITEMS_PER_BLOCK}
        className="text-xs font-medium text-brand-600 disabled:opacity-50"
      >
        <Plus className="mr-1 inline h-3 w-3" />
        {addLabel}
      </button>
    </div>
  );
}

function TermsEditor({
  items,
  onChange,
  addLabel,
  removeLabel,
  termPlaceholder,
  defPlaceholder,
}: {
  items: { term: string; definition: string }[];
  onChange: (items: { term: string; definition: string }[]) => void;
  addLabel: string;
  removeLabel: string;
  termPlaceholder: string;
  defPlaceholder: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <input
            value={it.term}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))}
            placeholder={termPlaceholder}
            className={input + " w-40 shrink-0 font-medium"}
          />
          <textarea
            value={it.definition}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, definition: e.target.value } : x)))}
            rows={2}
            placeholder={defPlaceholder}
            className={input + " min-w-0 flex-1"}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={removeLabel}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { term: "", definition: "" }])}
        disabled={items.length >= MAX_ITEMS_PER_BLOCK}
        className="text-xs font-medium text-brand-600 disabled:opacity-50"
      >
        <Plus className="mr-1 inline h-3 w-3" />
        {addLabel}
      </button>
    </div>
  );
}
