"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/brand/Logo";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="h-screen-dvh flex items-center justify-center px-6 bg-cream">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-2">
          <LogoMark size={64} />
        </div>
        <h1 className="font-serif text-3xl text-sage text-center mb-1">
          Wellbeing
        </h1>
        <p className="text-mute text-center text-sm mb-8">
          A calm space to be heard.
        </p>

        {status === "sent" ? (
          <div className="rounded-lg border border-cream-edge bg-white p-6 text-center">
            <p className="text-ink mb-2">Check your email</p>
            <p className="text-mute text-sm">
              We sent a magic link to <strong>{email}</strong>.
            </p>
            <button
              className="text-sage text-sm mt-4 underline"
              onClick={() => setStatus("idle")}
            >
              Wrong email?
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              required
              placeholder="you@somewhere.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Button
              type="submit"
              className="w-full"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </Button>
            {error && <p className="text-crisis text-xs text-center">{error}</p>}
            <p className="text-[11px] text-mute text-center pt-2 leading-relaxed">
              By continuing, you agree to our{" "}
              <Link href="/legal/terms" className="underline hover:text-sage">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="underline hover:text-sage">
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        )}

        <div className="mt-8 text-center text-[11px] text-mute flex justify-center gap-4">
          <Link href="/legal/disclaimer" className="hover:text-sage">
            Disclaimer
          </Link>
          <span>·</span>
          <Link href="/crisis-resources" className="hover:text-crisis">
            Crisis resources
          </Link>
        </div>
      </div>
    </main>
  );
}
