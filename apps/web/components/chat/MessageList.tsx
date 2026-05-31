"use client";

import { useEffect, useRef } from "react";
import type { MessageOut } from "@/lib/api/types";
import { CrisisCard } from "./CrisisCard";
import { MessageBubble } from "./MessageBubble";

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-cream-edge rounded-bubble rounded-bl-md px-4 py-3">
        <span className="text-mute text-sm italic animate-pulse">
          Companion is thinking…
        </span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="text-4xl mb-4">🍃</div>
        <h2 className="font-serif text-xl text-sage mb-2">
          I&apos;m here to be a steady presence.
        </h2>
        <p className="text-sm text-sage-light leading-relaxed">
          There&apos;s no script. Share whatever&apos;s on your mind —
          something heavy, something small, or just how your day went.
        </p>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  streamingText,
}: {
  messages: MessageOut[];
  streamingText: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamingText]);

  // streamingText === null         → no stream in flight
  // streamingText === ""           → waiting for first token  → "thinking…" bubble
  // streamingText non-empty        → live-growing assistant bubble
  const showThinking = streamingText === "";
  const showStreamingBubble =
    streamingText !== null && streamingText.length > 0;
  const showEmpty = messages.length === 0 && streamingText === null;

  if (showEmpty) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6 space-y-4 bg-cream">
      {messages.map((m) =>
        m.role === "system_crisis" ? (
          <CrisisCard key={m.id} content={m.content} />
        ) : (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ),
      )}
      {showStreamingBubble && (
        <MessageBubble role="assistant" content={streamingText!} />
      )}
      {showThinking && <TypingBubble />}
      <div ref={endRef} />
    </div>
  );
}
