import { describe, it, expect } from "vitest";
import { MeioAsaas } from "./asaas";
import { meioDoWebhook } from "./roteamento";

const meio = new MeioAsaas();

const cobrancaPaga = {
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_080225913252",
    status: "RECEIVED",
    value: 204.8,
    netValue: 200.1,
    externalReference: "LX-2026-000016",
    billingType: "PIX",
    paymentDate: "2026-09-24",
  },
};

describe("leitura do webhook do Asaas", () => {
  it("lê uma cobrança recebida", () => {
    const e = meio.interpretarWebhook(cobrancaPaga)!;
    expect(e.referenciaPedido).toBe("LX-2026-000016");
    expect(e.situacao).toBe("aprovado");
    // o Asaas trabalha em reais, não em centavos
    expect(e.valor).toBe(204.8);
    expect(e.idTransacao).toBe("pay_080225913252");
  });

  it("CONFIRMED e RECEIVED da mesma cobrança são o mesmo evento", () => {
    // os dois chegam para todo pagamento; se virassem eventos distintos, o
    // segundo abriria tarefa urgente de duplicidade em cada venda
    const confirmado = meio.interpretarWebhook({
      ...cobrancaPaga, event: "PAYMENT_CONFIRMED",
    })!;
    const recebido = meio.interpretarWebhook(cobrancaPaga)!;
    expect(confirmado.situacao).toBe("aprovado");
    expect(confirmado.id).toBe(recebido.id);
    expect(confirmado.idTransacao).toBe(recebido.idTransacao);
  });

  it("separa estorno de aprovação", () => {
    const e = meio.interpretarWebhook({ ...cobrancaPaga, event: "PAYMENT_REFUNDED" })!;
    expect(e.situacao).toBe("estornado");
    expect(e.id).not.toBe(meio.interpretarWebhook(cobrancaPaga)!.id);
  });

  it("evento que não é pagamento fica pendente, não confirma", () => {
    expect(meio.interpretarWebhook({ ...cobrancaPaga, event: "PAYMENT_OVERDUE" })!.situacao)
      .toBe("pendente");
    expect(meio.interpretarWebhook({ ...cobrancaPaga, event: "PAYMENT_CREATED" })!.situacao)
      .toBe("pendente");
  });

  it("guarda o id do QR Code para achar o pedido sem o número", () => {
    // o QR estático gera a cobrança na hora do pagamento, e nem sempre o
    // número do pedido volta no corpo
    const e = meio.interpretarWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", value: 50, pixQrCodeId: "qr_abc" },
    })!;
    expect(e.referenciaPedido).toBe("");
    expect(e.referenciaAlternativa).toBe("qr_abc");
  });

  it("ignora corpo que não é do Asaas", () => {
    expect(meio.interpretarWebhook({ order_nsu: "LX-1", status: "paid" })).toBeNull();
    expect(meio.interpretarWebhook({ event: "PAYMENT_RECEIVED" })).toBeNull();
    expect(meio.interpretarWebhook({})).toBeNull();
  });

  it("cobrança sem id não vira evento", () => {
    // sem id não há como garantir idempotência nem casar com a cobrança
    expect(meio.interpretarWebhook({ event: "PAYMENT_RECEIVED", payment: { value: 10 } }))
      .toBeNull();
  });
});

describe("de quem é o webhook", () => {
  it("reconhece o Asaas pelo par event/payment", () => {
    expect(meioDoWebhook(cobrancaPaga)?.nome).toBe("asaas");
  });

  it("reconhece a InfinitePay pelo order_nsu", () => {
    expect(meioDoWebhook({ order_nsu: "LX-1", transaction_nsu: "t" })?.nome)
      .toBe("infinitepay");
  });

  it("não chuta provedor para corpo desconhecido", () => {
    expect(meioDoWebhook({ foo: "bar" })).toBeNull();
    expect(meioDoWebhook({ event: "OUTRA_COISA", payment: {} })).toBeNull();
  });
});

describe("configuração", () => {
  it("sem ASAAS_API_KEY o meio não se declara pronto", () => {
    // um meio que se diz configurado sem credencial derruba a venda: o
    // sistema escolheria ele e todo PIX falharia
    expect(new MeioAsaas().configurado()).toBe(false);
  });
});
