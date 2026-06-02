export type Risk = "none" | "elevated" | "acute";
export type MessageRole = "user" | "assistant" | "system_crisis" | "system_recap";
export type MessageSource = "text" | "voice";

export interface ConversationOut {
  id: string;
  title: string;
  created_at: string;
  last_msg_at: string;
}

export interface MessageAttachment {
  kind: "image";
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data_url: string;
  name?: string | null;
}

export interface MessageOut {
  id: string;
  role: MessageRole;
  source: MessageSource;
  content: string;
  risk_level: Risk | null;
  created_at: string;
  attachments?: MessageAttachment[] | null;
}

export interface MeOut {
  id: string;
  email: string;
  display_name: string | null;
  today_text_msg_count: number;
  daily_text_msg_cap: number;
  voice_seconds_used_today: number;
  voice_seconds_cap: number;
  onboarded_at: string | null;
}

export interface MoodOut {
  date: string;
  score: number; // 1–5
  note: string | null;
  created_at: string;
}

export interface OnboardingIn {
  display_name?: string | null;
  bringing_you_here?: string | null;
  what_helps?: string | null;
  support?: string | null;
  accept_terms: boolean;
}

export interface InsightRecap {
  id: string;
  conversation_id: string;
  conversation_title: string;
  source: MessageSource;
  content: string;
  created_at: string;
}

export interface InsightsOut {
  profile: Record<string, unknown>;
  summary: string;
  recent_recaps: InsightRecap[];
}

// Mirrors apps/api/app/schemas/profile.py — every field optional, arrays
// default to empty. The Companion populates this from conversation; the
// /profile page lets the user inspect and edit it directly.
export interface Stressor {
  label: string;
  first_seen?: string | null;
  intensity?: number | null;
}
export interface CopingStrategy {
  label: string;
  effective?: boolean | null;
}
export interface SleepPatterns {
  typical_hours?: number | null;
  issues?: string[];
}
export interface Goal {
  label: string;
  set_at?: string | null;
}
export interface NotableEvent {
  label: string;
  date?: string | null;
}
export interface UserProfileShape {
  stressors?: Stressor[];
  coping_strategies?: CopingStrategy[];
  support_system?: string[];
  sleep_patterns?: SleepPatterns | null;
  goals?: Goal[];
  notable_events?: NotableEvent[];
}

export interface ProfileOut {
  display_name: string | null;
  email: string;
  profile: UserProfileShape;
  summary: string;
}

export interface ProfileUpdateIn {
  display_name?: string | null;
  summary?: string;
  profile?: UserProfileShape;
}

export type SseEvent =
  | { type: "started"; message_id: string; risk: Risk; kind: "normal" | "crisis_card" }
  | { type: "token"; text: string }
  | { type: "done"; total_tokens: number }
  | { type: "error"; error: string };
