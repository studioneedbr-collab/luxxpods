import { describe, expect, it } from "vitest";
import { deveChamarHumano, podeIr, proximoEstado, type Contexto } from "./estados";

describe("máquina de estados", () => {
  it("não deixa ir para o carrinho sem produto escolhido", () => {
    const r = podeIr("PRODUCT_SELECTION", "CART", {});
    expect(r.permitida).toBe(false);
    expect(r.falta).toContain("produto");
  });

  it("deixa ir para o carrinho com produto escolhido", () => {
    expect(podeIr("PRODUCT_SELECTION", "CART", { product_flavor_id: "pf-1" }).permitida)
      .toBe(true);
  });

  it("não deixa pagar sem endereço confirmado", () => {
    expect(podeIr("ADDRESS", "PAYMENT", {}).permitida).toBe(false);
  });

  // a regra que protege o estoque de venda não paga
  it("NÃO confirma pedido no PIX enquanto o pagamento não cair", () => {
    const ctx: Contexto = { forma_pagamento: "pix", pagamento_status: "aguardando" };
    expect(podeIr("ORDER_REVIEW", "ORDER_CONFIRMED", ctx).permitida).toBe(false);
  });

  it("confirma no PIX depois que o pagamento é aprovado", () => {
    const ctx: Contexto = { forma_pagamento: "pix", pagamento_status: "aprovado" };
    expect(podeIr("ORDER_REVIEW", "ORDER_CONFIRMED", ctx).permitida).toBe(true);
  });

  it("confirma em dinheiro sem esperar pagamento", () => {
    expect(podeIr("ORDER_REVIEW", "ORDER_CONFIRMED", { forma_pagamento: "dinheiro" }).permitida)
      .toBe(true);
  });

  it("recusa salto de etapa que não existe", () => {
    expect(podeIr("INITIAL", "ORDER_CONFIRMED", {}).permitida).toBe(false);
  });

  it("pedir atendente interrompe o fluxo em qualquer estado", () => {
    expect(proximoEstado("PAYMENT", "falar_humano", {})).toBe("HUMAN");
    expect(proximoEstado("INITIAL", "problema", {})).toBe("HUMAN");
  });

  it("cliente que volta reabre a conversa do início", () => {
    expect(podeIr("COMPLETED", "INITIAL", {}).permitida).toBe(true);
  });

  it("chama gente depois de três falhas seguidas", () => {
    expect(deveChamarHumano({ falhas_seguidas: 2 })).toBe(false);
    expect(deveChamarHumano({ falhas_seguidas: 3 })).toBe(true);
  });
});
