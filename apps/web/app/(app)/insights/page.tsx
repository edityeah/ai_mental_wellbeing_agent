"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import type { InsightsOut } from "@/lib/api/types";
import { RecapCard } from "@/components/chat/RecapCard";

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Renders a single profile bucket as a labeled chip group, only if the
 * bucket has items. We keep this dumb on purpose — backend defines the
 * shape, we just surface what's there.
 */
function ProfileBucket({
  label,
  values,
}: {
  label: string;
  values: unknown;
}) {
  let items: string[] = [];
  if (Array.isArray(values)) {
    items = values
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .filter(Boolean);
  } else if (typeof values === "string" && values.trim()) {
    items = [values.trim()];
  } else if (values && typeof values === "object") {
    items = Object.values(values as Record<string, unknown>)
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  }

  if (items.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sage-light mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <span
            key={i}
            className="text-sm bg-cream-edge border border-sage/20 rounded-full px-3 py-1 text-ink"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .insights()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto text-mute">
        Couldn&apos;t load insights — {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto text-mute">
        Loading…
      </div>
    );
  }

  const profileEntries = Object.entries(data.profile ?? {});
  const hasProfile = profileEntries.length > 0;
  const hasRecaps = data.recent_recaps.length > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-cream">
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-sage">Your insights</h1>
            <p className="text-sm text-mute mt-1">
              What we&apos;ve been learning together.
            </p>
          </div>
          <Link
            href="/chat"
            className="text-sm text-sage hover:underline"
          >
            ← Back to chat
          </Link>
        </header>

        {/* Profile snapshot */}
        <section className="mb-8 bg-white border border-cream-edge rounded-2xl p-5 shadow-sm">
          <h2 className="font-serif text-lg text-sage mb-3">
            What I know about you
          </h2>

          {data.summary && (
            <p className="text-sm text-ink leading-relaxed mb-4 whitespace-pre-line">
              {data.summary}
            </p>
          )}

          {hasProfile ? (
            <div className="space-y-4">
              {profileEntries.map(([key, value]) => (
                <ProfileBucket
                  key={key}
                  label={key.replace(/_/g, " ")}
                  values={value}
                />
              ))}
            </div>
          ) : (
            !data.summary && (
              <p className="text-sm text-mute italic">
                We haven&apos;t talked enough yet for me to have a real
                sense of what&apos;s going on. Start a conversation and
                this will fill in as we go.
              </p>
            )
          )}
        </section>

        {/* Recent care plans */}
        <section>
          <h2 className="font-serif text-lg text-sage mb-3">
            Recent care plans
          </h2>

          {!hasRecaps && (
            <p className="text-sm text-mute italic">
              No care plans yet. They&apos;re generated automatically
              after a substantive conversation — keep talking and
              they&apos;ll appear here.
            </p>
          )}

          <div className="space-y-3">
            {data.recent_recaps.map((r) => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <Link
                    href={`/chat/${r.conversation_id}`}
                    className="text-sm font-medium text-sage hover:underline truncate max-w-[60%]"
                  >
                    {r.conversation_title}
                  </Link>
                  <span className="text-xs text-mute">
                    {r.source === "voice" ? "🎙️ " : ""}
                    {fmtDate(r.created_at)}
                  </span>
                </div>
                <RecapCard content={r.content} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
