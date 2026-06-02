"use client";

import { cn } from "@/lib/cn";

/**
 * Mobile drawer for the sidebar. Slides in from the left over the
 * canvas when the hamburger is tapped on small screens.
 *
 * NOTE: This component is mobile-only now. The desktop persistent
 * sidebar is rendered by AppShell.tsx directly. Earlier this component
 * ALSO rendered a desktop `<aside>` which caused the sidebar to render
 * twice (once by AppShell, once here) → two columns of nav. Fixed.
 */
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
          "absolute inset-y-0 left-0 w-[78%] max-w-[320px] bg-cream-warm p-3 transition-transform overflow-y-auto flex flex-col",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {children}
      </aside>
    </div>
  );
}
