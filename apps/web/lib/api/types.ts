export type Risk = "none" | "elevated" | "acute";
export type MessageRole = "user" | "assistant" | "system_crisis";
export type MessageSource = "text" | "voice";

export interface ConversationOut {
  id: string;
  title: string;
  created_at: string;
  last_msg_at: string;
}

export interface MessageOut {
  id: string;
  role: MessageRole;
  source: MessageSource;
  content: string;
  risk_level: Risk | null;
  created_at: string;
}

export interface MeOut {
  id: string;
  email: string;
  display_name: string | null;
  today_text_msg_count: number;
  daily_text_msg_cap: number;
}

export type SseEvent =
  | { type: "started"; message_id: string; risk: Risk; kind: "normal" | "crisis_card" }
  | { type: "token"; text: string }
  | { type: "done"; total_tokens: number }
  | { type: "error"; error: string };
