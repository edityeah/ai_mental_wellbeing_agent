import { cn } from "@/lib/cn";

export function QuotaFooter({
  used,
  cap,
}: {
  used: number;
  cap: number;
}) {
  const ratio = used / cap;
  return (
    <div
      className={cn(
        "text-right text-[11px] px-4 pb-1 pt-0.5",
        ratio < 0.9 ? "text-mute" : ratio < 1 ? "text-[#B58A3C]" : "text-crisis",
      )}
    >
      {used} / {cap} messages today
    </div>
  );
}
