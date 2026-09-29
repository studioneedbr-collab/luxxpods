/**
 * Credenciais do Supabase.
 *
 * O Supabase trocou o nome das chaves: o que era `anon` virou `publishable`
 * e o `service_role` virou `secret`. Aceitamos os dois nomes porque o painel
 * do Supabase mostra um ou outro dependendo de quando o projeto foi criado —
 * e uma variável com o nome errado deixaria o sistema achando que não tem
 * banco, caindo na base de demonstração sem avisar ninguém.
 */

/** Sem a barra no fim: ela viraria `//rest/v1` nas URLs montadas. */
export const SUPABASE_URL =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/**
 * A chave que ignora RLS. Só existe no servidor — se aparecer com prefixo
 * NEXT_PUBLIC_ ela vai para o navegador e qualquer pessoa lê o banco inteiro.
 */
export const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

/** Loja padrão da operação (multiloja já preparado no schema). */
export const STORE_ID =
  process.env.NEXT_PUBLIC_STORE_ID ?? "22222222-2222-2222-2222-222222222222";

/** Quando não há credenciais, o painel roda com a base de demonstração. */
export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
