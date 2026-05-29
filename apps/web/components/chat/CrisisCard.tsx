export function CrisisCard({ content }: { content: string }) {
  // Linkify phone numbers so they're tappable on mobile.
  const linkified = content.split(/(\b1?[\s\d-]{7,}\b)/g).map((part, i) => {
    if (/^\d[\s\d-]+$/.test(part) && part.replace(/\D/g, "").length >= 4) {
      const tel = part.replace(/\D/g, "");
      return (
        <a
          key={i}
          href={`tel:${tel}`}
          className="text-sage underline underline-offset-2 font-medium"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] md:max-w-[80%] bg-[#FFF9EE] border border-[#E7C97A] text-ink px-5 py-4 rounded-bubble rounded-bl-md text-sm leading-relaxed whitespace-pre-wrap">
        {linkified}
      </div>
    </div>
  );
}
