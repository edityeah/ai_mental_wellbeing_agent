import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  ConversationOut,
  InsightsOut,
  MeOut,
  MessageOut,
} from "@/lib/api/types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(init.headers || {}),
  };
  const r = await fetch(`${BASE}/api/v1${path}`, { ...init, headers });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${r.status}: ${body}`);
  }
  return (await r.json()) as T;
}

export const api = {
  me: () => jsonRequest<MeOut>("/me"),
  listConversations: () => jsonRequest<ConversationOut[]>("/conversations"),
  createConversation: () =>
    jsonRequest<ConversationOut>("/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  renameConversation: (id: string, title: string) =>
    jsonRequest<ConversationOut>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteConversation: async (id: string): Promise<void> => {
    const headers = {
      "Content-Type": "application/json",
      ...(await authHeader()),
    };
    const r = await fetch(`${BASE}/api/v1/conversations/${id}`, {
      method: "DELETE",
      headers,
    });
    if (!r.ok && r.status !== 204) {
      throw new Error(`${r.status}: ${await r.text()}`);
    }
  },
  listMessages: (id: string) =>
    jsonRequest<MessageOut[]>(`/conversations/${id}/messages`),
  insights: () => jsonRequest<InsightsOut>("/insights"),
};

export { BASE as API_BASE };
