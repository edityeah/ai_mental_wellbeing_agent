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
