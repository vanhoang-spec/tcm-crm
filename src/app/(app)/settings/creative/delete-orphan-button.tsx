"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSalaryBudget } from "./actions";

export function DeleteOrphanButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void deleteSalaryBudget(id))}
      className="inline-flex items-center gap-1 text-warning hover:text-danger disabled:opacity-50"
      aria-label={label}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
