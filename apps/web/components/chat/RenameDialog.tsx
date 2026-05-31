"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

export function RenameDialog({
  open,
  initialTitle,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  initialTitle: string;
  onCancel: () => void;
  onSubmit: (newTitle: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialTitle);
      setBusy(false);
      // Focus + select after the input mounts
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, initialTitle]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = value.trim();
    if (!t || t === initialTitle || busy) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(t.slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onCancel}>
      <form onSubmit={submit}>
        <h2 className="font-serif text-lg text-sage mb-1">
          Rename conversation
        </h2>
        <p className="text-mute text-xs mb-4">Give this thread a clearer name.</p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={200}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-cream-edge rounded-lg bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-sage"
          disabled={busy}
        />
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg text-sage hover:bg-cream-warm transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-sage text-cream hover:bg-sage-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
