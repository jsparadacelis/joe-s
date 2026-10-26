"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { getLoginNotice, type AuthClient } from "@/lib/auth";

const SIGN_IN_FAILED = "No se pudo iniciar sesión con Google. Inténtalo de nuevo.";

export type LoginFormProps = {
  client: AuthClient;
  /** Absolute URL of `/auth/callback`, where Google sends the person back. */
  callbackUrl: string;
  /** Value of `?error=`; only known codes are shown. */
  error?: string | null;
};

export function LoginForm({ client, callbackUrl, error }: LoginFormProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const notice = getLoginNotice(error);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  async function signIn() {
    if (startedRef.current) return;
    startedRef.current = true;
    setFailed(false);
    setPending(true);
    try {
      const { error: signInError } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl } });
      if (signInError) throw signInError;
      // On success the browser leaves for Google; the button stays busy until then.
    } catch {
      startedRef.current = false;
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 py-16">
      <h1 className="text-xl font-semibold">Entrar en RGB Proyectos</h1>
      {notice ? (
        <Notice tone="bad" ref={noticeRef} tabIndex={-1}>
          {notice}
        </Notice>
      ) : null}
      <Panel title="Acceso con cuenta de Google" description="Solo pueden entrar las personas invitadas por el estudio.">
        <Button variant="primary" onClick={signIn} disabled={pending} aria-busy={pending} className="justify-center">
          {pending ? "Redirigiendo a Google…" : "Entrar con Google"}
        </Button>
        {failed ? <Notice tone="bad">{SIGN_IN_FAILED}</Notice> : null}
      </Panel>
    </div>
  );
}
