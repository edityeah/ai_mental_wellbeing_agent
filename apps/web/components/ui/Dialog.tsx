"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Soft, calm modal dialog. Click-outside or ESC dismisses.
 * Use for in-app confirmations and prompts instead of `window.confirm` etc.
 */
export function Dialog({
  open,
  onClose,
  children,
  size = "sm",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the dialog when opened
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onMouseDown={(e) => {
        // close only when the overlay itself is clicked, not children
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Soft sage overlay */}
      <div className="absolute inset-0 bg-sage-dark/40 backdrop-blur-sm" />

      {/* Card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "relative bg-cream border border-cream-edge rounded-2xl shadow-2xl outline-none p-6",
          size === "sm" && "w-full max-w-sm",
          size === "md" && "w-full max-w-md",
        )}
      >
        {children}
      </div>
    </div>
  );
}
