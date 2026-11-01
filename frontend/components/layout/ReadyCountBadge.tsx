"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthMode } from "@/lib/auth";
import { getSessionToken } from "@/lib/auth-token";
import { fetchToPromote, type ToPromote } from "@/lib/to-promote";

export interface ReadyCountBadgeProps {
  fetcher?: () => Promise<ToPromote>;
}

const defaultFetcher = () => fetchToPromote();

/** Same condition the rest of the app uses to call the API: dev mode, or supabase mode with a session. */
async function canCallApi(): Promise<boolean> {
  try {
    if (getAuthMode() === "dev") return true;
    return Boolean(await getSessionToken());
  } catch {
    return false;
  }
}

/** Number of projects ready to promote, next to «Por promover». Hidden for 0, while loading and on any failure. */
export function ReadyCountBadge({ fetcher = defaultFetcher }: ReadyCountBadgeProps) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Each run owns its flag: a navigation or unmount makes an older response stale.
    let stale = false;
    (async () => {
      try {
        if (!(await canCallApi())) throw new Error("no access");
        const { readyCount } = await fetcher();
        if (!stale) setCount(readyCount);
      } catch {
        if (!stale) setCount(0);
      }
    })();
    return () => {
      stale = true;
    };
  }, [fetcher, pathname]);

  if (count <= 0) return null;
  return (
    <span
      role="img"
      aria-label={`${count} ${count === 1 ? "proyecto listo" : "proyectos listos"} para promover`}
      className="ml-auto min-w-5 rounded-full bg-side-ink px-1.5 py-px text-center text-xs font-medium tabular-nums text-side"
    >
      {count}
    </span>
  );
}
