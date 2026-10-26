"use client";

import { useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { getAuthClient } from "@/lib/supabase/client";

export function LoginScreen({ callbackUrl, error }: { callbackUrl: string; error?: string | null }) {
  const [client] = useState(getAuthClient);
  return <LoginForm client={client} callbackUrl={callbackUrl} error={error} />;
}
