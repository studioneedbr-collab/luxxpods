import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL, supabaseConfigurado,
} from "./config";

export async function getSupabaseServer() {
  if (!supabaseConfigurado) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* chamado de um Server Component — middleware cuida da renovação */
        }
      },
    },
  });
}

/** Cliente com service_role para rotinas de servidor (webhooks, jobs). */
export function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}
