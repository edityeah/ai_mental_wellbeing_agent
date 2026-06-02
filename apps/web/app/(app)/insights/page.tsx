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
 * Renders a single profile bucket as a labeled chip group. Knows how to
 * unwrap the structured shapes the backend produces (Stressor.label,
 * CopingStrategy.label + effective, SleepPatterns object, plain strings).
 */
function chipsForValue(values: unknown): React.ReactNode[] {
  if (Array.isArray(values)) {
    return values.map((v, i) => {
      if (typeof v === "string") return <Chip key={i} text={v} />;
      if (v && typeof v === "object" && "label" in v) {
        const o = v as { label?: string; intensity?: number; effective?: boolean };
        const meta =
          typeof o.intensity === "number"
            ? ` · ${o.intensity}/5`
            : o.effective === true
              ? " ✓"
              : o.effective === false
                ? " ✗"
                : "";
        return <Chip key={i} text={`${o.label ?? "—"}${meta}`} />;
      }
      return <Chip key={i} text={JSON.stringify(v)} />;
    });
  }
  if (values && typeof values === "object" && !Array.isArray(values)) {
    // SleepPatterns: { typical_hours, issues }
    const o = values as { typical_hours?: number; issues?: string[] };
    const out: React.ReactNode[] = [];
    if (typeof o.typical_hours === "number")
      out.push(<Chip key="h" text={`${o.typical_hours}h typical`} />);
    if (Array.isArray(o.issues))
      o.issues.forEach((iss, i) => out.push(<Chip key={`i${i}`} text={iss} />));
    return out;
  }
  if (typeof values === "string" && values.trim()) {
    return [<Chip key={0} text={values.trim()} />];
  }
  return [];
}

function Chip({ text }: { text: string }) {
  return (
    <span className="text-sm bg-cream-edge border border-sage/20 rounded-full px-3 py-1 text-ink">
      {text}
    </span>
  );
}

function ProfileBucket({
  label,
  values,
}: {
  label: string;
  values: unknown;
}) {
  const chips = chipsForValue(values);
  if (chips.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sage-light mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{chips}</div>
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

  // We always render the full set of buckets so the user knows what we're
  // trying to learn — even when most of them are empty. The Companion fills
  // these in over time; they can also edit on the /profile page.
  const BUCKETS: Array<{
    key: keyof typeof data.profile;
    label: string;
    hint: string;
  }> = [
    {
      key: "stressors" as any,
      label: "Stressors",
      hint: "Things weighing on you",
    },
    {
      key: "coping_strategies" as any,
      label: "Coping strategies",
      hint: "What helps when it gets heavy",
    },
    {
      key: "sleep_patterns" as any,
      label: "Sleep",
      hint: "Hours + any issues",
    },
    {
      key: "support_system" as any,
      label: "Support system",
      hint: "People you can lean on",
    },
    {
      key: "goals" as any,
      label: "Goals",
      hint: "What you're working toward",
    },
    {
      key: "notable_events" as any,
      label: "Notable events",
      hint: "Anchors worth remembering",
    },
  ];
  const hasRecaps = data.recent_recaps.length > 0;
  const hasAnyProfile = BUCKETS.some((b) => {
    const v = (data.profile as Record<string, unknown>)[b.key as string];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return Boolean(v);
  });

  return (
    <div className="flex-1 overflow-y-auto bg-cream">
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="font-serif text-2xl text-sage">Your insights</h1>
          <p className="text-sm text-mute mt-1">
            What we&apos;ve been learning together.
          </p>
        </header>

        {/* Profile snapshot */}
        <section className="mb-8 bg-white border border-cream-edge rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between mb-3 gap-3">
            <div>
              <h2 className="font-serif text-lg text-sage">
                What I know about you
              </h2>
              <p className="text-xs text-mute mt-0.5">
                These six things get richer as we talk. You can edit them
                directly on{" "}
                <Link href="/profile" className="underline hover:text-sage">
                  your profile
                </Link>
                .
              </p>
            </div>
          </div>

          {data.summary && (
            <p className="text-sm text-ink leading-relaxed mb-4 whitespace-pre-line bg-cream-edge/40 border border-cream-edge rounded-lg p-3">
              {data.summary}
            </p>
          )}

          {!hasAnyProfile && !data.summary && (
            <p className="text-sm text-mute italic mb-4">
              We haven&apos;t talked enough yet for me to have a real sense
              of what&apos;s going on. Here&apos;s what I&apos;ll be
              learning over time:
            </p>
          )}

          <div className="space-y-4">
            {BUCKETS.map((b) => {
              const v = (data.profile as Record<string, unknown>)[
                b.key as string
              ];
              const isEmpty =
                v == null ||
                (Array.isArray(v) && v.length === 0) ||
                (typeof v === "object" &&
                  !Array.isArray(v) &&
                  Object.keys(v as object).length === 0);

              if (isEmpty) {
                return (
                  <div key={b.key as string}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sage-light mb-1">
                      {b.label}
                    </div>
                    <p className="text-xs text-mute italic">
                      {b.hint} — nothing here yet.
                    </p>
                  </div>
                );
              }
              return (
                <ProfileBucket
                  key={b.key as string}
                  label={b.label}
                  values={v}
                />
              );
            })}
          </div>
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
