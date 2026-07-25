"use client";

import { useState, useTransition } from "react";
import { copyFromPreviousPeriod } from "../../settings/creative/actions";

export function CopyPreviousPeriodButton({ fromPeriod, toPeriod, label }: { fromPeriod: string; toPeriod: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await copyFromPreviousPeriod(fromPeriod, toPeriod);
            setError(res.error ?? null);
          })
        }
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
