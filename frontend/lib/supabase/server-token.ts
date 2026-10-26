import { registerServerTokenProvider } from "@/lib/auth-token";
import { getServerToken } from "@/lib/supabase/server";

// Imported for its side effect by the root layout (server only): lets the default API client send the
// session token when a Server Component fetches data.
registerServerTokenProvider(getServerToken);
