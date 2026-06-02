"use client";

/**
 * Profile / Settings page.
 *
 * Two purposes:
 *  1. Show the user *what we know about them* — the progressive profile
 *     the Companion has been building from conversation. Renders all six
 *     buckets (stressors, coping strategies, support system, sleep, goals,
 *     notable events) with their schema, so even when empty the user can
 *     see what we'll learn over time.
 *  2. Let them edit it directly. Editing flows through PATCH /profile.
 *
 * Also: display_name (editable), email (read-only), sign out, install PWA.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/lib/api/client";
import type {
  CopingStrategy,
  Goal,
  NotableEvent,
  ProfileOut,
  Stressor,
  UserProfileShape,
} from "@/lib/api/types";

// ── shared chip components ────────────────────────────────────────────────

function EditableChip({
  text,
  meta,
  onChange,
  onRemove,
}: {
  text: string;
  meta?: React.ReactNode;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-cream-edge border border-sage/20 rounded-full pl-3 pr-1 py-1 max-w-full">
      <input
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm outline-none focus:ring-0 min-w-0 flex-1"
      />
      {meta}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="w-5 h-5 rounded-full text-mute hover:text-crisis flex items-center justify-center"
      >
        ×
      </button>
    </div>
  );
}

function AddRow({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!val.trim()) return;
        onAdd(val.trim());
        setVal("");
      }}
      className="flex items-center gap-2 mt-2"
    >
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm bg-white border border-cream-edge rounded-full px-3 py-1.5 outline-none focus:border-sage"
      />
      <button
        type="submit"
        className="text-xs bg-sage text-cream rounded-full px-3 py-1.5 hover:bg-sage-dark"
      >
        Add
      </button>
    </form>
  );
}

// ── bucket: simple string list (support_system) ──────────────────────────

function StringListBucket({
  label,
  hint,
  values,
  onChange,
  addPlaceholder,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  addPlaceholder: string;
}) {
  return (
    <Bucket label={label} hint={hint}>
      {values.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((v, i) => (
            <EditableChip
              key={i}
              text={v}
              onChange={(text) => {
                const next = values.slice();
                next[i] = text;
                onChange(next);
              }}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      <AddRow
        placeholder={addPlaceholder}
        onAdd={(v) => onChange([...values, v])}
      />
    </Bucket>
  );
}

// ── bucket: stressors (label + intensity) ────────────────────────────────

function StressorsBucket({
  values,
  onChange,
}: {
  values: Stressor[];
  onChange: (next: Stressor[]) => void;
}) {
  return (
    <Bucket
      label="Stressors"
      hint="Things that are weighing on you. Intensity 1-5."
    >
      {values.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((s, i) => (
            <EditableChip
              key={i}
              text={s.label}
              meta={
                <select
                  value={s.intensity ?? ""}
                  onChange={(e) => {
                    const next = values.slice();
                    next[i] = {
                      ...s,
                      intensity: e.target.value
                        ? Number(e.target.value)
                        : null,
                    };
                    onChange(next);
                  }}
                  className="text-[11px] bg-transparent border border-sage/30 rounded-full px-1.5 py-0.5 outline-none"
                  aria-label="Intensity"
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              }
              onChange={(label) => {
                const next = values.slice();
                next[i] = { ...s, label };
                onChange(next);
              }}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      <AddRow
        placeholder="e.g. work pressure, finances…"
        onAdd={(label) => onChange([...values, { label }])}
      />
    </Bucket>
  );
}

// ── bucket: coping strategies (label + effective toggle) ─────────────────

function CopingBucket({
  values,
  onChange,
}: {
  values: CopingStrategy[];
  onChange: (next: CopingStrategy[]) => void;
}) {
  return (
    <Bucket
      label="Coping strategies"
      hint="What helps when things get heavy. Mark ✓ if it's actually working."
    >
      {values.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((c, i) => (
            <EditableChip
              key={i}
              text={c.label}
              meta={
                <button
                  type="button"
                  onClick={() => {
                    const next = values.slice();
                    next[i] = {
                      ...c,
                      effective: c.effective === true ? false : true,
                    };
                    onChange(next);
                  }}
                  className={`text-[11px] rounded-full px-1.5 py-0.5 ${
                    c.effective === true
                      ? "bg-sage text-cream"
                      : c.effective === false
                        ? "bg-cream-edge text-mute line-through"
                        : "border border-sage/30 text-mute"
                  }`}
                  aria-label="Toggle effective"
                  title={
                    c.effective === true
                      ? "Effective"
                      : c.effective === false
                        ? "Tried, didn't help"
                        : "Unknown"
                  }
                >
                  {c.effective === true
                    ? "✓"
                    : c.effective === false
                      ? "✗"
                      : "?"}
                </button>
              }
              onChange={(label) => {
                const next = values.slice();
                next[i] = { ...c, label };
                onChange(next);
              }}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      <AddRow
        placeholder="e.g. morning workout, walking, journaling…"
        onAdd={(label) => onChange([...values, { label }])}
      />
    </Bucket>
  );
}

// ── bucket: goals (label + optional date) ────────────────────────────────

function GoalsBucket({
  values,
  onChange,
}: {
  values: Goal[];
  onChange: (next: Goal[]) => void;
}) {
  return (
    <Bucket
      label="Goals"
      hint="What you're working toward. The Companion will reference these."
    >
      {values.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((g, i) => (
            <EditableChip
              key={i}
              text={g.label}
              onChange={(label) => {
                const next = values.slice();
                next[i] = { ...g, label };
                onChange(next);
              }}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      <AddRow
        placeholder="e.g. sleep before midnight, call mom weekly…"
        onAdd={(label) =>
          onChange([
            ...values,
            { label, set_at: new Date().toISOString() },
          ])
        }
      />
    </Bucket>
  );
}

// ── bucket: notable events (label + optional date) ───────────────────────

function EventsBucket({
  values,
  onChange,
}: {
  values: NotableEvent[];
  onChange: (next: NotableEvent[]) => void;
}) {
  return (
    <Bucket
      label="Notable events"
      hint="Anchors in your life worth remembering — moves, losses, milestones."
    >
      {values.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((e, i) => (
            <EditableChip
              key={i}
              text={e.label}
              onChange={(label) => {
                const next = values.slice();
                next[i] = { ...e, label };
                onChange(next);
              }}
              onRemove={() => onChange(values.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      <AddRow
        placeholder="e.g. started new job, lost a friend, moved cities…"
        onAdd={(label) => onChange([...values, { label }])}
      />
    </Bucket>
  );
}

// ── bucket: sleep (typical_hours + issues list) ──────────────────────────

function SleepBucket({
  value,
  onChange,
}: {
  value: { typical_hours?: number | null; issues?: string[] } | null;
  onChange: (
    next: { typical_hours?: number | null; issues?: string[] } | null,
  ) => void;
}) {
  const v = value ?? { typical_hours: null, issues: [] };
  return (
    <Bucket
      label="Sleep"
      hint="Sleep is usually the first thing to go when something's wrong — track it."
    >
      <div className="flex items-center gap-2 mb-3">
        <label className="text-sm text-mute">Typical hours:</label>
        <input
          type="number"
          step="0.5"
          min={0}
          max={24}
          value={v.typical_hours ?? ""}
          onChange={(e) =>
            onChange({
              ...v,
              typical_hours: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="w-20 text-sm bg-white border border-cream-edge rounded-md px-2 py-1 outline-none focus:border-sage"
        />
      </div>
      <div className="text-[11px] uppercase tracking-wide text-sage-light mb-1">
        Issues
      </div>
      {(v.issues ?? []).length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="flex flex-wrap gap-2">
          {(v.issues ?? []).map((iss, i) => (
            <EditableChip
              key={i}
              text={iss}
              onChange={(text) => {
                const next = (v.issues ?? []).slice();
                next[i] = text;
                onChange({ ...v, issues: next });
              }}
              onRemove={() =>
                onChange({
                  ...v,
                  issues: (v.issues ?? []).filter((_, j) => j !== i),
                })
              }
            />
          ))}
        </div>
      )}
      <AddRow
        placeholder="e.g. waking at 3am, racing thoughts…"
        onAdd={(text) =>
          onChange({ ...v, issues: [...(v.issues ?? []), text] })
        }
      />
    </Bucket>
  );
}

// ── shared chrome ────────────────────────────────────────────────────────

function Bucket({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-cream-edge rounded-2xl p-5">
      <h3 className="font-serif text-lg text-sage">{label}</h3>
      <p className="text-xs text-mute mb-3">{hint}</p>
      {children}
    </section>
  );
}

function EmptyHint() {
  return (
    <p className="text-sm text-mute italic">
      Nothing here yet — I&apos;ll learn this as we talk, or you can add things
      yourself.
    </p>
  );
}

// ── page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [data, setData] = useState<ProfileOut | null>(null);
  const [draft, setDraft] = useState<UserProfileShape>({});
  const [displayDraft, setDisplayDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then((p) => {
        if (cancelled) return;
        setData(p);
        setDraft(p.profile || {});
        setDisplayDraft(p.display_name ?? "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: UserProfileShape, nextDisplay?: string) => {
      setSaveStatus("saving");
      try {
        const updated = await api.updateProfile({
          profile: next,
          ...(nextDisplay !== undefined
            ? { display_name: nextDisplay }
            : {}),
        });
        setData(updated);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (e) {
        setError((e as Error).message);
        setSaveStatus("idle");
      }
    },
    [],
  );

  // Debounced auto-save when the draft changes
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      void persist(draft);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto bg-cream px-4 md:px-8 py-8">
        <div className="max-w-2xl mx-auto text-mute">
          Couldn&apos;t load profile — {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 overflow-y-auto bg-cream px-4 md:px-8 py-8">
        <div className="max-w-2xl mx-auto text-mute">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cream">
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl mx-auto pb-32">
        <header className="mb-6">
          <h1 className="font-serif text-2xl text-sage">Your profile</h1>
          <p className="text-sm text-mute mt-1">
            What we know about you so far. Edit anything — it shapes how
            the Companion responds.
          </p>
        </header>

        {/* Account section */}
        <section className="bg-white border border-cream-edge rounded-2xl p-5 mb-6">
          <h2 className="font-serif text-lg text-sage mb-3">Account</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-sage-light mb-1">
                Name
              </label>
              <input
                value={displayDraft}
                onChange={(e) => setDisplayDraft(e.target.value)}
                onBlur={() => {
                  if (displayDraft !== (data.display_name ?? "")) {
                    void persist(draft, displayDraft);
                  }
                }}
                placeholder="What should the Companion call you?"
                className="w-full bg-cream rounded-lg border border-cream-edge px-3 py-2 text-sm outline-none focus:border-sage"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-sage-light mb-1">
                Email
              </label>
              <div className="text-sm text-ink">{data.email}</div>
            </div>
          </div>
        </section>

        {/* Summary (what the Companion sees on every turn) */}
        {data.summary && (
          <section className="bg-white border border-cream-edge rounded-2xl p-5 mb-6">
            <h2 className="font-serif text-lg text-sage mb-2">
              How I&apos;d describe what&apos;s going on
            </h2>
            <p className="text-xs text-mute mb-3">
              This is the running summary the Companion reads before every
              reply. Updated automatically from our conversations.
            </p>
            <p className="text-sm text-ink whitespace-pre-line leading-relaxed">
              {data.summary}
            </p>
          </section>
        )}

        {/* Progressive profile */}
        <div className="space-y-4">
          <StressorsBucket
            values={draft.stressors ?? []}
            onChange={(stressors) => setDraft({ ...draft, stressors })}
          />
          <CopingBucket
            values={draft.coping_strategies ?? []}
            onChange={(coping_strategies) =>
              setDraft({ ...draft, coping_strategies })
            }
          />
          <SleepBucket
            value={draft.sleep_patterns ?? null}
            onChange={(sleep_patterns) =>
              setDraft({ ...draft, sleep_patterns })
            }
          />
          <StringListBucket
            label="Support system"
            hint="The people in your life you can lean on."
            values={draft.support_system ?? []}
            onChange={(support_system) =>
              setDraft({ ...draft, support_system })
            }
            addPlaceholder="e.g. partner, sister, therapist…"
          />
          <GoalsBucket
            values={draft.goals ?? []}
            onChange={(goals) => setDraft({ ...draft, goals })}
          />
          <EventsBucket
            values={draft.notable_events ?? []}
            onChange={(notable_events) =>
              setDraft({ ...draft, notable_events })
            }
          />
        </div>

        {/* Save status footer — the legal/crisis links live in the
            user menu in the sidebar, so we don't duplicate them here. */}
        <section className="mt-8 text-right">
          <div className="text-xs text-mute">
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
                ? "Saved ✓"
                : ""}
          </div>
        </section>
      </div>
    </div>
  );
}
