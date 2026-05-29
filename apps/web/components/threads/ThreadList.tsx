"use client";

import type { ConversationOut } from "@/lib/api/types";
import { cn } from "@/lib/cn";

function groupByRecency(items: ConversationOut[]) {
  const now = Date.now();
  const day = 86_400_000;
  const out: Record<string, ConversationOut[]> = {
    Today: [],
    "Earlier this week": [],
    Earlier: [],
  };
  for (const c of items) {
    const age = now - new Date(c.last_msg_at).getTime();
    if (age < day) out.Today.push(c);
    else if (age < 7 * day) out["Earlier this week"].push(c);
    else out.Earlier.push(c);
  }
  return out;
}

export function ThreadList({
  items,
  activeId,
  onPick,
  onNew,
}: {
  items: ConversationOut[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const groups = groupByRecency(items);
  return (
    <div className="flex flex-col h-full">
      <h2 className="font-serif text-lg text-sage px-2 pb-3 pt-1 border-b border-cream-edge mb-2">
        🍃 Wellbeing
      </h2>
      <button
        onClick={onNew}
        className="bg-sage text-cream text-sm rounded-lg px-3 py-2.5 text-left mb-3 hover:bg-sage-dark"
      >
        + New conversation
      </button>
      <div className="flex-1 overflow-y-auto space-y-2">
        {Object.entries(groups).map(([label, list]) =>
          list.length === 0 ? null : (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wider text-sage-light px-2 pb-1 pt-2">
                {label}
              </div>
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onPick(c.id)}
                  className={cn(
                    "block w-full text-left text-sm px-3 py-2 rounded-lg truncate",
                    c.id === activeId
                      ? "bg-cream-edge text-ink font-medium"
                      : "text-sage-light hover:bg-cream-warm",
                  )}
                >
                  {c.title}
                </button>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
