"use client";

/**
 * Daily mood check-in.
 *
 * Shown above the chat empty state when the user opens the app on a
 * day they haven't checked in yet. Five-point emoji scale; one tap to
 * submit. The score is persisted server-side (one per user per day) so
 * the Companion can adjust tone before the first turn.
 *
 * If the user has already checked in today, the widget renders as a
 * compact pill showing their score so they can update it without
 * dominating the empty state.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { MoodOut } from "@/lib/api/types";

interface Option {
  score: number;
  emoji: string;
  label: string;
}

const OPTIONS: Option[] = [
  { score: 1, emoji: "😣", label: "Really rough" },
  { score: 2, emoji: "😟", label: "Low" },
  { score: 3, emoji: "😐", label: "Middling" },
  { score: 4, emoji: "🙂", label: "Okay" },
  { score: 5, emoji: "😊", label: "Good" },
];

export function MoodCheckin({
  onSubmitted,
}: {
  onSubmitted?: (m: MoodOut) => void;
}) {
  const [today, setToday] = useState<MoodOut | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMoodToday()
      .then((m) => {
        if (!cancelled) setToday(m);
      })
      .catch(() => {
        if (!cancelled) setToday(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(score: number) {
    setSubmitting(true);
    try {
      const m = await api.upsertMood(score);
      setToday(m);
      onSubmitted?.(m);
    } catch {
      // swallow — the widget shouldn't block the chat
    } finally {
      setSubmitting(false);
    }
  }

  // Loading state — render nothing rather than flash.
  if (today === undefined) return null;

  // Already checked in today — compact pill.
  if (today) {
    const opt = OPTIONS.find((o) => o.score === today.score);
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-mute mb-6">
        <span>Today you&apos;re feeling</span>
        <span className="text-base">{opt?.emoji ?? "·"}</span>
        <span className="text-ink">{opt?.label.toLowerCase() ?? today.score}</span>
        <span className="text-mute">·</span>
        <button
          onClick={() => setToday(null)}
          className="text-sage hover:underline"
        >
          change
        </button>
      </div>
    );
  }

  // Not yet — full widget.
  return (
    <div className="bg-white border border-cream-edge rounded-2xl p-5 md:p-6 mb-6 shadow-sm max-w-md mx-auto">
      <h3 className="font-serif text-lg text-sage text-center mb-1">
        How&apos;s today feeling?
      </h3>
      <p className="text-xs text-mute text-center mb-4">
        One tap. The Companion will read this before the first reply.
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.score}
            onClick={() => pick(o.score)}
            disabled={submitting}
            aria-label={o.label}
            className="flex flex-col items-center gap-1 py-3 rounded-xl hover:bg-sage/5 transition active:scale-95 disabled:opacity-50"
          >
            <span className="text-2xl">{o.emoji}</span>
            <span className="text-[10px] text-mute leading-tight text-center">
              {o.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
