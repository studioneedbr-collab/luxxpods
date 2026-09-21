export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Loja padrão da operação (multiloja já preparado no schema). */
export const STORE_ID =
  process.env.NEXT_PUBLIC_STORE_ID ?? "22222222-2222-2222-2222-222222222222";

/** Quando não há credenciais, o painel roda com a base de demonstração. */
export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
