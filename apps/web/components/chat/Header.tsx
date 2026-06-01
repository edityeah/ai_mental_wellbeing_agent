"use client";

import { cn } from "@/lib/cn";

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function PhoneIcon() {
  // Lucide-style phone, clean stroke that reads on any background
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function Header({
  title,
  onOpenDrawer,
  onCallClick,
  callDisabled = false,
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
        className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-sage hover:bg-cream-warm transition"
        aria-label="Open conversations"
      >
        <MenuIcon />
      </button>
      <h1 className="flex-1 text-center md:text-left font-serif text-base md:text-lg text-sage truncate">
        {title}
      </h1>
      <button
        onClick={onCallClick}
        disabled={callDisabled}
        title={
          callDisabled
            ? "Voice limit reached — comes back tomorrow."
            : "Start voice call"
        }
        aria-label="Voice call"
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center transition shadow-sm",
          callDisabled
            ? "bg-cream-warm text-mute cursor-not-allowed"
            : "bg-sage text-cream hover:bg-sage-dark hover:shadow-md active:scale-95",
        )}
      >
        <PhoneIcon />
      </button>
    </header>
  );
}
