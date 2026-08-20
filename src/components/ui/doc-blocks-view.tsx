import type { AiDoc, DocBlock } from "@/lib/doc-blocks";

/**
 * Hiển thị tài liệu có cấu trúc do AI sinh ra.
 *
 * ⚠ Render bằng JSX text node — React tự escape, KHÔNG dùng `dangerouslySetInnerHTML`. Nội dung này
 * do model sinh ra nên phải coi như dữ liệu người ngoài nhập vào (cùng nguyên tắc đã áp cho khối
 * nội dung bài học ở Kho kiến thức: repo cố ý không có bộ render markdown/HTML nào).
 *
 * Là SERVER COMPONENT (không `"use client"`) — chỉ hiển thị, không state, nên không tốn byte JS nào.
 * Dùng lại được ở cả trang in.
 */

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "mt-5 text-base font-bold text-foreground first:mt-0",
  2: "mt-4 text-sm font-bold text-foreground first:mt-0",
  3: "mt-3 text-sm font-semibold text-foreground first:mt-0",
};

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "heading": {
      const cls = HEADING_CLASS[block.level];
      if (block.level === 1) return <h3 className={cls}>{block.text}</h3>;
      if (block.level === 2) return <h4 className={cls}>{block.text}</h4>;
      return <h5 className={cls}>{block.text}</h5>;
    }
    case "paragraph":
      return <p className="mt-2 text-sm leading-relaxed text-foreground">{block.text}</p>;
    case "bullets":
      return (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "numbered":
      return (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );
    case "terms":
      return (
        <dl className="mt-2 space-y-1.5 text-sm leading-relaxed">
          {block.items.map((it, i) => (
            <div key={i}>
              <dt className="inline font-semibold text-foreground">{it.term}: </dt>
              <dd className="inline text-foreground">{it.definition}</dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        // bảng rộng cuộn TRONG khung của nó — thân trang không bao giờ cuộn ngang (quy ước UI §4.4)
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-xs">
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="border border-border bg-surface-2 px-2 py-1.5 text-left font-semibold text-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="border border-border px-2 py-1.5 align-top text-foreground">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function DocBlocksView({ doc, showTitle = true }: { doc: AiDoc; showTitle?: boolean }) {
  return (
    <article>
      {showTitle && <h2 className="text-base font-bold text-foreground">{doc.title}</h2>}
      {doc.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </article>
  );
}
