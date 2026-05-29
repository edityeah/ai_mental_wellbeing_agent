"use client";

import { cn } from "@/lib/cn";

export function ThreadsDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-30 md:hidden transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div
          className="absolute inset-0 bg-sage-dark/40"
          onClick={onClose}
          aria-hidden
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-[78%] max-w-[320px] bg-cream-warm p-3 transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {children}
        </aside>
      </div>
      {/* Desktop persistent sidebar */}
      <aside className="hidden md:block w-[260px] shrink-0 bg-cream-warm border-r border-cream-edge p-3 h-screen-dvh">
        {children}
      </aside>
    </>
  );
}
