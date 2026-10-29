import "server-only";
import { clienteDoSistema } from "./supabase/sistema";
import type { getSupabaseServer } from "./supabase/server";

type Sessao = NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>;

/**
 * Quem pode chamar cada função crítica do banco.
 *
 * As funções que mexem em estoque, pedido e dinheiro são `security definer`
 * e estavam liberadas para qualquer sessão logada: um entregador com a chave
 * pública e o próprio login chamava mover_estoque direto pela API e zerava o
 * estoque. Desde a migração 0018 só a chave de serviço as executa, e o
 * painel passa por aqui — que confere o perfil ANTES.
 *
 * Os perfis repetem quem pode ESCREVER em cada grupo de tabelas nas
 * políticas da 0010, para o banco e o servidor dizerem a mesma coisa.
 */
const QUEM_PODE: Record<string, string[]> = {
  abrir_carrinho:        ["admin", "atendimento", "operacional"],
  adicionar_ao_carrinho: ["admin", "atendimento", "operacional"],
  remover_do_carrinho:   ["admin", "atendimento", "operacional"],
  criar_pedido:          ["admin", "atendimento", "operacional"],
  confirmar_pedido:      ["admin", "atendimento", "operacional", "financeiro"],
  cancelar_pedido:       ["admin", "atendimento", "operacional"],
  receber_na_entrega:    ["admin", "atendimento", "operacional", "financeiro"],
  finalizar_troca:       ["admin", "atendimento", "operacional"],
  reabrir_troca:         ["admin", "atendimento", "operacional"],
  mover_estoque:         ["admin", "operacional"],
  concluir_nota_entrada: ["admin", "operacional"],
  reabrir_nota_entrada:  ["admin", "operacional"],
};

// o mesmo tipo solto que o supabase-js devolve sem os tipos gerados do banco
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RespostaRpc = { data: any; error: { message: string; code?: string } | null };

/** O mesmo formato de `c.rpc(...)`, para os chamadores não mudarem. */
export async function rpcAutorizada(
  sessao: Sessao,
  nome: keyof typeof QUEM_PODE,
  args: Record<string, unknown>,
): Promise<RespostaRpc> {
  const { data: perfil, error: erroPerfil } = await sessao.rpc("meu_perfil");
  if (erroPerfil) return { data: null, error: { message: "Não consegui conferir seu perfil." } };

  if (!QUEM_PODE[nome].includes(String(perfil))) {
    return { data: null, error: { message: "Seu perfil não pode fazer isso.", code: "42501" } };
  }

  const sistema = await clienteDoSistema();
  if (!sistema) {
    // sem a chave de serviço no servidor, tenta pela sessão: antes da 0018
    // isso ainda funciona, e depois dela o banco recusa com motivo claro
    return await sessao.rpc(nome, args) as RespostaRpc;
  }
  return await sistema.rpc(nome, args) as RespostaRpc;
}
