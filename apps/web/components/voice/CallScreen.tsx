"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Track,
} from "livekit-client";
import { requestVoiceToken } from "@/lib/api/voice";
import { cn } from "@/lib/cn";
import type { MessageRole } from "@/lib/api/types";

type CallState =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "ending"
  | "error";
type ErrorKind = "mic_permission" | "no_mic" | "generic";

// Topic the voice worker publishes transcript packets on. Must match
// TRANSCRIPT_TOPIC in apps/voice-worker/worker/companion_llm.py.
const TRANSCRIPT_TOPIC = "mwc-transcript";

export type LiveTranscript =
  // Final whole turn (e.g. the user's spoken transcript once Deepgram
  // finalizes, or a crisis card).
  | { kind: "final"; id?: string; role: MessageRole; content: string }
  // Incremental token from the assistant — append to bubble matched by id.
  | { kind: "delta"; id: string; role: MessageRole; delta: string }
  // Stream ended for a bubble — replace its content with `content` (covers
  // any deltas that may have been dropped over the data channel).
  | { kind: "end"; id: string; role: MessageRole; content: string };

interface Props {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
  onCallEnded: () => void;
  // Fires once per finalized turn during a call so the chat thread can
  // append a bubble in real time.
  onLiveTranscript?: (t: LiveTranscript) => void;
}

function MicOnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CallScreen({
  open,
  conversationId,
  onClose,
  onCallEnded,
  onLiveTranscript,
}: Props) {
  const [state, setState] = useState<CallState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.disconnect().catch(() => {});
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
  }, []);

  const startCall = useCallback(async () => {
    if (!conversationId) return;
    setErrorMsg(null);
    setErrorKind(null);
    setElapsed(0);
    setMuted(false);
    setState("requesting");

    const tokenRes = await requestVoiceToken(conversationId);
    if (!tokenRes.ok) {
      setErrorKind("generic");
      if (tokenRes.error.kind === "daily_cap") {
        setErrorMsg("You've reached today's voice limit. Come back tomorrow.");
      } else if (tokenRes.error.kind === "global_cap") {
        setErrorMsg("Voice is temporarily unavailable. Try again later.");
      } else if (tokenRes.error.kind === "unauthenticated") {
        setErrorMsg("You need to sign in again.");
      } else {
        setErrorMsg("Couldn't start the call. Try again.");
      }
      setState("error");
      return;
    }

    setState("connecting");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = (audioElRef.current ??= document.createElement("audio"));
          el.autoplay = true;
          track.attach(el);
        }
      },
    );

    // The voice worker publishes three packet shapes on TRANSCRIPT_TOPIC:
    //   - transcript        → a whole finalized turn (e.g. user STT)
    //   - transcript_delta  → an incremental token chunk for an assistant
    //                          bubble that's still being generated
    //   - transcript_end    → that bubble is now complete (replace text)
    // The chat thread renders these as a single growing bubble, giving
    // the same typewriter feel as the text chat.
    room.on(
      RoomEvent.DataReceived,
      (payload, _participant, _kind, topic) => {
        if (topic !== TRANSCRIPT_TOPIC || !onLiveTranscript) return;
        try {
          const text = new TextDecoder().decode(payload);
          const msg = JSON.parse(text) as {
            type: string;
            id?: string;
            role: MessageRole;
            content?: string;
            delta?: string;
          };
          if (msg.type === "transcript" && msg.content) {
            onLiveTranscript({
              kind: "final",
              id: msg.id,
              role: msg.role,
              content: msg.content,
            });
          } else if (msg.type === "transcript_delta" && msg.id && msg.delta) {
            onLiveTranscript({
              kind: "delta",
              id: msg.id,
              role: msg.role,
              delta: msg.delta,
            });
          } else if (msg.type === "transcript_end" && msg.id && msg.content) {
            onLiveTranscript({
              kind: "end",
              id: msg.id,
              role: msg.role,
              content: msg.content,
            });
          }
        } catch {
          /* malformed packet, ignore */
        }
      },
    );

    room.on(RoomEvent.Disconnected, () => {
      cleanup();
      // Notify parent so it refetches messages, then close the panel.
      onCallEnded();
      onClose();
    });

    try {
      await room.connect(tokenRes.data.livekit_url, tokenRes.data.access_token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("connected");
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 500);
    } catch (e) {
      const err = e as Error;
      if (
        err.name === "NotAllowedError" ||
        (err.message || "").toLowerCase().includes("permission")
      ) {
        setErrorKind("mic_permission");
        setErrorMsg(
          "We need access to your microphone. Click the 🎤 in your browser's address bar, allow access, and try again.",
        );
      } else if (err.name === "NotFoundError") {
        setErrorKind("no_mic");
        setErrorMsg("No microphone detected. Connect one and try again.");
      } else {
        setErrorKind("generic");
        setErrorMsg("Couldn't connect. Try again in a moment.");
      }
      setState("error");
      await room.disconnect().catch(() => {});
    }
  }, [conversationId, cleanup, onCallEnded, onClose]);

  useEffect(() => {
    if (!open || !conversationId) return;
    startCall();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId]);

  async function handleHangup() {
    setState("ending");
    cleanup();
    setTimeout(() => {
      onCallEnded();
      onClose();
    }, 300);
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    setMuted(next);
    await room.localParticipant.setMicrophoneEnabled(!next);
  }

  if (!open) return null;

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  const statusLabel =
    state === "requesting" || state === "connecting"
      ? "Connecting…"
      : state === "connected"
        ? mmss(elapsed)
        : state === "ending"
          ? "Ending…"
          : state === "error"
            ? "Couldn't connect"
            : "";

  return (
    <div
      role="dialog"
      aria-label="Voice call with Companion"
      className="fixed top-4 right-4 md:top-6 md:right-6 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl shadow-2xl border border-sage-dark/40 overflow-hidden bg-gradient-to-br from-sage to-sage-dark text-cream"
    >
      {/* Header row: leaf orb + name + status */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center text-xl bg-cream/15 flex-shrink-0",
            state === "connected" && "animate-pulse-orb",
          )}
        >
          🍃
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-serif text-base leading-tight">Companion</div>
          <div className="text-[11px] opacity-75 leading-tight">{statusLabel}</div>
        </div>
        {/* Close button only visible when NOT in active call (error / ending / connecting w/ cancel) */}
        {state !== "connected" && state !== "ending" && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-cream/15 transition"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Error body (only visible in error state) */}
      {state === "error" && errorMsg && (
        <div className="px-4 pb-2">
          <p className="text-[12px] opacity-90 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {/* Controls row */}
      <div className="px-4 pb-3 flex items-center gap-2">
        {state === "connected" && (
          <>
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95",
                muted
                  ? "bg-cream text-sage"
                  : "bg-cream/15 text-cream hover:bg-cream/25",
              )}
            >
              {muted ? <MicOffIcon /> : <MicOnIcon />}
            </button>
            <div className="flex-1" />
            <button
              onClick={handleHangup}
              aria-label="End call"
              className="px-3 h-9 rounded-full bg-crisis text-cream hover:opacity-90 flex items-center gap-1.5 text-sm transition active:scale-95"
            >
              <PhoneOffIcon />
              <span>End</span>
            </button>
          </>
        )}
        {(state === "requesting" || state === "connecting") && (
          <>
            <div className="flex-1 flex items-center gap-1">
              <span className="block w-1.5 h-1.5 rounded-full bg-cream/70 animate-pulse" />
              <span className="block w-1.5 h-1.5 rounded-full bg-cream/70 animate-pulse [animation-delay:200ms]" />
              <span className="block w-1.5 h-1.5 rounded-full bg-cream/70 animate-pulse [animation-delay:400ms]" />
            </div>
            <button
              onClick={onClose}
              className="px-3 h-8 rounded-full bg-cream/15 hover:bg-cream/25 text-xs transition"
            >
              Cancel
            </button>
          </>
        )}
        {state === "error" && (
          <>
            {(errorKind === "mic_permission" || errorKind === "no_mic") && (
              <button
                onClick={() => startCall()}
                className="px-3 h-8 rounded-full bg-cream text-sage hover:opacity-90 text-xs transition"
              >
                Try again
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-3 h-8 rounded-full bg-cream/15 hover:bg-cream/25 text-xs transition"
            >
              Close
            </button>
          </>
        )}
        {state === "ending" && (
          <div className="text-xs opacity-70 flex-1 text-center py-2">Goodbye 🍃</div>
        )}
      </div>
    </div>
  );
}
