import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { API_BASE } from "@/lib/api/client";

export interface VoiceTokenResponse {
  access_token: string;
  room_name: string;
  livekit_url: string;
  ttl_seconds: number;
  voice_seconds_remaining: number;
}

export type VoiceTokenError =
  | { kind: "daily_cap" }
  | { kind: "global_cap" }
  | { kind: "unauthenticated" }
  | { kind: "network"; message: string };

export async function requestVoiceToken(
  conversationId: string,
): Promise<{ ok: true; data: VoiceTokenResponse } | { ok: false; error: VoiceTokenError }> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: { kind: "unauthenticated" } };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/voice/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversation_id: conversationId }),
    });
  } catch (e) {
    return {
      ok: false,
      error: { kind: "network", message: (e as Error).message },
    };
  }

  if (response.status === 429) {
    return { ok: false, error: { kind: "daily_cap" } };
  }
  if (response.status === 503) {
    return { ok: false, error: { kind: "global_cap" } };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "network", message: `http_${response.status}` },
    };
  }

  return { ok: true, data: (await response.json()) as VoiceTokenResponse };
}
