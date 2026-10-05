import { describe, expect, it } from "vitest";
import { FERRAMENTAS } from "../bot/ferramentas";
import { ferramentasDoModelo, podeChamar } from "./politica";

const confirmou = { clienteConfirmou: true };
const naoConfirmou = { clienteConfirmou: false };

describe("política da IA", () => {
  it("libera toda consulta: o risco nunca esteve em ler", () => {
    for (const f of FERRAMENTAS.filter((x) => !x.escreve)) {
      expect(podeChamar(f.nome).permitida, f.nome).toBe(true);
    }
  });

  /**
   * O §24 do escopo lista estas como ferramentas do bot, e o que protege o
   * estoque é a própria função: `adicionar_carrinho` falha sem unidade
   * disponível, `criar_pagamento` tira o total do carrinho. Fechar a política
   * aqui seria proteger duas vezes o que já está protegido, e em troca
   * deixar o bot incapaz de vender.
   */
  it("deixa o modelo conduzir a venda, como o escopo manda", () => {
    for (const nome of [
      "adicionar_carrinho", "remover_carrinho", "cadastrar_endereco",
      "criar_pagamento", "buscar_upsell", "responder_upsell",
      "enviar_catalogo", "criar_tarefa", "transferir_atendimento",
    ]) {
      expect(podeChamar(nome).permitida, nome).toBe(true);
    }
  });

  it("recusa validar maioridade: é trava legal, não inferência", () => {
    const v = podeChamar("validar_maioridade", confirmou);
    expect(v.permitida).toBe(false);
    if (!v.permitida) expect(v.motivo).toContain("legal");
  });

  it("recusa nome que o modelo inventou", () => {
    const v = podeChamar("apagar_estoque");
    expect(v.permitida).toBe(false);
    if (!v.permitida) expect(v.motivo).toContain("não existe");
  });

  /* ------------------------------------------- a trava do irreversível -- */

  /**
   * `confirmar_pedido` baixa estoque, gera financeiro e manda imprimir. A
   * ETAPA 14 do escopo manda criar o pedido "somente após confirmação do
   * cliente" — e essa é a única condição que nenhuma função consegue
   * conferir sozinha. Então ela é conferida aqui, com o `ehSim` do sistema,
   * e não pelo que o modelo achou que o cliente quis dizer.
   */
  it("não fecha pedido sem o cliente ter dito sim nesta mensagem", () => {
    const v = podeChamar("confirmar_pedido", naoConfirmou);
    expect(v.permitida).toBe(false);
    if (!v.permitida) {
      expect(v.motivo).toContain("ainda não disse sim");
      // a recusa ensina o caminho certo, senão o modelo insiste no erro
      expect(v.motivo).toContain("resumir_pedido");
    }
  });

  it("não fecha pedido quando ninguém informou a situação", () => {
    expect(podeChamar("confirmar_pedido").permitida).toBe(false);
  });

  it("fecha pedido quando o cliente confirmou", () => {
    expect(podeChamar("confirmar_pedido", confirmou).permitida).toBe(true);
  });

  /* ----------------------------------------------------------- a lista -- */

  /**
   * Este é o teste que importa de verdade: ele falha se alguém, no futuro,
   * liberar a validação de maioridade sem pensar — e falha também se uma
   * ferramenta nova entrar no sistema sem alguém decidir se o modelo a vê.
   */
  it("entrega ao modelo tudo menos a validação de maioridade", () => {
    const vistas = ferramentasDoModelo().map((f) => f.nome);
    const fora = FERRAMENTAS.map((f) => f.nome).filter((n) => !vistas.includes(n));
    expect(fora).toEqual(["validar_maioridade"]);
  });
});
