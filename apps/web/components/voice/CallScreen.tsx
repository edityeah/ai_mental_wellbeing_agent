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

function MicOnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

type CallState = "idle" | "requesting" | "connecting" | "connected" | "ending" | "error";
type ErrorKind = "mic_permission" | "no_mic" | "generic";

interface Props {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
  /** Called when the call ends successfully (so parent can refetch messages). */
  onCallEnded: () => void;
}

export function CallScreen({ open, conversationId, onClose, onCallEnded }: Props) {
  const [state, setState] = useState<CallState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const startCall = useCallback(async () => {
    if (!conversationId) return;
    cancelledRef.current = false;
    setErrorMsg(null);
    setErrorKind(null);
    setElapsed(0);
    setMuted(false);
    setState("requesting");
    const tokenRes = await requestVoiceToken(conversationId);
    if (cancelledRef.current) return;
    if (!tokenRes.ok) {
      if (tokenRes.error.kind === "daily_cap") {
        setErrorMsg("You've reached today's voice limit. Come back tomorrow.");
      } else if (tokenRes.error.kind === "global_cap") {
        setErrorMsg("Voice is temporarily unavailable. Please try again later.");
      } else if (tokenRes.error.kind === "unauthenticated") {
        setErrorMsg("You need to sign in again.");
      } else {
        setErrorMsg("Couldn't start the call. Try again.");
      }
      setErrorKind("generic");
      setState("error");
      return;
    }

    setState("connecting");
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    // Play the agent's audio track when it comes in
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

    room.on(RoomEvent.Disconnected, () => {
      // Agent shut us down (crisis redirect / quota / etc) OR network died.
      // Either way: end the call gracefully.
      finishCall();
    });

    try {
      await room.connect(tokenRes.data.livekit_url, tokenRes.data.access_token);
      if (cancelledRef.current) {
        await room.disconnect();
        return;
      }
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("connected");
      // start elapsed timer
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 500);
    } catch (e) {
      const err = e as Error;
      const msg = (err?.message ?? "").toLowerCase();
      if (err?.name === "NotAllowedError" || msg.includes("permission")) {
        setErrorMsg(
          "We need access to your microphone to start a call. Tap the 🎤 icon in your browser's address bar, allow access, and try again.",
        );
        setErrorKind("mic_permission");
      } else if (err?.name === "NotFoundError") {
        setErrorMsg("No microphone detected. Connect one and try again.");
        setErrorKind("no_mic");
      } else {
        setErrorMsg("Couldn't connect. Try again in a moment.");
        setErrorKind("generic");
      }
      setState("error");
      await room.disconnect().catch(() => {});
    }
  }, [conversationId]);

  // Connect when modal opens
  useEffect(() => {
    if (!open || !conversationId) return;
    startCall();

    return () => {
      cancelledRef.current = true;
      finishCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId]);

  function finishCall() {
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
  }

  async function handleHangup() {
    setState("ending");
    finishCall();
    // Give the parent a moment to refetch
    setTimeout(() => {
      onCallEnded();
      onClose();
    }, 400);
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    setMuted(next);
    await room.localParticipant.setMicrophoneEnabled(!next);
  }

  function dismissError() {
    onClose();
  }

  // ESC closes when not in active call
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (state === "connected") {
          handleHangup();
        } else if (state === "error" || state === "requesting") {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state]);

  if (!open) return null;

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Dark sage gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-sage to-sage-dark" />

      <div className="relative h-full flex flex-col items-center justify-between text-cream px-6 py-10">
        {/* Top: status + timer */}
        <div className="text-center pt-10 md:pt-16">
          <div className="text-[11px] tracking-[0.15em] uppercase opacity-70 mb-1">
            {state === "requesting" && "Connecting"}
            {state === "connecting" && "Connecting"}
            {state === "connected" && "Connected"}
            {state === "ending" && "Ending"}
            {state === "error" && "Connection error"}
            {state === "idle" && ""}
          </div>
          <div className="font-serif text-2xl">Companion</div>
          {state === "connected" && (
            <div className="text-sm opacity-75 mt-1">{mmss(elapsed)}</div>
          )}
        </div>

        {/* Middle: orb */}
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "w-36 h-36 rounded-full flex items-center justify-center text-5xl mb-6",
              state === "connected" && "animate-pulse-orb bg-cream/15",
              state !== "connected" && "bg-cream/10",
            )}
          >
            🍃
          </div>
          {state === "error" && errorMsg && (
            <p className="text-sm opacity-90 max-w-xs text-center mb-2">
              {errorMsg}
            </p>
          )}
          {state === "connected" && (
            <p className="text-sm opacity-80 max-w-xs text-center">
              Take a breath whenever you need. I&apos;m here.
            </p>
          )}
        </div>

        {/* Bottom: controls */}
        <div className="flex items-center gap-6 pb-8 md:pb-12">
          {state === "connected" && (
            <>
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition active:scale-95",
                  muted ? "bg-cream text-sage" : "bg-cream/15 text-cream hover:bg-cream/25",
                )}
              >
                {muted ? <MicOffIcon /> : <MicOnIcon />}
              </button>
              <button
                onClick={handleHangup}
                aria-label="End call"
                className="w-16 h-16 rounded-full bg-crisis text-cream hover:opacity-90 flex items-center justify-center transition active:scale-95 shadow-lg"
              >
                <PhoneOffIcon />
              </button>
              <button
                disabled
                aria-label="Speaker (always on for now)"
                className="w-14 h-14 rounded-full bg-cream/15 text-cream flex items-center justify-center opacity-50"
              >
                <SpeakerIcon />
              </button>
            </>
          )}
          {(state === "requesting" || state === "connecting") && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-full bg-cream/15 hover:bg-cream/25"
            >
              Cancel
            </button>
          )}
          {state === "error" && (
            <>
              {(errorKind === "mic_permission" || errorKind === "no_mic") && (
                <button
                  onClick={() => startCall()}
                  className="px-4 py-2 text-sm rounded-full bg-cream text-sage hover:opacity-90"
                >
                  Try again
                </button>
              )}
              <button
                onClick={dismissError}
                className={cn(
                  "px-4 py-2 text-sm rounded-full hover:opacity-90",
                  errorKind === "mic_permission" || errorKind === "no_mic"
                    ? "bg-cream/15 text-cream"
                    : "bg-cream text-sage",
                )}
              >
                Close
              </button>
            </>
          )}
          {state === "ending" && (
            <div className="text-sm opacity-70">Call ended</div>
          )}
        </div>
      </div>
    </div>
  );
}
