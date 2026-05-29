"use client";

import { useEffect, useRef } from "react";
import type { MessageOut } from "@/lib/api/types";
import { CrisisCard } from "./CrisisCard";
import { MessageBubble } from "./MessageBubble";

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

  return (
    <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6 space-y-4 bg-cream">
      {messages.map((m) =>
        m.role === "system_crisis" ? (
          <CrisisCard key={m.id} content={m.content} />
        ) : (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ),
      )}
      {streamingText !== null && (
        <MessageBubble role="assistant" content={streamingText + "▍"} />
      )}
      <div ref={endRef} />
    </div>
  );
}
