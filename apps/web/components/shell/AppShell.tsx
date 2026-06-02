"use client";

/**
 * The authenticated chrome of the app.
 *
 *   ┌───────────────┬─────────────────────────────┐
 *   │               │                              │
 *   │  AppSidebar   │   { children }   (canvas)    │
 *   │  - threads    │                              │
 *   │  - user menu  │                              │
 *   │               │                              │
 *   └───────────────┴─────────────────────────────┘
 *
 * Used by every authenticated page. The middle canvas changes per route
 * (chat, profile, insights, legal, crisis-resources, onboarding); the
 * sidebar persists.
 *
 * On mobile the sidebar is hidden by default and slides in as a drawer
 * controlled via the AppShellContext (`useAppShell`).
 */

import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ThreadsDrawer } from "@/components/threads/ThreadsDrawer";
import { LogoMark } from "@/components/brand/Logo";
import { AppSidebar } from "./AppSidebar";

interface AppShellCtx {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const Ctx = createContext<AppShellCtx | null>(null);

export function useAppShell(): AppShellCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Fallback noop so components rendered outside AppShell (e.g. login)
    // don't crash if they happen to import useAppShell.
    return {
      drawerOpen: false,
      openDrawer: () => {},
      closeDrawer: () => {},
      toggleDrawer: () => {},
    };
  }
  return v;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const value = useMemo<AppShellCtx>(
    () => ({
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      toggleDrawer: () => setDrawerOpen((v) => !v),
    }),
    [drawerOpen],
  );

  return (
    <Ctx.Provider value={value}>
      <div className="h-screen-dvh flex w-full bg-cream">
        {/* Desktop sidebar — always visible at md+ */}
        <aside className="hidden md:flex md:flex-col md:w-72 lg:w-80 border-r border-cream-edge bg-white px-3 py-3 flex-shrink-0">
          <AppSidebar />
        </aside>

        {/* Mobile drawer — slides over the canvas */}
        <ThreadsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        >
          <AppSidebar />
        </ThreadsDrawer>

        {/* Middle canvas — per-route */}
        <main className="flex-1 flex flex-col min-w-0 h-screen-dvh">
          {/* Mobile-only top bar with hamburger. The chat header (rendered
              by ChatScreen) has its own drawer button; this is the fallback
              for non-chat routes like /profile, /insights, /legal/*. */}
          <MobileTopBar />
          {children}
        </main>
      </div>
    </Ctx.Provider>
  );
}

/**
 * Thin mobile-only top bar with the hamburger button. Only shown on
 * non-chat routes — the chat header (Header.tsx) already renders its
 * own hamburger inside the canvas. Detected by pathname so we don't
 * stack two hamburgers on /chat.
 */
function MobileTopBar() {
  const { openDrawer } = useAppShell();
  const pathname = usePathname();
  // ChatScreen renders its own Header (with hamburger) at the top of
  // the canvas — don't duplicate.
  if (pathname?.startsWith("/chat")) return null;
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-cream-edge bg-white">
      <button
        onClick={openDrawer}
        aria-label="Open threads"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-sage hover:bg-sage/5 transition"
      >
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
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <LogoMark size={24} />
      <div className="w-9" />
    </div>
  );
}
