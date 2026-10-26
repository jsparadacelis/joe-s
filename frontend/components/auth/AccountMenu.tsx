"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionBadge } from "@/components/auth/SessionBadge";
import { ApiError, createApiClient } from "@/lib/api";
import { MFA_HINT_COOKIE, resolveApiError } from "@/lib/auth";
import { fetchMe } from "@/lib/me";
import { getAuthClient, getBrowserToken, getSupabaseBrowserClient } from "@/lib/supabase/client";

function setMfaHint(on: boolean) {
  document.cookie = `${MFA_HINT_COOKIE}=${on ? "1" : ""}; path=/; SameSite=Lax; Max-Age=${on ? 3600 : 0}`;
}

/**
 * Header slot in supabase mode: shows who is signed in (session email + role from `GET /api/me`)
 * and sends the person to the access screen the API asks for.
 */
export function AccountMenu() {
  const router = useRouter();
  const [account, setAccount] = useState<{ email: string; role: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (!email) return;
      try {
        const me = await fetchMe(createApiClient({ getToken: getBrowserToken }));
        if (active) setAccount({ email, role: me.role });
      } catch (error) {
        const redirect = error instanceof ApiError ? resolveApiError(error) : null;
        if (!redirect) {
          if (active) setAccount({ email, role: null });
          return;
        }
        if (redirect.destination === "/login/mfa") {
          setMfaHint(true);
        } else {
          // Leaving the session open would make the proxy bounce the person back here in a loop.
          setMfaHint(false);
          await supabase.auth.signOut();
        }
        router.replace(redirect.destination);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (!account) return null;
  return (
    <SessionBadge
      client={getAuthClient()}
      email={account.email}
      role={account.role}
      onSignedOut={() => {
        setMfaHint(false);
        router.replace("/login");
        router.refresh();
      }}
    />
  );
}
