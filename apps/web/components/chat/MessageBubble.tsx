import { cn } from "@/lib/cn";
import type { MessageAttachment, MessageRole } from "@/lib/api/types";

export function MessageBubble({
  role,
  content,
  attachments,
}: {
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[] | null;
}) {
  const imageAttachments =
    attachments?.filter((a) => a.kind === "image") ?? [];

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] md:max-w-[70%] flex flex-col items-end gap-1.5">
          {imageAttachments.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 max-w-full">
              {imageAttachments.map((a, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={a.data_url}
                  alt={a.name ?? "attachment"}
                  className="rounded-xl border border-sage/30 max-w-[220px] object-cover"
                />
              ))}
            </div>
          )}
          {content && (
            <div
              className={cn(
                "bg-sage text-cream px-4 py-2.5 rounded-bubble rounded-br-md text-sm leading-relaxed whitespace-pre-wrap",
              )}
            >
              {content}
            </div>
          )}
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
