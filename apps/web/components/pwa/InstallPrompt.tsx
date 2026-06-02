"use client";

import { useEffect, useState } from "react";

/**
 * Lightweight PWA install affordance. Listens for the browser's
 * `beforeinstallprompt` event (fires once per session on supported
 * browsers when the site meets installability criteria), stashes the
 * event, and surfaces a small banner the user can dismiss or accept.
 *
 * No effect on iOS — Safari doesn't fire the event; users add to home
 * screen via the share sheet. We do not nag iOS users; the empty state
 * mentions /insights and that's enough surface area for now.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "mwc-install-dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISSED_KEY)) {
      setDismissed(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred || dismissed) return null;

  const handleInstall = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-[360px] z-40 bg-sage text-cream rounded-2xl shadow-2xl p-4 flex items-center gap-3"
    >
      <div className="flex-1 text-sm leading-snug">
        Install Wellbeing on your phone — quicker to come back to.
      </div>
      <button
        onClick={handleInstall}
        className="bg-cream text-sage rounded-full px-3 py-1.5 text-xs font-medium hover:opacity-90"
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="text-cream/70 hover:text-cream"
      >
        ✕
      </button>
    </div>
  );
}
