"use client";

/**
 * Sidebar footer — user identity + a popover menu that surfaces every
 * non-chat destination in the app: Profile, Insights, Crisis resources,
 * Disclaimer, Privacy, Terms, and Sign out. Clicking the row toggles
 * the menu; clicking the avatar/name area directly is a shortcut to
 * /profile.
 *
 * Everything stays in-shell (no target="_blank") because the sidebar
 * persists across all of these routes, so the user never loses their
 * place.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/lib/api/client";

interface MenuItem {
  label: string;
  href?: Route;
  icon: React.ReactNode;
  tone?: "default" | "crisis" | "destructive";
  onClick?: () => void | Promise<void>;
}

export function UserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then((p) => {
        if (cancelled) return;
        setDisplayName(p.display_name);
        setEmail(p.email);
      })
      .catch(() => {
        /* best effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = (displayName || email || "?").charAt(0).toUpperCase();
  const primary = displayName || email.split("@")[0] || "You";

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const items: MenuItem[] = [
    { label: "Profile", href: "/profile" as Route, icon: <IconUser /> },
    { label: "Your insights", href: "/insights" as Route, icon: <IconChart /> },
    {
      label: "Crisis resources",
      href: "/crisis-resources" as Route,
      icon: <IconPhone />,
      tone: "crisis",
    },
    {
      label: "Disclaimer",
      href: "/legal/disclaimer" as Route,
      icon: <IconAlert />,
    },
    { label: "Privacy", href: "/legal/privacy" as Route, icon: <IconShield /> },
    { label: "Terms", href: "/legal/terms" as Route, icon: <IconDoc /> },
    {
      label: "Sign out",
      icon: <IconExit />,
      tone: "destructive",
      onClick: handleSignOut,
    },
  ];

  return (
    <div ref={rootRef} className="border-t border-cream-edge pt-2 mt-2 relative">
      {/* Popover */}
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-cream-edge rounded-xl shadow-lg overflow-hidden z-50"
        >
          {items.map((it, i) => {
            const content = (
              <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-sage/5 transition cursor-pointer">
                <span
                  className={
                    it.tone === "crisis"
                      ? "text-crisis"
                      : it.tone === "destructive"
                        ? "text-mute"
                        : "text-sage"
                  }
                >
                  {it.icon}
                </span>
                <span
                  className={
                    it.tone === "crisis"
                      ? "text-crisis"
                      : it.tone === "destructive"
                        ? "text-mute"
                        : "text-ink"
                  }
                >
                  {it.label}
                </span>
              </div>
            );
            if (it.href) {
              return (
                <button
                  key={i}
                  onClick={() => {
                    router.push(it.href!);
                    setOpen(false);
                  }}
                  className="w-full text-left"
                  role="menuitem"
                >
                  {content}
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={async () => {
                  setOpen(false);
                  await it.onClick?.();
                }}
                className="w-full text-left"
                role="menuitem"
              >
                {content}
              </button>
            );
          })}
        </div>
      )}

      {/* User row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-sage/5 transition min-w-0 group"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
      >
        <div className="w-8 h-8 rounded-full bg-sage text-cream flex items-center justify-center text-sm font-medium flex-shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-sm text-ink truncate">{primary}</div>
          <div className="text-[11px] text-mute truncate">{email}</div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-mute transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
  );
}

// ── icons ────────────────────────────────────────────────────────────────

function IconUser() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg
      width="16"
      height="16"
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
function IconAlert() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}
function IconExit() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
