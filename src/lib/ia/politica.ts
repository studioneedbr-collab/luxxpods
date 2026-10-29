import { FERRAMENTAS, POR_NOME, type Ferramenta } from "../bot/ferramentas";

/**
 * O que o modelo pode tocar.
 *
 * O §24 do escopo é a régua: "o modelo de IA nunca deverá executar
 * diretamente alterações críticas no banco. Deverá chamar funções
 * previamente programadas e validadas." Ele não pede um bot sem mãos — pede
 * que as mãos sejam funções conferidas, e lista `adicionar_carrinho`,
 * `cadastrar_endereco`, `criar_pagamento` e `confirmar_pedido` entre elas.
 *
 * E as funções conferem mesmo, no lugar que importa:
 *
 * - `adicionar_carrinho` falha quando não há unidade disponível. É o banco
 *   que recusa, não o bom senso do modelo.
 * - `criar_pagamento` tira o total do CARRINHO; o modelo escolhe a forma, não
 *   o valor, e troco menor que o total é recusado.
 * - `confirmar_pedido` exige carrinho, endereço e forma de pagamento. No
 *   PIX o pedido nasce aguardando pagamento: o estoque fica reservado e só
 *   baixa quando o dinheiro entra, pela confirmação do banco.
 * - A reserva expira sozinha, então errar o carrinho não prende estoque.
 *
 * Sobra UMA coisa que função nenhuma consegue conferir: se o cliente
 * realmente disse sim ao resumo. Essa trava está aqui embaixo.
 */

/** A única escrita que o modelo não faz, e o motivo. */
export const MOTIVO_DA_RECUSA: Record<string, string> = {
  validar_maioridade:
    "é trava legal, e tem que vir de um sim ou não explícito. O sistema já lê "
    + "a idade declarada no texto antes de você entrar — não é sua.",
};

/**
 * O passo irreversível: cria o pedido, baixa o estoque, gera o financeiro e
 * manda imprimir. O escopo o lista como ferramenta do bot (ETAPA 14), e
 * manda criar o pedido "somente após confirmação do cliente".
 *
 * Quem confere essa confirmação somos nós, com `ehSim` — a mesma função que
 * o caminho determinístico usa, testada. Se dependesse do julgamento do
 * modelo, bastaria ele se convencer de que o cliente concordou.
 */
const EXIGE_SIM_DO_CLIENTE = "confirmar_pedido";

export interface Situacao {
  /** a mensagem da vez é um sim, pelo `ehSim` do próprio sistema */
  clienteConfirmou: boolean;
}

/** As ferramentas que vão no pedido ao modelo. */
export function ferramentasDoModelo(): Ferramenta[] {
  return FERRAMENTAS.filter((f) => !(f.nome in MOTIVO_DA_RECUSA));
}

export type Veredito =
  | { permitida: true }
  | { permitida: false; motivo: string };

/**
 * Chamada pelo laço antes de executar qualquer coisa.
 *
 * Mandar só as ferramentas permitidas no pedido não basta: o modelo pode
 * chamar um nome que inventou ou lembrou de outro contexto, e aí a recusa
 * tem que acontecer aqui, do nosso lado.
 */
export function podeChamar(nome: string, situacao?: Situacao): Veredito {
  const ferramenta = POR_NOME.get(nome);

  if (!ferramenta) {
    return { permitida: false, motivo: `a ferramenta "${nome}" não existe` };
  }

  const recusa = MOTIVO_DA_RECUSA[nome];
  if (recusa) return { permitida: false, motivo: recusa };

  if (nome === EXIGE_SIM_DO_CLIENTE && !situacao?.clienteConfirmou) {
    return {
      permitida: false,
      motivo:
        "o cliente ainda não disse sim nesta mensagem. Mostre o resumo com "
        + "resumir_pedido e pergunte se está tudo certo; quando ele "
        + "confirmar, aí sim você fecha.",
    };
  }

  return { permitida: true };
}
