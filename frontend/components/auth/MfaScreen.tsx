"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MfaPanel } from "@/components/auth/MfaPanel";
import { MFA_HINT_COOKIE } from "@/lib/auth";
import { getAuthClient } from "@/lib/supabase/client";

export function MfaScreen() {
  const router = useRouter();
  const [client] = useState(getAuthClient);
  return (
    <MfaPanel
      client={client}
      onVerified={() => {
        document.cookie = `${MFA_HINT_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`;
        router.replace("/");
        router.refresh();
      }}
    />
  );
}
