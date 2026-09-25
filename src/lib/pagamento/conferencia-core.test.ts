import { describe, it, expect } from "vitest";
import { decidirPagamento } from "./conferencia-core";

describe("conferência do pagamento", () => {
  const pedido = { total: 204.8, jaPago: false };

  it("confirma quando o valor bate", () => {
    expect(decidirPagamento(pedido, "aprovado", 204.8)).toEqual({ acao: "confirmar" });
  });

  it("aceita o centavo de arredondamento do gateway", () => {
    expect(decidirPagamento(pedido, "aprovado", 204.81).acao).toBe("confirmar");
  });

  it("não confirma quem paga a menos", () => {
    const d = decidirPagamento(pedido, "aprovado", 100);
    expect(d.acao).toBe("recusar");
    expect(d).toMatchObject({ chamarGente: true });
  });

  it("não confirma quem paga a mais — também precisa de gente", () => {
    expect(decidirPagamento(pedido, "aprovado", 400).acao).toBe("recusar");
  });

  it("valor zero não é prova de pagamento", () => {
    // um webhook sem o campo de valor chega aqui como 0; se isso passasse,
    // qualquer corpo com "status: paid" confirmaria o pedido de graça
    expect(decidirPagamento(pedido, "aprovado", 0).acao).toBe("recusar");
  });

  it("pedido de graça com valor zero confirma", () => {
    expect(decidirPagamento({ total: 0, jaPago: false }, "aprovado", 0).acao).toBe("confirmar");
  });

  it("pedido inexistente não confirma", () => {
    expect(decidirPagamento({ total: null, jaPago: false }, "aprovado", 204.8))
      .toEqual({ acao: "recusar", motivo: "pedido não encontrado" });
  });

  it("segundo pagamento de um pedido pago chama gente", () => {
    const d = decidirPagamento({ total: 204.8, jaPago: true }, "aprovado", 204.8);
    expect(d).toEqual({ acao: "recusar", motivo: "pedido já estava pago", chamarGente: true });
  });

  it("evento pendente não confirma nem recusa, só registra", () => {
    expect(decidirPagamento(pedido, "pendente", 204.8).acao).toBe("registrar");
  });

  it("estorno não confirma", () => {
    expect(decidirPagamento({ total: 204.8, jaPago: true }, "estornado", 204.8).acao)
      .toBe("registrar");
  });

  it("recusado não confirma mesmo com o valor certo", () => {
    expect(decidirPagamento(pedido, "recusado", 204.8).acao).toBe("registrar");
  });
});

describe("dois eventos de aprovação da mesma transação", () => {
  const pago = { total: 204.8, jaPago: true, transacaoPaga: "pay_123" };

  it("a mesma transação confirmando de novo só registra", () => {
    // o Asaas manda PAYMENT_CONFIRMED e depois PAYMENT_RECEIVED do mesmo
    // pagamento; se o segundo abrisse tarefa urgente, toda venda geraria uma
    const d = decidirPagamento(pago, "aprovado", 204.8, "pay_123");
    expect(d).toEqual({ acao: "registrar", motivo: "pagamento já confirmado" });
  });

  it("transação diferente continua sendo duplicidade", () => {
    const d = decidirPagamento(pago, "aprovado", 204.8, "pay_999");
    expect(d).toMatchObject({ acao: "recusar", chamarGente: true });
  });

  it("sem saber qual transação pagou, trata como duplicidade", () => {
    // na dúvida, chamar gente é mais barato que confirmar duas vezes
    expect(decidirPagamento({ total: 204.8, jaPago: true }, "aprovado", 204.8, "pay_1"))
      .toMatchObject({ acao: "recusar", chamarGente: true });
  });
});
