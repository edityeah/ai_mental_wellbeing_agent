import { cn } from "@/lib/cn";

interface Props {
  used: number;
  cap: number;
  voiceUsedSeconds?: number;
  voiceCapSeconds?: number;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function QuotaFooter({ used, cap, voiceUsedSeconds, voiceCapSeconds }: Props) {
  const textRatio = used / cap;
  const showVoice =
    voiceUsedSeconds !== undefined && voiceCapSeconds !== undefined;
  const voiceRatio = showVoice ? voiceUsedSeconds! / voiceCapSeconds! : 0;

  return (
    <div className="text-right text-[11px] px-4 pb-1 pt-0.5 leading-tight">
      <div
        className={cn(
          textRatio < 0.9 ? "text-mute" : textRatio < 1 ? "text-[#B58A3C]" : "text-crisis",
        )}
      >
        {used} / {cap} messages today
      </div>
      {showVoice && (
        <div
          className={cn(
            voiceRatio < 0.9 ? "text-mute" : voiceRatio < 1 ? "text-[#B58A3C]" : "text-crisis",
          )}
        >
          {fmt(voiceUsedSeconds!)} / {fmt(voiceCapSeconds!)} voice today
        </div>
      )}
    </div>
  );
}
