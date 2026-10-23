import type { ReactNode } from "react";

export type NoticeTone = "info" | "ok" | "warn" | "bad";

export type NoticeProps = {
  tone?: NoticeTone;
  children: ReactNode;
};

const TONES: Record<NoticeTone, string> = {
  info: "bg-surface-2 text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Notice({ tone = "info", children }: NoticeProps) {
  // Los avisos de error interrumpen (alert); el resto se anuncia de forma cortés (status).
  const role = tone === "bad" ? "alert" : "status";
  return (
    <div role={role} className={`rounded-base px-3 py-2.5 text-s ${TONES[tone]}`}>
      {children}
    </div>
  );
}
