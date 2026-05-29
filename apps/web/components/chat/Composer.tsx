"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";

export function Composer({
  disabled,
  onSend,
  disabledReason,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  disabledReason?: string;
}) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height =
      Math.min(taRef.current.scrollHeight, 160) + "px";
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  function toggleDictation() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice dictation isn't supported in this browser.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const r = new SpeechRecognition();
    r.lang = "en-IN";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e: any) => {
      let acc = "";
      for (let i = 0; i < e.results.length; i++) {
        acc += e.results[i][0].transcript;
      }
      setValue(acc);
    };
    r.onend = () => setRecording(false);
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  }

  return (
    <div className="border-t border-cream-edge bg-cream pb-[env(safe-area-inset-bottom)]">
      {disabled && disabledReason && (
        <div className="text-center text-xs text-crisis px-4 pt-2">
          {disabledReason}
        </div>
      )}
      <div className="flex items-center gap-2 px-3 md:px-6 py-3">
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Share what's on your mind…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "flex-1 resize-none rounded-2xl border border-cream-edge bg-white px-4 py-2.5 text-sm placeholder:text-mute focus:border-sage focus:outline-none disabled:opacity-60",
          )}
        />
        <button
          type="button"
          onClick={toggleDictation}
          disabled={disabled}
          aria-label="Voice dictation"
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center border border-cream-edge",
            recording ? "bg-crisis text-cream" : "bg-white text-sage",
          )}
        >
          🎤
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="w-9 h-9 rounded-full bg-sage text-cream flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}
