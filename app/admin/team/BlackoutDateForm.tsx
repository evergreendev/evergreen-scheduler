"use client";

import { useActionState } from "react";

export function BlackoutDateForm({
  addAction,
}: {
  addAction: (state: string, formData: FormData) => Promise<string>;
}) {
  const [message, action, pending] = useActionState(addAction, "");

  return (
    <form action={action} className="mt-5 grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-2 text-sm font-bold">
          Date to block
          <input name="date" type="date" required className="rounded-xl border border-[#d8c7a3] px-4 py-3 font-normal" />
        </label>
        <button disabled={pending} className="rounded-xl bg-[#12382b] px-5 py-3 font-bold text-white disabled:opacity-50">
          {pending ? "Adding…" : "Add blackout date"}
        </button>
      </div>
      <p role="status" className="text-sm font-medium">{message}</p>
    </form>
  );
}
