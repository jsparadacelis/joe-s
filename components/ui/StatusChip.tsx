import type { ReactNode } from "react";

export type StatusTone = "neutral" | "ok" | "warn" | "bad" | "point" | "off";
export type StatusChipVariant = "tag" | "traffic-light";

export type StatusChipProps = {
  tone?: StatusTone;
  /** `tag`: label with a soft background. `traffic-light`: pill with a coloured dot. */
  variant?: StatusChipVariant;
  children: ReactNode;
};

const TAG_TONES: Record<StatusTone, string> = {
  neutral: "bg-surface-2 text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  point: "bg-point-soft text-point",
  off: "bg-off-soft text-muted",
};

const DOT_TONES: Record<StatusTone, string> = {
  neutral: "bg-off",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  point: "bg-point",
  off: "bg-off",
};

export function StatusChip({ tone = "neutral", variant = "tag", children }: StatusChipProps) {
  if (variant === "traffic-light") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-2 py-[3px] text-xs font-medium text-ink-2">
        <span aria-hidden="true" className={`size-2 flex-none rounded-full ${DOT_TONES[tone]}`} />
        {children}
      </span>
    );
  }
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-base px-2 py-[3px] text-xs font-medium ${TAG_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
