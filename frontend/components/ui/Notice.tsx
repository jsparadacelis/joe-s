import type { ReactNode, Ref } from "react";

export type NoticeTone = "info" | "ok" | "warn" | "bad";

export type NoticeProps = {
  tone?: NoticeTone;
  children: ReactNode;
  /** Lets a field point to the notice with `aria-describedby`. */
  id?: string;
  /** `-1` makes the notice focusable by script, to move focus to an error. */
  tabIndex?: number;
  ref?: Ref<HTMLDivElement>;
};

const TONES: Record<NoticeTone, string> = {
  info: "bg-surface-2 text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Notice({ tone = "info", children, id, tabIndex, ref }: NoticeProps) {
  // Error notices interrupt (alert); the rest are announced politely (status).
  const role = tone === "bad" ? "alert" : "status";
  return (
    <div id={id} ref={ref} tabIndex={tabIndex} role={role} className={`rounded-base px-3 py-2.5 text-s ${TONES[tone]}`}>
      {children}
    </div>
  );
}
