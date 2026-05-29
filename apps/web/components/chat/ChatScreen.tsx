"use client";

import { Composer } from "@/components/chat/Composer";
import { Header } from "@/components/chat/Header";
import { MessageList } from "@/components/chat/MessageList";
import { OfflineBanner } from "@/components/chat/OfflineBanner";
import { QuotaFooter } from "@/components/chat/QuotaFooter";
import { ThreadList } from "@/components/threads/ThreadList";
import { ThreadsDrawer } from "@/components/threads/ThreadsDrawer";
import { api } from "@/lib/api/client";
import { streamChat } from "@/lib/api/sse";
import type {
  ConversationOut,
  MeOut,
  MessageOut,
} from "@/lib/api/types";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ChatScreen({ initialId }: { initialId: string | null }) {
  const router = useRouter();

  const [me, setMe] = useState<MeOut | null>(null);
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [activeConv, setActiveConv] = useState<ConversationOut | null>(null);
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Bootstrap: load conversations + me; if no active id, create or pick latest.
  useEffect(() => {
    (async () => {
      const [meRes, convs] = await Promise.all([
        api.me(),
        api.listConversations(),
      ]);
      setMe(meRes);
      setConversations(convs);

      let id = activeId;
      if (!id) {
        if (convs.length > 0) {
          id = convs[0].id;
        } else {
          const created = await api.createConversation();
          setConversations([created]);
          id = created.id;
        }
        router.replace(`/chat/${id}` as Route);
        setActiveId(id);
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!activeId) return;
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

    setStreamingText("");
    let assistantMsgId: string | null = null;
    let isCrisis = false;
    let collected = "";

    try {
      for await (const ev of streamChat({
        conversationId: activeId,
        content: text,
      })) {
        if (ev.type === "started") {
          assistantMsgId = ev.message_id;
          isCrisis = ev.kind === "crisis_card";
        } else if (ev.type === "token") {
          collected += ev.text;
          setStreamingText(collected);
        } else if (ev.type === "done") {
          // commit to messages list
          setStreamingText(null);
          if (assistantMsgId) {
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMsgId!,
                role: isCrisis ? "system_crisis" : "assistant",
                source: "text",
                content: collected,
                risk_level: null,
                created_at: new Date().toISOString(),
              },
            ]);
          }
        } else if (ev.type === "error") {
          setStreamingText(null);
          if (ev.error === "daily_cap_reached") {
            setSendError(
              "You've reached today's limit — see you tomorrow.",
            );
          } else {
            setSendError("Something's off. Try again in a moment.");
          }
        }
      }
      // Refresh /me to update the quota counter.
      setMe(await api.me());
      // Refresh conversation title (it may have been auto-generated).
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (e) {
      setStreamingText(null);
      setSendError("No connection. Your message wasn't sent.");
    } finally {
      setSending(false);
    }
  }

  async function handleNewConversation() {
    const c = await api.createConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setDrawerOpen(false);
    router.replace(`/chat/${c.id}` as Route);
  }

  const capReached = me ? me.today_text_msg_count >= me.daily_text_msg_cap : false;

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
        />
      </ThreadsDrawer>

      <main className="flex-1 flex flex-col h-screen-dvh min-w-0">
        <Header
          title={activeConv?.title || "Wellbeing"}
          onOpenDrawer={() => setDrawerOpen(true)}
          onCallClick={() => {}}
        />
        <OfflineBanner />
        <MessageList messages={messages} streamingText={streamingText} />
        {me && (
          <QuotaFooter
            used={me.today_text_msg_count}
            cap={me.daily_text_msg_cap}
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
    </>
  );
}
