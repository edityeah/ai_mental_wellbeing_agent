"use client";

/**
 * Chat canvas. ONLY the middle pane — header + messages + composer +
 * voice call panel. The sidebar (threads + user menu) lives in the
 * parent (app) layout via AppShell, so it persists across route changes
 * to /profile, /insights, /legal/*, etc.
 *
 * Sidebar↔canvas communication is via URL navigation; this component
 * doesn't know about other conversations beyond the one in the URL.
 */

import { Composer } from "@/components/chat/Composer";
import { Header } from "@/components/chat/Header";
import { MessageList } from "@/components/chat/MessageList";
import { OfflineBanner } from "@/components/chat/OfflineBanner";
import { QuotaFooter } from "@/components/chat/QuotaFooter";
import { CallScreen } from "@/components/voice/CallScreen";
import { useAppShell } from "@/components/shell/AppShell";
import { api } from "@/lib/api/client";
import { streamChat } from "@/lib/api/sse";
import type {
  MeOut,
  MessageAttachment,
  MessageOut,
} from "@/lib/api/types";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ChatScreen({ initialId }: { initialId: string | null }) {
  const router = useRouter();
  const { openDrawer } = useAppShell();

  const [me, setMe] = useState<MeOut | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [activeTitle, setActiveTitle] = useState<string>("Wellbeing");
  const [messages, setMessages] = useState<MessageOut[]>([]);

  // What's currently being streamed (null = no stream in flight).
  // Empty string = waiting for first token (shows "thinking" bubble).
  // Non-empty = render as a normal bubble that grows.
  const [streamingText, setStreamingText] = useState<string | null>(null);

  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  // Bootstrap: load `me`. If new user not yet onboarded, send them to
  // /onboarding. Sidebar handles its own conversation list independently.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      const meRes = await api.me();
      if (!meRes.onboarded_at) {
        router.replace("/onboarding" as Route);
        return;
      }
      setMe(meRes);
      // If we landed on /chat with no id, fetch conversations to pick
      // the latest. If we already have an id from the URL we don't need
      // the full list — the sidebar surfaces it independently.
      if (!initialId) {
        try {
          const convs = await api.listConversations();
          if (convs.length > 0) {
            router.replace(`/chat/${convs[0].id}` as Route);
          }
        } catch {
          /* not critical — sidebar will surface convs */
        }
      } else {
        // We have an id from the URL. Fetch just this conversation's
        // title so the header shows it. Falls back silently if endpoint
        // missing.
        try {
          const all = await api.listConversations();
          const c = all.find((x) => x.id === initialId);
          if (c) setActiveTitle(c.title);
        } catch {
          /* keep default title */
        }
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages + title whenever the active id changes (driven by URL).
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setActiveTitle("Wellbeing");
      return;
    }
    (async () => {
      // Only fetch the messages for the active conversation. The title
      // is set from `activeConvTitle` (passed by listConversations once,
      // not refetched on every nav) — listing all conversations on
      // every active-id change made navigation feel sluggish through
      // the tunnel (extra round-trip on every sidebar click).
      const msgs = await api.listMessages(activeId);
      setMessages(msgs);
      setStreamingText(null);
      setSendError(null);
    })().catch(console.error);
  }, [activeId]);

  // Single-flight guard so rapid sends don't double-create conversations.
  const creatingConv = useRef(false);

  async function handleSend(
    text: string,
    attachments?: MessageAttachment[],
  ) {
    let convId = activeId;
    // Lazily create a conversation on first send if we're on bare /chat.
    if (!convId) {
      if (creatingConv.current) return;
      creatingConv.current = true;
      try {
        const c = await api.createConversation();
        convId = c.id;
        setActiveId(c.id);
        router.replace(`/chat/${c.id}` as Route);
      } catch {
        setSendError("Couldn't start a new conversation. Try again.");
        creatingConv.current = false;
        return;
      }
      creatingConv.current = false;
    }
    setSending(true);
    setSendError(null);

    // Optimistic user message — include attachments so the image shows
    // immediately while the assistant is still thinking.
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        source: "text",
        content: text,
        risk_level: null,
        created_at: new Date().toISOString(),
        attachments: attachments ?? null,
      },
    ]);

    // Empty string → "Companion is thinking…" bubble
    setStreamingText("");

    // Buffer (what server has sent) + displayed (what user has seen) decouples
    // network arrival from visual reveal. The renderer reveals one char per
    // tick from buffer→displayed at a fixed cadence — gives a typewriter feel
    // regardless of how Anthropic chunks its stream.
    const state = {
      buffer: "",
      displayed: "",
      streamDone: false,
      assistantMsgId: null as string | null,
      isCrisis: false,
      errored: false,
    };

    const producer = (async () => {
      try {
        for await (const ev of streamChat({
          conversationId: convId!,
          content: text,
          attachments,
        })) {
          if (ev.type === "started") {
            state.assistantMsgId = ev.message_id;
            state.isCrisis = ev.kind === "crisis_card";
          } else if (ev.type === "token") {
            state.buffer += ev.text;
          } else if (ev.type === "done") {
            state.streamDone = true;
            return;
          } else if (ev.type === "error") {
            state.errored = true;
            state.streamDone = true;
            if (ev.error === "daily_cap_reached") {
              setSendError(
                "You've reached today's limit — see you tomorrow.",
              );
            } else {
              setSendError("Couldn't send. Try again.");
            }
            return;
          }
        }
      } catch {
        state.errored = true;
        state.streamDone = true;
        setSendError("Network blip. Try again.");
      }
    })();

    // Typewriter renderer
    const tickMs = 25;
    while (true) {
      await new Promise((r) => setTimeout(r, tickMs));
      if (state.errored) break;
      const advance = Math.min(
        state.buffer.length - state.displayed.length,
        3,
      );
      if (advance > 0) {
        state.displayed = state.buffer.slice(
          0,
          state.displayed.length + advance,
        );
        setStreamingText(state.displayed);
      }
      if (state.streamDone && state.displayed.length >= state.buffer.length) {
        break;
      }
    }
    await producer;

    // Finalize: drop streaming bubble, append the real assistant row.
    const finalText = state.buffer;
    setStreamingText(null);
    if (!state.errored && state.assistantMsgId && finalText.length > 0) {
      setMessages((prev) => {
        // Replace tmp- user id with a real-looking one (visual only;
        // refetch on next nav fixes it). Also append the assistant row.
        const next = prev.filter((m) => m.id !== tempId);
        next.push({
          id: tempId,
          role: "user",
          source: "text",
          content: text,
          risk_level: null,
          created_at: new Date().toISOString(),
          attachments: attachments ?? null,
        });
        next.push({
          id: state.assistantMsgId!,
          role: state.isCrisis ? "system_crisis" : "assistant",
          source: "text",
          content: finalText,
          risk_level: null,
          created_at: new Date().toISOString(),
        });
        return next;
      });
      // Refresh `me` so quota footer updates.
      try {
        setMe(await api.me());
      } catch {
        /* non-critical */
      }
    }
    setSending(false);
  }

  const capReached = me
    ? me.today_text_msg_count >= me.daily_text_msg_cap
    : false;
  const voiceCapReached = me
    ? me.voice_seconds_used_today >= me.voice_seconds_cap
    : false;

  return (
    <>
      <Header
        title={activeTitle}
        onOpenDrawer={openDrawer}
        onCallClick={() => {
          if (activeId && !voiceCapReached) setCallOpen(true);
        }}
        callDisabled={!activeId || voiceCapReached}
      />
      <OfflineBanner />
      <MessageList messages={messages} streamingText={streamingText} />
      {me && (
        <QuotaFooter
          used={me.today_text_msg_count}
          cap={me.daily_text_msg_cap}
          voiceUsedSeconds={me.voice_seconds_used_today}
          voiceCapSeconds={me.voice_seconds_cap}
        />
      )}
      <Composer
        disabled={capReached || sending}
        disabledReason={
          sendError ||
          (capReached
            ? "You've reached today's limit — see you tomorrow."
            : undefined)
        }
        onSend={handleSend}
      />

      <CallScreen
        open={callOpen}
        conversationId={activeId}
        onClose={() => setCallOpen(false)}
        onLiveTranscript={(t) => {
          setMessages((prev) => {
            if (t.kind === "final") {
              const last = prev[prev.length - 1];
              if (
                last &&
                last.role === t.role &&
                last.content.trim() === t.content.trim()
              ) {
                return prev;
              }
              const id = t.id
                ? `live-${t.id}`
                : `live-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;
              return [
                ...prev,
                {
                  id,
                  role: t.role,
                  source: "voice",
                  content: t.content,
                  risk_level: null,
                  created_at: new Date().toISOString(),
                },
              ];
            }

            const liveId = `live-${t.id}`;
            const idx = prev.findIndex((m) => m.id === liveId);

            if (t.kind === "delta") {
              if (idx === -1) {
                return [
                  ...prev,
                  {
                    id: liveId,
                    role: t.role,
                    source: "voice",
                    content: t.delta,
                    risk_level: null,
                    created_at: new Date().toISOString(),
                  },
                ];
              }
              const next = prev.slice();
              next[idx] = {
                ...next[idx],
                content: next[idx].content + t.delta,
              };
              return next;
            }

            // kind === "end"
            if (idx === -1) {
              return [
                ...prev,
                {
                  id: liveId,
                  role: t.role,
                  source: "voice",
                  content: t.content,
                  risk_level: null,
                  created_at: new Date().toISOString(),
                },
              ];
            }
            const next = prev.slice();
            next[idx] = { ...next[idx], content: t.content };
            return next;
          });
        }}
        onCallEnded={async () => {
          if (!activeId) return;
          try {
            const msgs = await api.listMessages(activeId);
            setMessages(msgs);
            setMe(await api.me());
          } catch {
            /* non-critical refresh */
          }
        }}
      />
    </>
  );
}
