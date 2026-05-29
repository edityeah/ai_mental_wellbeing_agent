import { cn } from "@/lib/cn";
import type { MessageRole } from "@/lib/api/types";

export function MessageBubble({
  role,
  content,
}: {
  role: MessageRole;
  content: string;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] md:max-w-[70%] bg-sage text-cream px-4 py-2.5 rounded-bubble rounded-br-md text-sm leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] md:max-w-[75%] bg-white text-ink px-4 py-3 rounded-bubble rounded-bl-md text-sm leading-relaxed border border-cream-edge whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}
