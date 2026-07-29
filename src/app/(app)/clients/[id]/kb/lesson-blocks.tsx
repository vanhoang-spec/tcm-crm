import type { LessonBlock } from "@/lib/client-kb";

/**
 * Render nội dung bài học từ BLOCK có cấu trúc.
 *
 * ⚠ Mọi văn bản đi qua JSX text node — React tự escape. TUYỆT ĐỐI không dùng
 * `dangerouslySetInnerHTML` ở đây: nội dung có thể do AI sinh (H3) hoặc PIC dán từ tài liệu
 * khách, tức là không đáng tin. Block lạ (dữ liệu cũ, phiên bản sau) thì bỏ qua, không làm vỡ trang.
 */
export function LessonBlocks({ blocks }: { blocks: LessonBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className="text-sm font-semibold text-foreground">
                {b.text}
              </h3>
            );
          case "paragraph":
            return (
              <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {b.text}
              </p>
            );
          case "bullets":
            return (
              <ul key={i} className="ml-5 list-disc space-y-1 text-sm text-foreground">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          case "terms":
            return (
              <dl key={i} className="divide-y divide-border rounded-lg border border-border">
                {b.items.map((it, j) => (
                  <div key={j} className="px-3 py-2">
                    <dt className="text-sm font-semibold text-foreground">{it.term}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{it.definition}</dd>
                  </div>
                ))}
              </dl>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
