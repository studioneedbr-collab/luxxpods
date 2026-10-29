import "server-only";
import { memoCurta } from "./memo-curta";
import { clienteDoSistema } from "./supabase/sistema";
import { STORE_ID } from "./supabase/config";
import { PADRAO, type ChaveConfig, type Configuracoes } from "./configuracoes";

/**
 * As configurações lidas SEM sessão.
 *
 * `lerConfiguracoes` em actions-config.ts usa o cliente de sessão, e está
 * certo: quem a chama é uma tela, com alguém logado. O bot não tem ninguém
 * logado — ele roda a partir de um webhook do WhatsApp. Chamar aquela de cá
 * faria o RLS devolver zero linha, e o bot atenderia com a configuração
 * padrão achando que era a da loja: horário errado, taxa errada, prompt sem
 * o treinamento que o dono escreveu.
 *
 * Mesmo erro que já apareceu no webhook, na fila e no cron.
 */
/**
 * Reaproveitada por 5s: o bot lia as mesmas configurações de 3 a 5 vezes por
 * mensagem (horário, follow-up, IA, pagamento, fila).
 */
export const lerConfiguracoesDoSistema = memoCurta(5_000, lerDoBanco);

async function lerDoBanco(): Promise<Configuracoes> {
  const c = await clienteDoSistema();
  if (!c) return PADRAO;

  const { data, error } = await c.from("settings")
    .select("chave, valor").eq("store_id", STORE_ID);

  if (error) {
    console.error(`[luxx] não li as configurações: ${error.message}`);
    return PADRAO;
  }

  const salvas: Partial<Configuracoes> = {};
  for (const linha of data ?? []) {
    const chave = linha.chave as ChaveConfig;
    if (chave in PADRAO) {
      salvas[chave] = { ...PADRAO[chave], ...(linha.valor as object) } as never;
    }
  }

  return { ...PADRAO, ...salvas };
}
