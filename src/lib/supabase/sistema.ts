import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";
import { SUPABASE_SECRET_KEY } from "./segredo";

/**
 * O cliente das rotinas que rodam sem ninguém logado.
 *
 * Webhook de pagamento, webhook do WhatsApp, motor do bot e fila de tarefas
 * não têm usuário: quem chama é o gateway, a Meta ou o cron. Usar o cliente
 * de sessão nesses caminhos faz o controle de acesso do banco negar tudo —
 * e nega do pior jeito possível, porque o pagamento chega, o webhook devolve
 * erro, o provedor reenvia para sempre e o pedido nunca confirma.
 *
 * Aqui quem age é o sistema, então a chave de serviço é a certa. Em troca,
 * NENHUM dado desses caminhos vem do navegador sem passar por validação: o
 * webhook confere assinatura e valor, e o bot só executa pelas ferramentas
 * declaradas. A chave abre o banco inteiro; é o preço de rodar sem sessão.
 */
export async function clienteDoSistema() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    if (SUPABASE_URL) {
      console.error(
        "[luxx] falta SUPABASE_SECRET_KEY: webhook, bot e fila não conseguem " +
        "gravar, porque rodam sem sessão e o controle de acesso nega.",
      );
    }
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

/** O tipo do cliente, para as funções que o recebem por parâmetro. */
export type ClienteSistema = NonNullable<Awaited<ReturnType<typeof clienteDoSistema>>>;
