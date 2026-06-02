"use client";

import { Composer } from "@/components/chat/Composer";
import { ConfirmDeleteDialog } from "@/components/chat/ConfirmDeleteDialog";
import { Header } from "@/components/chat/Header";
import { MessageList } from "@/components/chat/MessageList";
import { OfflineBanner } from "@/components/chat/OfflineBanner";
import { QuotaFooter } from "@/components/chat/QuotaFooter";
import { RenameDialog } from "@/components/chat/RenameDialog";
import { ThreadList } from "@/components/threads/ThreadList";
import { ThreadsDrawer } from "@/components/threads/ThreadsDrawer";
import { CallScreen } from "@/components/voice/CallScreen";
import { api } from "@/lib/api/client";
import { streamChat } from "@/lib/api/sse";
import type {
  ConversationOut,
  MeOut,
  MessageOut,
} from "@/lib/api/types";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ChatScreen({ initialId }: { initialId: string | null }) {
  const router = useRouter();

  const [me, setMe] = useState<MeOut | null>(null);
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [activeConv, setActiveConv] = useState<ConversationOut | null>(null);
  const [messages, setMessages] = useState<MessageOut[]>([]);

  // What's currently being streamed (null = no stream in flight).
  // Empty string = waiting for first token (shows "thinking" bubble).
  // Non-empty = render as a normal bubble that grows.
  const [streamingText, setStreamingText] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  // In-app dialogs (replaces window.prompt / window.confirm)
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Bootstrap: load conversations + me; pick latest if no active id.
  // We DO NOT auto-create a conversation here — that produced duplicates if
  // the effect ran twice. First send creates the conversation lazily.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      const [meRes, convs] = await Promise.all([
        api.me(),
        api.listConversations(),
      ]);
      setMe(meRes);
      setConversations(convs);
      if (!activeId && convs.length > 0) {
        const id = convs[0].id;
        router.replace(`/chat/${id}` as Route);
        setActiveId(id);
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single-flight guard so rapid clicks on "+ New conversation" don't
  // create two empty rows.
  const creatingConv = useRef(false);

  // Load messages when active conversation changes.
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      const c = conversations.find((c) => c.id === activeId) || null;
      setActiveConv(c);
      const msgs = await api.listMessages(activeId);
      setMessages(msgs);
      setStreamingText(null);
      setSendError(null);
    })().catch(console.error);
  }, [activeId, conversations]);

  async function handleSend(text: string) {
    // Lazy-create the first conversation on the user's first message.
    let convId = activeId;
    if (!convId) {
      if (creatingConv.current) return;
      creatingConv.current = true;
      try {
        const c = await api.createConversation();
        setConversations((prev) => [c, ...prev]);
        setActiveId(c.id);
        router.replace(`/chat/${c.id}` as Route);
        convId = c.id;
      } catch {
        creatingConv.current = false;
        setSendError("Couldn't start a conversation. Try again.");
        return;
      }
      creatingConv.current = false;
    }
    setSending(true);
    setSendError(null);

    // Optimistic user message
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

    // --- Producer: consume SSE, push deltas into state.buffer ---
    const producer = (async () => {
      try {
        for await (const ev of streamChat({
          conversationId: convId,
          content: text,
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
              setSendError("You've reached today's limit — see you tomorrow.");
            } else {
              setSendError("Something's off. Try again in a moment.");
            }
            return;
          }
        }
      } catch {
        state.errored = true;
        state.streamDone = true;
        setSendError("No connection. Your message wasn't sent.");
      } finally {
        state.streamDone = true;
      }
    })();

    // --- Consumer: reveal at a fixed cadence so it feels like typing ---
    // One character per tick, always. ~33ms ≈ 30 chars/sec — feels like
    // someone is actually typing. The buffer can race ahead of us; that's
    // fine, we just keep stepping at the human pace.
    // ~40 chars/sec — feels like a real person typing.
    const tickMs = 25;
    const sleep = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms));

    while (!state.streamDone || state.displayed.length < state.buffer.length) {
      if (state.displayed.length < state.buffer.length) {
        state.displayed = state.buffer.slice(0, state.displayed.length + 1);
        setStreamingText(state.displayed);
      }
      await sleep(tickMs);
      if (state.errored) break;
    }

    await producer; // ensure the SSE consumer fully resolved

    // Commit the assistant message (unless we errored mid-stream).
    if (!state.errored && state.displayed.length > 0 && state.assistantMsgId) {
      const finalText = state.displayed;
      const msgId = state.assistantMsgId;
      const crisis = state.isCrisis;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msgId)) return prev;
        return [
          ...prev,
          {
            id: msgId,
            role: crisis ? "system_crisis" : "assistant",
            source: "text",
            content: finalText,
            risk_level: null,
            created_at: new Date().toISOString(),
          },
        ];
      });
    }
    setStreamingText(null);
    setSending(false);

    // Refresh /me + conversations (for the auto-generated title)
    if (!state.errored) {
      try {
        setMe(await api.me());
        const convs = await api.listConversations();
        setConversations(convs);
      } catch {
        /* non-critical refresh */
      }
    }
  }

  async function handleNewConversation() {
    if (creatingConv.current) return; // single-flight guard
    creatingConv.current = true;
    try {
      const c = await api.createConversation();
      setConversations((prev) => [c, ...prev]);
      setActiveId(c.id);
      setDrawerOpen(false);
      router.replace(`/chat/${c.id}` as Route);
    } finally {
      creatingConv.current = false;
    }
  }

  function requestRenameConversation(id: string, currentTitle: string) {
    setRenameTarget({ id, title: currentTitle });
  }

  async function commitRename(newTitle: string) {
    if (!renameTarget) return;
    const id = renameTarget.id;
    try {
      const updated = await api.renameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)),
      );
      if (id === activeId) {
        setActiveConv((c) => (c ? { ...c, title: updated.title } : c));
      }
      setRenameTarget(null);
    } catch {
      setSendError("Couldn't rename. Try again.");
      setRenameTarget(null);
    }
  }

  function requestDeleteConversation(id: string, title: string) {
    setDeleteTarget({ id, title });
  }

  async function commitDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await api.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (id === activeId) {
        if (remaining.length > 0) {
          const next = remaining[0].id;
          setActiveId(next);
          router.replace(`/chat/${next}` as Route);
        } else {
          setActiveId(null);
          setActiveConv(null);
          setMessages([]);
          router.replace("/chat");
        }
      }
      setDeleteTarget(null);
    } catch {
      setSendError("Couldn't delete. Try again.");
      setDeleteTarget(null);
    }
  }

  const capReached = me ? me.today_text_msg_count >= me.daily_text_msg_cap : false;
  const voiceCapReached = me
    ? me.voice_seconds_used_today >= me.voice_seconds_cap
    : false;

  return (
    <>
      <ThreadsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ThreadList
          items={conversations}
          activeId={activeId}
          onPick={(id) => {
            setActiveId(id);
            setDrawerOpen(false);
            router.replace(`/chat/${id}` as Route);
          }}
          onNew={handleNewConversation}
          onRename={requestRenameConversation}
          onDelete={requestDeleteConversation}
        />
      </ThreadsDrawer>

      <main className="flex-1 flex flex-col h-screen-dvh min-w-0">
        <Header
          title={activeConv?.title || "Wellbeing"}
          onOpenDrawer={() => setDrawerOpen(true)}
          onCallClick={() => {
            if (activeId && !voiceCapReached) setCallOpen(true);
          }}
          callDisabled={!activeId || voiceCapReached}
        />
        <OfflineBanner />
        <MessageList
          messages={messages}
          streamingText={streamingText}
        />
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
      </main>

      <RenameDialog
        open={renameTarget !== null}
        initialTitle={renameTarget?.title ?? ""}
        onCancel={() => setRenameTarget(null)}
        onSubmit={commitRename}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        title={deleteTarget?.title ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={commitDelete}
      />

      <CallScreen
        open={callOpen}
        conversationId={activeId}
        onClose={() => setCallOpen(false)}
        onLiveTranscript={(t) => {
          // Three packet kinds from the voice worker:
          //   • final  → append a whole bubble (user STT, crisis cards)
          //   • delta  → append a chunk to an in-progress assistant bubble
          //              (creates the bubble on first delta), giving the
          //              same typewriter feel the text chat has
          //   • end    → bubble is complete, replace its content with the
          //              canonical final text (covers any dropped deltas)
          setMessages((prev) => {
            if (t.kind === "final") {
              // Skip if it's already the last bubble (race between
              // delta-end and a refetch).
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
                : `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
                // First delta — create the bubble.
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
              // Append delta to existing bubble.
              const next = prev.slice();
              next[idx] = {
                ...next[idx],
                content: next[idx].content + t.delta,
              };
              return next;
            }

            // kind === "end" — replace content with the canonical final text.
            if (idx === -1) {
              // Never saw a delta (rare — entire response fit in pre-flush
              // safety buffer). Append the final as a fresh bubble.
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
