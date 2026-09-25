import { describe, it, expect } from "vitest";
import { MeioInfinitePay } from "./infinitepay";

const meio = new MeioInfinitePay();

describe("leitura do webhook da InfinitePay", () => {
  it("lê o corpo documentado", () => {
    const e = meio.interpretarWebhook({
      order_nsu: "LX-2026-000016",
      transaction_nsu: "tx-1",
      status: "paid",
      amount: 20480,
      payment_method: "pix",
    })!;
    expect(e.referenciaPedido).toBe("LX-2026-000016");
    expect(e.situacao).toBe("aprovado");
    // a API manda centavos; o sistema trabalha em reais
    expect(e.valor).toBe(204.8);
  });

  it("aceita os nomes alternativos dos campos", () => {
    const e = meio.interpretarWebhook({
      orderNsu: "LX-2026-000016", invoice_slug: "abc",
      paid: true, paid_amount: 20480,
    })!;
    expect(e.referenciaPedido).toBe("LX-2026-000016");
    expect(e.idTransacao).toBe("abc");
    expect(e.situacao).toBe("aprovado");
  });

  it("separa pendente de aprovado da mesma transação", () => {
    // se os dois eventos tivessem o mesmo id, o "aprovado" seria descartado
    // como repetição e o pedido pago ficaria aberto para sempre
    const pendente = meio.interpretarWebhook({
      order_nsu: "LX-1", transaction_nsu: "tx-9", status: "pending", amount: 1000,
    })!;
    const pago = meio.interpretarWebhook({
      order_nsu: "LX-1", transaction_nsu: "tx-9", status: "paid", amount: 1000,
    })!;
    expect(pendente.situacao).toBe("pendente");
    expect(pago.situacao).toBe("aprovado");
    expect(pendente.id).not.toBe(pago.id);
  });

  it("o reenvio do mesmo evento mantém o mesmo id", () => {
    const corpo = { order_nsu: "LX-1", transaction_nsu: "tx-9", status: "paid", amount: 1000 };
    expect(meio.interpretarWebhook(corpo)!.id).toBe(meio.interpretarWebhook(corpo)!.id);
  });

  it("reconhece estorno e recusa", () => {
    expect(meio.interpretarWebhook({ order_nsu: "a", id: "1", status: "refunded" })!.situacao)
      .toBe("estornado");
    expect(meio.interpretarWebhook({ order_nsu: "a", id: "1", status: "refused" })!.situacao)
      .toBe("recusado");
  });

  it("ignora corpo que não é da InfinitePay", () => {
    expect(meio.interpretarWebhook({ evento: "outra_coisa" })).toBeNull();
    expect(meio.interpretarWebhook({})).toBeNull();
  });

  it("corpo sem valor vira zero, e zero não confirma nada", () => {
    // a trava de verdade está na conferência; aqui só garantimos que um
    // corpo sem valor não é lido como o valor do pedido
    expect(meio.interpretarWebhook({ order_nsu: "a", id: "1", status: "paid" })!.valor).toBe(0);
  });
});
