import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };
import { supabaseEnv } from "./env";

/**
 * Per-request client bound to the user's cookie session. Server Components can't
 * write cookies, so setAll is a no-op there; middleware refreshes the session.
 */
export async function supabaseServer() {
  const store = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: ignore, middleware handles refresh.
        }
      },
    },
  });
}

/**
 * The verified user for this request, or null. getUser() asks Supabase Auth to
 * validate the JWT; never use getSession() for authorization on the server.
 */
export async function currentUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null } as const;
  return { supabase, user: data.user } as const;
}
