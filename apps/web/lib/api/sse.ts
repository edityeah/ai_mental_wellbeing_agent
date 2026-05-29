import { API_BASE } from "@/lib/api/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SseEvent } from "@/lib/api/types";

export async function* streamChat(args: {
  conversationId: string;
  content: string;
}): AsyncIterable<SseEvent> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    yield { type: "error", error: "not_authenticated" };
    return;
  }

  const response = await fetch(`${API_BASE}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      conversation_id: args.conversationId,
      content: args.content,
    }),
  });

  if (response.status === 429) {
    yield { type: "error", error: "daily_cap_reached" };
    return;
  }
  if (!response.ok || !response.body) {
    yield { type: "error", error: `http_${response.status}` };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const sep = buffer.indexOf("\n\n");
      if (sep < 0) break;
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const lines = rawEvent.split("\n");
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = dataLines.join("\n");

      try {
        const parsed = JSON.parse(data);
        if (eventName === "started")
          yield { type: "started", ...parsed };
        else if (eventName === "token")
          yield { type: "token", text: parsed.text };
        else if (eventName === "done")
          yield { type: "done", total_tokens: parsed.total_tokens };
        else if (eventName === "error")
          yield { type: "error", error: parsed.error };
      } catch {
        // ignore malformed events
      }
    }
  }
}
