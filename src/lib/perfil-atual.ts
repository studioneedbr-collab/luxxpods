import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O id do PERFIL de quem está logado — não o do Auth.
 *
 * Parecem a mesma coisa (o perfil usa o id do usuário do Auth como chave),
 * mas só até alguém entrar sem ter perfil: aí o id existe e a linha não, e
 * gravar esse id em `atendente_id` estoura a chave estrangeira do pedido com
 * uma mensagem que não ajuda ninguém. Melhor registrar o pedido sem atendente
 * do que não registrar o pedido.
 */
export async function perfilAtual(
  c: SupabaseClient,
): Promise<{ id: string | null; semPerfil: boolean }> {
  const { data: user } = await c.auth.getUser();
  const authId = user?.user?.id ?? null;
  if (!authId) return { id: null, semPerfil: false };

  const { data: perfil } = await c
    .from("profiles").select("id").eq("id", authId).maybeSingle();

  if (!perfil) {
    console.warn(
      `[luxx] usuário ${authId} está logado sem perfil em profiles — ` +
      `as gravações vão falhar no controle de acesso`,
    );
    return { id: null, semPerfil: true };
  }

  return { id: perfil.id, semPerfil: false };
}
