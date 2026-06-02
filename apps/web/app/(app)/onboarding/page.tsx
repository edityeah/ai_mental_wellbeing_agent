"use client";

/**
 * First-run onboarding.
 *
 * Five short steps. Every answer is optional except the terms checkbox
 * on the final step. The answers are POSTed to /onboarding which:
 *   1. saves the display name on the user row,
 *   2. seeds the progressive profile (stressors, coping, support_system),
 *   3. stamps users.onboarded_at so the (app) layout stops redirecting.
 *
 * Designed to feel low-pressure — questions are softly worded, the user
 * can skip any step, and the final screen acknowledges they can come
 * back to all of this on the /profile page anytime.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

type Step = 0 | 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [displayName, setDisplayName] = useState("");
  const [bringingYouHere, setBringingYouHere] = useState("");
  const [whatHelps, setWhatHelps] = useState("");
  const [support, setSupport] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = 5;

  function next() {
    setStep(((step + 1) % total) as Step);
  }
  function back() {
    if (step > 0) setStep((step - 1) as Step);
  }

  async function submit() {
    if (!acceptTerms) {
      setError("Please tick the consent box to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.completeOnboarding({
        display_name: displayName || null,
        bringing_you_here: bringingYouHere || null,
        what_helps: whatHelps || null,
        support: support || null,
        accept_terms: acceptTerms,
      });
      router.push("/chat");
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col bg-cream min-h-0">
      {/* Top bar */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-cream-edge bg-white">
        <LogoMark size={28} />
        <div className="text-xs text-mute">
          Step {step + 1} of {total}
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-cream-edge">
        <div
          className="h-full bg-sage transition-all duration-300"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      {/* Step body */}
      <div className="flex-1 overflow-y-auto px-5 py-8 md:py-12">
        <div className="max-w-xl mx-auto">
          {step === 0 && (
            <Welcome onContinue={next} />
          )}
          {step === 1 && (
            <NameStep
              value={displayName}
              onChange={setDisplayName}
              onContinue={next}
              onBack={back}
            />
          )}
          {step === 2 && (
            <BringingStep
              value={bringingYouHere}
              onChange={setBringingYouHere}
              onContinue={next}
              onBack={back}
            />
          )}
          {step === 3 && (
            <WhatHelpsStep
              whatHelps={whatHelps}
              onWhatHelpsChange={setWhatHelps}
              support={support}
              onSupportChange={setSupport}
              onContinue={next}
              onBack={back}
            />
          )}
          {step === 4 && (
            <FinalStep
              acceptTerms={acceptTerms}
              onAcceptChange={setAcceptTerms}
              onSubmit={submit}
              onBack={back}
              submitting={submitting}
              error={error}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// ── steps ────────────────────────────────────────────────────────────────

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="text-center">
      <h1 className="font-serif text-3xl text-sage mb-3">
        Welcome to Wellbeing
      </h1>
      <p className="text-ink leading-relaxed mb-5">
        Before we start talking — four small questions, so I have somewhere
        to begin from instead of asking you everything cold.
      </p>
      <p className="text-mute text-sm leading-relaxed mb-8">
        You can skip any of them. You can also change all of it later on
        your profile page.
      </p>
      <Button onClick={onContinue} className="w-full max-w-xs">
        Let&apos;s begin
      </Button>
      <p className="text-xs text-mute mt-6">
        <Link href="/legal/disclaimer" className="underline hover:text-sage">
          Important: what Wellbeing is, and isn&apos;t
        </Link>
      </p>
    </div>
  );
}

function NameStep({
  value,
  onChange,
  onContinue,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <h2 className="font-serif text-2xl text-sage mb-2">
        What should I call you?
      </h2>
      <p className="text-mute text-sm mb-5">
        First name, nickname — whatever feels like you. The Companion will
        use this.
      </p>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your name"
        maxLength={120}
        className="w-full bg-cream border border-cream-edge rounded-lg px-4 py-3 text-base outline-none focus:border-sage"
      />
      <Footer onBack={onBack} onContinue={onContinue} canSkip />
    </Card>
  );
}

function BringingStep({
  value,
  onChange,
  onContinue,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <h2 className="font-serif text-2xl text-sage mb-2">
        What&apos;s bringing you here, today?
      </h2>
      <p className="text-mute text-sm mb-5">
        A sentence or two is fine. No need to explain everything — just the
        thread that pulled you in.
      </p>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Stress at work, sleep that isn't right, a big change coming up… whatever's loudest."
        rows={4}
        maxLength={500}
        className="w-full bg-cream border border-cream-edge rounded-lg px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-sage resize-none"
      />
      <Footer onBack={onBack} onContinue={onContinue} canSkip />
    </Card>
  );
}

function WhatHelpsStep({
  whatHelps,
  onWhatHelpsChange,
  support,
  onSupportChange,
  onContinue,
  onBack,
}: {
  whatHelps: string;
  onWhatHelpsChange: (v: string) => void;
  support: string;
  onSupportChange: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <h2 className="font-serif text-2xl text-sage mb-2">
        What helps, when things feel heavy?
      </h2>
      <p className="text-mute text-sm mb-3">
        One thing is enough — a walk, music, a friend, breathwork, the gym,
        nothing in particular yet…
      </p>
      <input
        autoFocus
        type="text"
        value={whatHelps}
        onChange={(e) => onWhatHelpsChange(e.target.value)}
        placeholder="The thing that takes a bit of the weight off"
        maxLength={200}
        className="w-full bg-cream border border-cream-edge rounded-lg px-4 py-3 text-base outline-none focus:border-sage mb-6"
      />

      <h3 className="font-serif text-lg text-sage mb-2">
        Anyone you can lean on?
      </h3>
      <p className="text-mute text-sm mb-3">
        Names or roles — your partner, your sister, your therapist, a
        specific friend. Separate by commas if more than one.
      </p>
      <input
        type="text"
        value={support}
        onChange={(e) => onSupportChange(e.target.value)}
        placeholder="e.g. Priya, my brother, my old roommate"
        maxLength={400}
        className="w-full bg-cream border border-cream-edge rounded-lg px-4 py-3 text-base outline-none focus:border-sage"
      />

      <Footer onBack={onBack} onContinue={onContinue} canSkip />
    </Card>
  );
}

function FinalStep({
  acceptTerms,
  onAcceptChange,
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  acceptTerms: boolean;
  onAcceptChange: (v: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <h2 className="font-serif text-2xl text-sage mb-2">One last thing</h2>
      <p className="text-mute text-sm mb-5 leading-relaxed">
        Wellbeing is a companion for self-reflection. It&apos;s not a
        clinician, not a therapist, and not for emergencies. If you ever
        feel in danger, please reach a real person —{" "}
        <Link
          href="/crisis-resources"
          target="_blank"
          className="underline hover:text-sage"
        >
          here are some you can call
        </Link>
        .
      </p>

      <label className="flex items-start gap-3 cursor-pointer bg-cream rounded-lg px-4 py-3 border border-cream-edge mb-6">
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => onAcceptChange(e.target.checked)}
          className="mt-1 accent-sage w-4 h-4"
        />
        <span className="text-sm text-ink leading-relaxed">
          I&apos;ve read and agree to the{" "}
          <Link
            href="/legal/terms"
            target="_blank"
            className="underline hover:text-sage"
          >
            Terms
          </Link>
          ,{" "}
          <Link
            href="/legal/privacy"
            target="_blank"
            className="underline hover:text-sage"
          >
            Privacy Policy
          </Link>
          , and{" "}
          <Link
            href="/legal/disclaimer"
            target="_blank"
            className="underline hover:text-sage"
          >
            Disclaimer
          </Link>
          .
        </span>
      </label>

      {error && (
        <p className="text-crisis text-sm mb-4" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="text-sm text-mute hover:text-sage transition disabled:opacity-50"
        >
          ← Back
        </button>
        <Button
          onClick={onSubmit}
          disabled={submitting || !acceptTerms}
          className="min-w-[160px]"
        >
          {submitting ? "Saving…" : "Begin"}
        </Button>
      </div>
    </Card>
  );
}

// ── shared chrome ────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-cream-edge rounded-2xl p-6 md:p-8 shadow-sm">
      {children}
    </div>
  );
}

function Footer({
  onBack,
  onContinue,
  canSkip,
}: {
  onBack: () => void;
  onContinue: () => void;
  canSkip?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mt-6">
      <button
        onClick={onBack}
        className="text-sm text-mute hover:text-sage transition"
      >
        ← Back
      </button>
      <div className="flex items-center gap-3">
        {canSkip && (
          <button
            onClick={onContinue}
            className="text-sm text-mute hover:text-sage transition"
          >
            Skip
          </button>
        )}
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
