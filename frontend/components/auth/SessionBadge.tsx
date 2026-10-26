"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { AuthClient } from "@/lib/auth";
import { roleLabel } from "@/lib/me";

export type SessionBadgeProps = {
  client: AuthClient;
  email: string;
  role: string | null;
  onSignedOut: () => void;
};

export function SessionBadge({ client, email, role, onSignedOut }: SessionBadgeProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    setPending(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      onSignedOut();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-s font-medium text-ink">{email}</span>
        <span className="text-xs text-muted">{roleLabel(role)}</span>
      </div>
      <Button size="sm" onClick={signOut} disabled={pending} aria-busy={pending}>
        <LogOut size={14} aria-hidden="true" />
        Cerrar sesión
      </Button>
      {failed ? <Notice tone="bad">No se pudo cerrar la sesión. Inténtalo de nuevo.</Notice> : null}
    </div>
  );
}
