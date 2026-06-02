"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationOut } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { UserMenu } from "./UserMenu";
import { LogoWordmark } from "@/components/brand/Logo";

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

function ThreadRow({
  conv,
  active,
  onPick,
  onRename,
  onDelete,
}: {
  conv: ConversationOut;
  active: boolean;
  onPick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="relative group" ref={menuRef}>
      <button
        onClick={onPick}
        className={cn(
          "block w-full text-left text-sm px-3 py-2 pr-9 rounded-lg truncate",
          active
            ? "bg-cream-edge text-ink font-medium"
            : "text-sage-light hover:bg-cream-warm",
        )}
      >
        {conv.title}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label="Conversation actions"
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded flex items-center justify-center text-sage-light hover:bg-cream-edge",
          // Always visible on the active row + on hover via group
          active
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100",
        )}
      >
        ⋯
      </button>
      {menuOpen && (
        <div className="absolute right-1 top-full mt-1 z-20 bg-white border border-cream-edge rounded-lg shadow-lg py-1 w-32 text-sm">
          <button
            onClick={() => {
              setMenuOpen(false);
              onRename();
            }}
            className="block w-full text-left px-3 py-1.5 text-ink hover:bg-cream-warm"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="block w-full text-left px-3 py-1.5 text-crisis hover:bg-cream-warm"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function ThreadList({
  items,
  activeId,
  onPick,
  onNew,
  onRename,
  onDelete,
}: {
  items: ConversationOut[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, currentTitle: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const groups = groupByRecency(items);
  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pb-3 pt-1 border-b border-cream-edge mb-2">
        <LogoWordmark size={26} />
      </div>
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
                <ThreadRow
                  key={c.id}
                  conv={c}
                  active={c.id === activeId}
                  onPick={() => onPick(c.id)}
                  onRename={() => onRename(c.id, c.title)}
                  onDelete={() => onDelete(c.id, c.title)}
                />
              ))}
            </div>
          ),
        )}
      </div>
      <UserMenu />
    </div>
  );
}
