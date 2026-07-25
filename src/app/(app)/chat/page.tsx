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
