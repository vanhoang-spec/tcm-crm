"use client";

import { useActionState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  confirmAcceptanceDocs,
  confirmContractDone,
  markFinished,
  moveToLiquidation,
  type ProjectFormState,
} from "./actions";

export function AccountantConfirmContractDone({ projectId }: { projectId: string }) {
  const t = useTranslations("bidding.contract");
  const bound = confirmContractDone.bind(null, projectId);
  return (
    <form action={bound}>
      <button
        type="submit"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/40 px-3 text-xs font-medium text-success hover:bg-success/10"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("accountantConfirmDone")}
      </button>
    </form>
  );
}

export function AccountantConfirmAcceptanceDocs({ projectId }: { projectId: string }) {
  const t = useTranslations("bidding.contract");
  const bound = confirmAcceptanceDocs.bind(null, projectId);
  return (
    <form action={bound}>
      <button
        type="submit"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/40 px-3 text-xs font-medium text-success hover:bg-success/10"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("acceptanceDocsConfirmDone")}
      </button>
    </form>
  );
}

export function MoveToLiquidationButton({ projectId }: { projectId: string }) {
  const t = useTranslations("bidding.result");
  const bound = moveToLiquidation.bind(null, projectId);
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(bound, {});
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-warning px-4 text-sm font-medium text-white hover:bg-warning/90 disabled:opacity-50"
      >
        <ArrowRight className="h-4 w-4" />
        {t("moveToLiquidation")}
      </button>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function MarkFinishedButton({ projectId }: { projectId: string }) {
  const t = useTranslations("bidding.result");
  const bound = markFinished.bind(null, projectId);
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(bound, {});
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
      >
        <ArrowRight className="h-4 w-4" />
        {t("markFinished")}
      </button>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
