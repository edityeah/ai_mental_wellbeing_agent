"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

export function ConfirmDeleteDialog({
  open,
  title,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? () => {} : onCancel}>
      <h2 className="font-serif text-lg text-sage mb-2">Let this go?</h2>
      <p className="text-sm text-ink leading-relaxed mb-1">
        You&apos;re about to delete{" "}
        <span className="font-medium">&ldquo;{title}&rdquo;</span>.
      </p>
      <p className="text-sm text-sage-light leading-relaxed">
        Every message in this thread will be removed. The Companion won&apos;t
        remember it. There&apos;s no way to bring it back.
      </p>
      <div className="flex justify-end gap-2 mt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-lg text-sage hover:bg-cream-warm transition"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-lg bg-crisis text-cream hover:opacity-90 transition disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Dialog>
  );
}
