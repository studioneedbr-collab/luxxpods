import { FERRAMENTAS, POR_NOME, type Ferramenta } from "../bot/ferramentas";

/**
 * O que o modelo pode tocar — e o que é só da máquina de estados.
 *
 * Esta é a peça que protege o estoque, e por isso é uma lista explícita em
 * vez de uma regra esperta: quem revisa precisa conseguir ler de uma vez o
 * que a IA consegue fazer. O princípio é um só — o modelo ENTENDE e
 * RESPONDE; ele nunca fecha transação.
 *
 * Toda ferramenta de leitura está liberada: preço, sabor e estoque saem de
 * consulta, então deixar o modelo consultar à vontade é o que o impede de
 * inventar. O risco nunca esteve em ler.
 *
 * A escrita é outra história, e cada recusa abaixo tem um motivo concreto.
 */

/**
 * As escritas que o modelo pode fazer: as duas que não criam fato de
 * dinheiro nem de estoque, e que existem justamente para ele admitir que não
 * sabe. Tirar estas seria pior — sem elas, um modelo sem resposta inventa.
 */
const ESCRITAS_LIBERADAS = new Set([
  "transferir_atendimento",
  "criar_tarefa",
]);

/**
 * Por que cada escrita fica fora. O texto não é decoração: entra no log
 * quando o modelo tenta chamar, e é o que explica a recusa a quem for
 * mexer nisso depois.
 */
export const MOTIVO_DA_RECUSA: Record<string, string> = {
  confirmar_pedido:
    "irreversível: baixa estoque, gera financeiro e manda imprimir. Só a "
    + "máquina de estados chama, e só depois do cliente confirmar o resumo "
    + "que ele viu.",
  adicionar_carrinho:
    "reserva estoque de verdade. O caminho determinístico já faz isso com o "
    + "sabor conferido no catálogo.",
  remover_carrinho: "devolve reserva ao estoque; mexe no que outro cliente pode comprar.",
  criar_pagamento: "cria cobrança. Valor errado aqui é prejuízo ou venda perdida.",
  cadastrar_endereco: "grava dado do cliente a partir de texto solto, sem ninguém conferir.",
  validar_maioridade:
    "é trava legal. Tem que vir de um sim ou não explícito, nunca de inferência.",
  buscar_upsell: "a oferta acontece uma vez, num ponto só do fluxo.",
  responder_upsell: "registra decisão do cliente sobre uma oferta.",
  enviar_catalogo: "manda mídia e agenda follow-up; o ritmo de envio é da máquina.",
};

/** As ferramentas que vão no pedido ao modelo. */
export function ferramentasDoModelo(): Ferramenta[] {
  return FERRAMENTAS.filter(
    (f) => !f.escreve || ESCRITAS_LIBERADAS.has(f.nome),
  );
}

export type Veredito =
  | { permitida: true }
  | { permitida: false; motivo: string };

/**
 * Chamada pelo laço antes de executar qualquer coisa.
 *
 * Mandar só as ferramentas permitidas no pedido não basta: o modelo pode
 * chamar um nome que ele inventou ou lembrou de outro contexto, e aí a
 * recusa tem que acontecer aqui, do nosso lado.
 */
export function podeChamar(nome: string): Veredito {
  const ferramenta = POR_NOME.get(nome);

  if (!ferramenta) {
    return { permitida: false, motivo: `a ferramenta "${nome}" não existe` };
  }

  if (!ferramenta.escreve || ESCRITAS_LIBERADAS.has(nome)) {
    return { permitida: true };
  }

  return {
    permitida: false,
    motivo: MOTIVO_DA_RECUSA[nome]
      ?? "escreve no banco, e a IA não fecha transação",
  };
}
