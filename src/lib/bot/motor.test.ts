import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Conversas inteiras, do "oi" ao pedido, na base de demonstração.
 *
 * Existe porque os defeitos do atendimento não apareciam nos testes de cada
 * peça: o endereço que não era gravado, a oferta recusada que continuava
 * pendente e engolia a mensagem seguinte, o PIX que nunca deixava o pedido
 * nascer. Só aparecem encadeando as mensagens.
 */

let seq = 0;

async function cliente() {
  const { receberMensagem } = await import("./recepcao");
  const { processar } = await import("./motor");
  const { demo } = await import("../demo");
  const telefone = `55279222${String(++seq).padStart(5, "0")}`;
  let n = 0;
  let conversa = "";

  return {
    async diz(texto: string) {
      const r = await receberMensagem({
        idExterno: `${telefone}-${n++}`, de: telefone, nome: "Teste Silva",
        tipo: "texto", texto, recebidaEm: new Date(),
      }, "whatsapp-zapi");
      conversa = r!.conversationId;
      await processar(conversa, texto);
      const bot = demo().mensagens
        .filter((m) => m.conversation_id === conversa && m.sender_type === "bot").at(-1);
      return bot?.conteudo ?? "";
    },
    estado: () => demo().conversas.find((c) => c.id === conversa)!.estado,
  };
}

describe("a idade vem antes de tudo", () => {
  it("menor declarando a idade é recusado", async () => {
    const c = await cliente();
    await c.diz("oi");
    expect(await c.diz("tenho 16 anos")).toContain("só vendemos para maiores");
  });

  it("o que não responde a pergunta não passa, nem muda a etapa", async () => {
    const c = await cliente();
    await c.diz("oi");
    expect(await c.diz("quero ver os pods")).toContain("maior de 18");
    expect(c.estado()).toBe("INITIAL");
  });

  it("no sim, mostra as marcas e pergunta o gosto", async () => {
    const c = await cliente();
    await c.diz("oi");
    const r = await c.diz("sim");
    expect(r).toContain("Ignite");
    expect(r).toContain("preferência");
  });
});

describe("compra no PIX, do começo ao fim", () => {
  it("lê quantidade e endereço, e manda o PIX do pedido depois do sim", async () => {
    const c = await cliente();
    await c.diz("oi");
    await c.diz("sim");

    // o gosto declarado vira indicação, não lista de marcas de novo
    const indicacao = await c.diz("gosto de gelado");
    expect(indicacao).toContain("Anotei que você curte gelado");
    expect(indicacao).toMatch(/Ice|Mint/);

    await c.diz("ignite v300");
    expect(await c.diz("quero 2 watermelon ice")).toContain("2 unidades de Ignite V300 Watermelon Ice");

    // a demonstração tem upsell; recusado, ele não pode engolir o endereço
    const fechar = await c.diz("fechou");
    if (fechar.includes("desconto")) {
      expect(await c.diz("não")).toContain("endereço");
    }

    const endereco = await c.diz("Rua das Flores, 120, Centro");
    expect(endereco).toContain("Rua das Flores, 120 — Centro");
    expect(c.estado()).toBe("PAYMENT");

    const resumo = await c.diz("pix");
    expect(resumo).toContain("RESUMO DO PEDIDO");
    expect(resumo).toContain("o código do PIX sai assim que você confirmar");
    expect(c.estado()).toBe("ORDER_REVIEW");

    const pedido = await c.diz("sim");
    expect(pedido).toContain("registrado");
    expect(pedido).toContain("Copia e cola do PIX");
    expect(pedido).not.toContain("R$ 0,00");
    // o pedido existe e espera o dinheiro — não fica preso em "o PIX não caiu"
    expect(c.estado()).toBe("PAYMENT");

    expect(await c.diz("paguei")).toContain("conferir");
  });

  it("a forma dita ainda no carrinho é lembrada depois do endereço", async () => {
    const c = await cliente();
    await c.diz("oi");
    await c.diz("sim");
    await c.diz("ignite v300");
    await c.diz("passion fruit");
    const r = await c.diz("vou pagar no pix");
    if (r.includes("desconto")) await c.diz("não");
    expect(await c.diz("Rua A, 10, Centro")).toContain("RESUMO DO PEDIDO");
  });
});

describe("compra no dinheiro", () => {
  it("pergunta só o bairro que faltou e calcula o troco", async () => {
    const c = await cliente();
    await c.diz("oi");
    await c.diz("sou maior");
    await c.diz("ignite v600");
    await c.diz("mango peach");
    const r = await c.diz("fechar");
    if (r.includes("desconto")) await c.diz("não");

    expect(await c.diz("av brasil 230")).toContain("qual o bairro");
    expect(await c.diz("Centro")).toContain("Av Brasil, 230 — Centro");

    expect(await c.diz("dinheiro")).toContain("troco");
    expect(await c.diz("sim")).toContain("Pra quanto");
    expect(await c.diz("50")).toMatch(/menor que o total de R\$ \d+,\d{2}/);

    const resumo = await c.diz("200");
    expect(resumo).toContain("de troco");
    expect(resumo).toContain("Troco para R$ 200,00");

    expect(await c.diz("sim")).toContain("pedido confirmado");
    expect(c.estado()).toBe("ORDER_CONFIRMED");
  });
});

describe("sabor sem modelo", () => {
  it("acha o modelo pelo sabor, ou pergunta entre os que têm", async () => {
    const c = await cliente();
    await c.diz("oi");
    await c.diz("sim");
    const r = await c.diz("peach mango");
    expect(r).toMatch(/Anotado: 1 unidade de .*Peach Mango|Peach Mango eu tenho em/);
  });
});
