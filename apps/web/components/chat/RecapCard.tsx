"use client";

/**
 * Care Plan card — rendered at the end of a substantive conversation as
 * a distinct, re-readable summary. Persisted as a `system_recap` message
 * by the voice worker (apps/voice-worker/worker/recap.py) so it survives
 * across sessions and accumulates over time.
 *
 * The recap text comes back loosely structured, with section labels on
 * their own lines:
 *   What we talked about
 *   What's already working for you
 *   A few small things to try
 *   When to check back in
 *
 * We split on these labels and render each section as a card row. If the
 * model omits a section (genuinely no signal), we just don't render it.
 */

const SECTION_LABELS = [
  "What we talked about",
  "What's already working for you",
  "A few small things to try",
  "When to check back in",
] as const;

function parseSections(text: string): Array<{ label: string; body: string }> {
  const out: Array<{ label: string; body: string }> = [];
  // Build a regex that matches any of the labels at the start of a line.
  const labelPattern = SECTION_LABELS.map((l) =>
    l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const re = new RegExp(`^(${labelPattern})\\s*$`, "gmi");

  // Find label positions
  const matches: Array<{ label: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ label: m[1], start: m.index, end: m.index + m[0].length });
  }

  if (matches.length === 0) {
    // Unstructured — just show the whole text as the body of one section.
    return [{ label: "Your care plan", body: text.trim() }];
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = text
      .slice(cur.end, next ? next.start : text.length)
      .trim();
    if (body) out.push({ label: cur.label, body });
  }
  return out;
}

export function RecapCard({ content }: { content: string }) {
  const sections = parseSections(content);

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] md:max-w-[640px] w-full bg-gradient-to-br from-cream-edge to-cream border border-sage/30 rounded-bubble rounded-bl-md shadow-sm overflow-hidden">
        {/* Header strip */}
        <div className="bg-sage/10 px-4 py-2 border-b border-sage/20 flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-sage"
            aria-hidden
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
          <span className="text-sage text-xs font-medium tracking-wide uppercase">
            Care Plan
          </span>
        </div>

        {/* Sections */}
        <div className="px-4 py-3 space-y-3">
          {sections.map((s, idx) => (
            <div key={idx}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-sage-light mb-1">
                {s.label}
              </div>
              <p className="text-sm text-ink whitespace-pre-line leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
