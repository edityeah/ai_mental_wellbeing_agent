"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";
import type { MessageAttachment } from "@/lib/api/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB raw

export function Composer({
  disabled,
  onSend,
  disabledReason,
}: {
  disabled: boolean;
  // onSend now optionally accepts attachments alongside the text.
  onSend: (text: string, attachments?: MessageAttachment[]) => void;
  disabledReason?: string;
}) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height =
      Math.min(taRef.current.scrollHeight, 160) + "px";
  }, [value]);

  function submit() {
    const text = value.trim();
    if (disabled) return;
    // Either text OR attachments are required — empty submissions are no-op.
    if (!text && attachments.length === 0) return;
    onSend(text, attachments.length ? attachments : undefined);
    setValue("");
    setAttachments([]);
    setAttachError(null);
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

  async function handleFilesPicked(files: FileList | null) {
    if (!files) return;
    setAttachError(null);
    const allowedMimes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
    const next: MessageAttachment[] = [...attachments];
    for (const f of Array.from(files)) {
      if (!allowedMimes.has(f.type)) {
        setAttachError(
          "Only images for now (PNG, JPG, WebP, GIF). PDFs are coming.",
        );
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setAttachError("Image is too large — please pick one under 5MB.");
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(f);
        next.push({
          kind: "image",
          mime: f.type as MessageAttachment["mime"],
          data_url: dataUrl,
          name: f.name,
        });
      } catch {
        setAttachError("Couldn't read that file. Try again.");
      }
    }
    setAttachments(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="border-t border-cream-edge bg-cream pb-[env(safe-area-inset-bottom)]">
      {disabled && disabledReason && (
        <div className="text-center text-xs text-crisis px-4 pt-2">
          {disabledReason}
        </div>
      )}

      {/* Attachment previews above the input */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 md:px-6 pt-3">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-cream-edge bg-white group"
              title={a.name ?? ""}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.data_url}
                alt={a.name ?? "attachment"}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setAttachments(attachments.filter((_, j) => j !== i))
                }
                aria-label="Remove"
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/80 text-cream text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {attachError && (
        <div className="text-xs text-crisis px-4 pt-2">{attachError}</div>
      )}

      <div className="flex items-end gap-2 px-3 md:px-6 py-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => handleFilesPicked(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Attach image"
          title="Attach image"
          className="w-9 h-9 rounded-full flex items-center justify-center border border-cream-edge bg-white text-sage hover:bg-sage/5 transition flex-shrink-0"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

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
            "w-9 h-9 rounded-full flex items-center justify-center border border-cream-edge flex-shrink-0",
            recording ? "bg-crisis text-cream" : "bg-white text-sage",
          )}
        >
          🎤
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={
            disabled || (!value.trim() && attachments.length === 0)
          }
          aria-label="Send"
          className="w-9 h-9 rounded-full bg-sage text-cream flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          →
        </button>
      </div>
    </div>
  );
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
