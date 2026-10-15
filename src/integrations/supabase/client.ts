import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Première valeur renseignée (une variable vide compte comme absente). */
function firstSet(...values: (string | undefined)[]) {
  return values.find((v) => v);
}

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL = firstSet(import.meta.env.VITE_SUPABASE_URL, process.env.SUPABASE_URL);
  const SUPABASE_PUBLISHABLE_KEY = firstSet(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  );

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(SUPABASE_URL ? [] : ["SUPABASE_URL"]),
      ...(SUPABASE_PUBLISHABLE_KEY ? [] : ["SUPABASE_PUBLISHABLE_KEY"]),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env (see .env.example).`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window === "undefined" ? undefined : globalThis.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    _supabase ??= createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
