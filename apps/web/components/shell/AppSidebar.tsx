"use client";

/**
 * Persistent left sidebar shown across every authenticated route —
 * /chat, /chat/[id], /profile, /insights, /legal/*, /crisis-resources.
 *
 * Self-contained: fetches its own conversation list, handles creation
 * + rename + delete dialogs, and includes the user menu at the bottom.
 * The active conversation is read from the URL (no shared state with
 * the page) — clicking a thread is just a router push.
 *
 * On mobile (< md) the sidebar is hidden by default; a hamburger button
 * in pages can open it via the context exported from AppShell.tsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { ConfirmDeleteDialog } from "@/components/chat/ConfirmDeleteDialog";
import { RenameDialog } from "@/components/chat/RenameDialog";
import { ThreadList } from "@/components/threads/ThreadList";
import { api } from "@/lib/api/client";
import type { ConversationOut } from "@/lib/api/types";
import { useAppShell } from "./AppShell";

// Components that aren't /chat-routed get an empty activeId so no row
// is highlighted in the thread list. Active = active for *chat* nav only.
function activeChatIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/chat\/([^/]+)/);
  return m ? m[1] : null;
}

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { closeDrawer } = useAppShell();
  const activeId = activeChatIdFromPath(pathname);

  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Refresh on mount and whenever path changes (so creating/renaming/deleting
  // a conversation from anywhere keeps the sidebar fresh).
  const refresh = useCallback(async () => {
    try {
      const list = await api.listConversations();
      setConversations(list);
    } catch {
      /* sidebar stays stale rather than blowing up */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  // Single-flight guard for new-conversation clicks.
  const creating = useRef(false);

  async function handleNew() {
    if (creating.current) return;
    creating.current = true;
    try {
      const c = await api.createConversation();
      setConversations((prev) => [c, ...prev]);
      closeDrawer();
      router.push(`/chat/${c.id}` as Route);
    } finally {
      creating.current = false;
    }
  }

  function handlePick(id: string) {
    closeDrawer();
    router.push(`/chat/${id}` as Route);
  }

  async function commitRename(newTitle: string) {
    if (!renameTarget) return;
    const id = renameTarget.id;
    setRenameTarget(null);
    try {
      const updated = await api.renameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)),
      );
    } catch {
      /* show no error UI for now — pidget */
    }
  }

  async function commitDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) {
        const remaining = conversations.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          router.replace(`/chat/${remaining[0].id}` as Route);
        } else {
          router.replace("/chat");
        }
      }
    } catch {
      /* ditto */
    }
  }

  return (
    <>
      <ThreadList
        items={conversations}
        activeId={activeId}
        onPick={handlePick}
        onNew={handleNew}
        onRename={(id, currentTitle) =>
          setRenameTarget({ id, title: currentTitle })
        }
        onDelete={(id, title) => setDeleteTarget({ id, title })}
      />
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
    </>
  );
}
