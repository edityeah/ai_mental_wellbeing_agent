"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
        <h1 className="font-serif text-3xl text-sage text-center mb-1">
          🍃 Wellbeing
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
          </form>
        )}
      </div>
    </main>
  );
}
