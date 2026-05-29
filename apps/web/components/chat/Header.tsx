"use client";

import { cn } from "@/lib/cn";

export function Header({
  title,
  onOpenDrawer,
  onCallClick,
  callDisabled = true,
}: {
  title: string;
  onOpenDrawer: () => void;
  onCallClick: () => void;
  callDisabled?: boolean;
}) {
  return (
    <header className="flex items-center gap-2 px-3 md:px-6 py-2 md:py-3 border-b border-cream-edge bg-cream">
      <button
        onClick={onOpenDrawer}
        className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-sage hover:bg-cream-warm"
        aria-label="Open conversations"
      >
        ☰
      </button>
      <h1 className="flex-1 text-center md:text-left font-serif text-base md:text-lg text-sage truncate">
        {title}
      </h1>
      <button
        onClick={onCallClick}
        disabled={callDisabled}
        title={callDisabled ? "Voice coming soon" : "Start voice call"}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition",
          callDisabled
            ? "bg-cream-warm text-mute cursor-not-allowed"
            : "bg-sage text-cream hover:bg-sage-dark",
        )}
        aria-label="Voice call"
      >
        📞
      </button>
    </header>
  );
}
