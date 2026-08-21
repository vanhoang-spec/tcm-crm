import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { formatDate, pickLabel } from "@/lib/utils";
import { MKT_CHANNELS, isMktChannel } from "@/lib/mkt";
import type { Locale } from "@/i18n/locales";
import { VariantPanel, type VariantView } from "./variant-panel";
import { DeletePostButton, DeleteImageButton } from "./post-actions";
import { DesignBriefPanel } from "./design-brief-panel";

export default async function MktPostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("mkt.view");
  const { id } = await params;

  const [t, locale, canManage, canReview, canGenerate] = await Promise.all([
    getTranslations("mkt"),
    getLocale() as Promise<Locale>,
    hasPermission("mkt.post.manage"),
    hasPermission("mkt.review"),
    hasPermission("mkt.generate"),
  ]);

  const post = await prisma.mktPost.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      keyPoints: true,
      driveUrl: true,
      designBrief: true,
      createdAt: true,
      contentType: { select: { labelVi: true, labelEn: true } },
      project: { select: { code: true, name: true, client: { select: { name: true } } } },
      createdBy: { select: { fullName: true } },
      images: { orderBy: { sort: "asc" }, select: { id: true, fileName: true } },
      variants: {
        select: {
          id: true,
          channel: true,
          status: true,
          aiDraft: true,
          finalContent: true,
          postedAt: true,
          postUrl: true,
          postedBy: { select: { fullName: true } },
        },
      },
    },
  });
  if (!post) notFound();

  const anyPosted = post.variants.some((v) => v.status === "POSTED");
  // Giữ thứ tự LinkedIn → Fanpage cho mọi bài, không theo thứ tự bản ghi trong DB.
  const variants: VariantView[] = MKT_CHANNELS.flatMap((ch) => {
    const v = post.variants.find((x) => x.channel === ch);
    if (!v || !isMktChannel(v.channel)) return [];
    return [
      {
        id: v.id,
        channel: v.channel,
        status: v.status,
        aiDraft: v.aiDraft,
        finalContent: v.finalContent,
        postedAt: v.postedAt,
        postUrl: v.postUrl,
        postedByName: v.postedBy?.fullName ?? null,
      },
    ];
  });

  return (
    <div className="space-y-4">
      <Link href="/mkt" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("navPosts")}
      </Link>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{post.title}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {post.contentType ? pickLabel(post.contentType, locale) : "—"}
              {post.project && ` · ${post.project.code} — ${post.project.name}`}
              {post.project?.client && ` · ${post.project.client.name}`}
              {` · ${formatDate(post.createdAt)}`}
              {post.createdBy && ` · ${post.createdBy.fullName}`}
            </p>
          </div>
          {canManage && !anyPosted && <DeletePostButton postId={post.id} />}
        </div>

        <h3 className="mt-3 text-[11px] font-medium text-muted-foreground">{t("keyPointsTitle")}</h3>
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-foreground">
          {post.keyPoints}
        </p>

        {post.driveUrl && (
          <a
            href={post.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("formDriveUrl")}
          </a>
        )}

        {post.images.length > 0 && (
          <>
            <h3 className="mt-3 text-[11px] font-medium text-muted-foreground">{t("imagesTitle")}</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {post.images.map((img) => (
                <div key={img.id} className="group relative">
                  {/* Ảnh nằm ngoài public/ nên phải đi qua route có auth. Dùng <img> thuần chứ không
                      next/image: route trả `private, no-store`, tối ưu hoá lại là vô nghĩa. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/mkt-image/${img.id}`}
                    alt={img.fileName}
                    title={img.fileName}
                    className="h-28 w-28 rounded-lg border border-border object-cover"
                  />
                  {canManage && <DeleteImageButton postId={post.id} imageId={img.id} />}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <DesignBriefPanel postId={post.id} brief={post.designBrief} canGenerate={canGenerate} aiConfigured={isAiConfigured()} />

      {variants.map((v) => (
        <VariantPanel
          key={v.id}
          postId={post.id}
          variant={v}
          canReview={canReview}
          canGenerate={canGenerate}
          aiConfigured={isAiConfigured()}
        />
      ))}
    </div>
  );
}
