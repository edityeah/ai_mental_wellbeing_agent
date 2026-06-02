"use client";

/**
 * Care Plan card — the user's tangible takeaway from a substantive
 * conversation. Designed to feel like collateral they'd actually pin to
 * their fridge, not a chat bubble.
 *
 * The recap text from the API comes back loosely structured, with
 * section labels on their own lines:
 *   What we talked about
 *   What's already working for you
 *   A few small things to try
 *   When to check back in
 *
 * We reframe those labels visually for motivational weight:
 *   • Strengths up front  ("You're not starting from zero")
 *   • Actions as the hero ("This week, gently")
 *   • Context + check-in as secondary footer material
 *
 * A "Save as PDF" button triggers a print stylesheet (see globals.css
 * @media print) that hides everything except the recap, laying it out
 * cleanly on a single page. Native save-as-PDF, no library needed.
 */

import { useCallback, useRef } from "react";

const SECTION_LABELS = [
  "What we talked about",
  "What's already working for you",
  "A few small things to try",
  "When to check back in",
] as const;
type SectionKey = (typeof SECTION_LABELS)[number];

interface ParsedSection {
  label: SectionKey | "raw";
  body: string;
}

function parseSections(text: string): ParsedSection[] {
  const labelPattern = SECTION_LABELS.map((l) =>
    l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const re = new RegExp(`^(${labelPattern})\\s*$`, "gmi");

  const matches: Array<{ label: SectionKey; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      label: m[1] as SectionKey,
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (matches.length === 0) {
    return [{ label: "raw", body: text.trim() }];
  }

  const out: ParsedSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = text.slice(cur.end, next ? next.start : text.length).trim();
    if (body) out.push({ label: cur.label, body });
  }
  return out;
}

/** Split "A few small things to try" body into individual action lines.
 * Splits on:
 *   • blank lines
 *   • leading bullet markers (-, *, •, –, "1.", "2.")
 * Keeps order. Returns at least one element. */
function parseActions(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  // First try splitting on blank lines (paragraph breaks).
  let parts = trimmed.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);

  // If we got a single chunk, try splitting on bullets/numbers at line start.
  if (parts.length <= 1) {
    parts = trimmed
      .split(/\n(?=\s*(?:[-*•–]|\d+[.)])\s+)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Strip leading bullet/number markers from each piece.
  return parts.map((p) =>
    p.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim(),
  ).filter(Boolean);
}

// ── icons ────────────────────────────────────────────────────────────────

function IconLeaf() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c.9-.62 1.8.13 1.8 1.13 0 .37-.05.74-.13 1.1A8 8 0 0 1 16 12.2c-1.5.8-3.4 1.3-5.3 1.8a4.3 4.3 0 0 0-3.1 5.5L7 21" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </svg>
  );
}
function IconAnchor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="22" x2="12" y2="8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ── card ─────────────────────────────────────────────────────────────────

export function RecapCard({ content }: { content: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sections = parseSections(content);

  // Group sections by role for layout.
  const get = (label: SectionKey) => sections.find((s) => s.label === label)?.body;
  const strengths = get("What's already working for you");
  const actionsBody = get("A few small things to try");
  const context = get("What we talked about");
  const checkin = get("When to check back in");
  const raw = sections.find((s) => s.label === "raw")?.body;

  const actions = actionsBody ? parseActions(actionsBody) : [];
  const today = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const handlePrint = useCallback(() => {
    // Tag the element so the print stylesheet can isolate it. Using a
    // data attribute lets us scope print rules to just this card without
    // a global "print mode" state.
    const el = cardRef.current;
    if (!el) return;
    el.setAttribute("data-printing", "1");
    // Wait a tick for the attribute to apply before calling print.
    requestAnimationFrame(() => {
      window.print();
      el.removeAttribute("data-printing");
    });
  }, []);

  return (
    <div className="flex justify-start care-plan-print-wrap">
      <div
        ref={cardRef}
        data-care-plan
        className="care-plan-card max-w-[92%] md:max-w-[680px] w-full bg-gradient-to-br from-cream to-cream-edge border border-sage/30 rounded-2xl shadow-md overflow-hidden"
      >
        {/* Header */}
        <div className="bg-sage text-cream px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconLeaf />
            <div className="min-w-0">
              <div className="font-serif text-base leading-tight">
                Your Care Plan
              </div>
              <div className="text-[11px] opacity-80 flex items-center gap-1 leading-tight mt-0.5">
                <IconCalendar />
                <span>{today}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="care-plan-no-print bg-cream/15 hover:bg-cream/25 text-cream rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
            aria-label="Save as PDF"
          >
            <IconDownload />
            <span className="hidden sm:inline">Save as PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-6">
          {/* If we couldn't parse sections, show raw body and bail. */}
          {raw && (
            <p className="text-sm text-ink whitespace-pre-line leading-relaxed">
              {raw}
            </p>
          )}

          {/* Strengths — framed as the anchor, sage emphasis */}
          {strengths && (
            <section>
              <div className="flex items-center gap-2 text-sage mb-2">
                <IconAnchor />
                <h3 className="font-serif text-base">
                  You&apos;re not starting from zero
                </h3>
              </div>
              <div className="bg-sage/8 border-l-4 border-sage rounded-r-lg px-4 py-3">
                <p className="text-[15px] text-ink whitespace-pre-line leading-relaxed italic">
                  {strengths}
                </p>
              </div>
            </section>
          )}

          {/* Actions — hero of the card */}
          {actions.length > 0 && (
            <section>
              <div className="flex items-center gap-2 text-sage mb-3">
                <IconSpark />
                <h3 className="font-serif text-base">This week, gently</h3>
              </div>
              <ol className="space-y-2.5">
                {actions.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-3 items-start bg-white border border-cream-edge rounded-xl px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sage text-cream text-sm font-medium flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-[15px] text-ink leading-relaxed flex-1">
                      {a}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Context — quieter footer */}
          {(context || checkin) && (
            <section className="border-t border-cream-edge pt-4 space-y-3">
              {context && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-sage-light mb-1">
                    What we talked about
                  </div>
                  <p className="text-sm text-mute leading-relaxed whitespace-pre-line">
                    {context}
                  </p>
                </div>
              )}
              {checkin && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-sage-light mb-1">
                    Check back in
                  </div>
                  <p className="text-sm text-mute leading-relaxed whitespace-pre-line">
                    {checkin}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Print-only footer — soft branding */}
          <div className="care-plan-print-only hidden text-[11px] text-mute text-center pt-2 border-t border-cream-edge">
            Generated by Wellbeing — your calm space to be heard.
          </div>
        </div>
      </div>
    </div>
  );
}
