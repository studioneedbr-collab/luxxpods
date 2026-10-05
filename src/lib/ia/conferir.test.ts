import { describe, expect, it } from "vitest";
import { conferirResposta, valoresNoTexto, type LeituraFeita } from "./conferir";

const leitura = (nome: string, dados: unknown): LeituraFeita =>
  ({ nome, ok: true, dados });

const CATALOGO = {
  catalogo: {
    marcas: ["Ignite", "Lost Mary"],
    modelos: ["Ignite V150", "Lost Mary BM6000"],
    sabores: ["Watermelon Ice", "Mint", "Blueberry"],
  },
};

const so = (t: string) => valoresNoTexto(t).map((x) => x.valor);

describe("valores afirmados no texto", () => {
  it("lê o formato brasileiro, com milhar e centavo", () => {
    expect(so("sai por R$ 1.234,56")).toEqual(["1234.56"]);
  });

  it("lê preço redondo e 'reais' escrito", () => {
    expect(so("R$ 45 ou 50 reais")).toEqual(["45.00", "50.00"]);
  });

  it("não acha dinheiro onde não tem", () => {
    expect(so("tenho 3 sabores e 15000 puffs")).toEqual([]);
  });
});

describe("conferir a resposta do modelo", () => {
  it("passa o preço que saiu da consulta", () => {
    const r = conferirResposta(
      "O Ignite V150 sai por R$ 85,00 🖤",
      [leitura("consultar_preco", { produto: "Ignite V150", preco: 85 })],
    );
    expect(r.ok).toBe(true);
  });

  it("recusa o preço que o modelo inventou", () => {
    const r = conferirResposta(
      "Esse eu faço por R$ 70,00 pra você",
      [leitura("consultar_preco", { produto: "Ignite V150", preco: 85 })],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("70,00");
  });

  /**
   * O catálogo vem como texto já formatado, com os preços dentro da string.
   * Se o conferidor só olhasse números de JSON, recusaria toda resposta
   * baseada no catálogo — que é o caso mais comum.
   */
  it("aceita preço que estava escrito dentro do texto do catálogo", () => {
    const r = conferirResposta(
      "O Lost Mary está R$ 90,00",
      [leitura("catalogo_completo", {
        texto: "LOST MARY\n- BM6000 · 6000 puffs · R$ 90,00\n  Blueberry, Watermelon",
      })],
    );
    expect(r.ok).toBe(true);
  });

  /**
   * Recusa falsa que aconteceu ao vivo: a taxa de entrega está na
   * configuração da loja e o sistema a põe no prompt. O bot repetindo isso
   * não está inventando nada — e a recusa derrubou uma venda no meio.
   */
  it("aceita a taxa de entrega, que vem da configuração da loja", () => {
    const r = conferirResposta(
      "Anotei o endereço! A entrega fica R$ 5,00, uns 45 minutos 🛵",
      [leitura("cadastrar_endereco", { endereco: "Rua A, 10" })],
      { valoresDaLoja: [5, 150] },
    );
    expect(r.ok).toBe(true);
  });

  /**
   * Também aconteceu ao vivo: "troco pra 100". Repetir o número que a pessoa
   * acabou de escrever não é afirmar preço.
   */
  it("aceita repetir o valor que o próprio cliente escreveu", () => {
    const r = conferirResposta(
      "Beleza, você paga com R$ 100 e eu levo R$ 10 de troco",
      [leitura("criar_pagamento", { total: 90, troco: 10 })],
      { textoDoCliente: "dinheiro, troco pra 100" },
    );
    expect(r.ok).toBe(true);
  });

  /**
   * E a brecha que isso abriria, fechada: concordar com o preço que o
   * cliente propôs também é "repetir o cliente" — mas aí o número está
   * virando preço, e não passa.
   */
  it("não deixa o valor do cliente virar preço", () => {
    const r = conferirResposta(
      "Fechado, faço por R$ 60 pra você",
      [leitura("consultar_preco", { preco: 85 })],
      { textoDoCliente: "faz R$ 60 que eu levo agora" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("60,00");
  });

  /**
   * O "troco pra 100" é dito uma vez e volta no resumo e na confirmação.
   * Olhando só a última mensagem, o conferidor barrava a venda no fim.
   */
  it("aceita valor que o cliente disse em turno anterior", () => {
    const r = conferirResposta(
      "Confere: total R$ 90,00, você paga com R$ 100 e eu levo R$ 10 de troco",
      [leitura("resumir_pedido", { total: 90, troco: 10 })],
      { textoDoCliente: "dinheiro, troco pra 100 \n me mostra o resumo" },
    );
    expect(r.ok).toBe(true);
  });

  it("confere a frase do valor, não o texto todo", () => {
    // "sai por R$ 85" é legítimo (da consulta); o R$ 100 é do cliente e
    // está em outra frase, que não afirma preço
    const r = conferirResposta(
      "O Ignite sai por R$ 85,00. Com a entrega dá R$ 90,00, e você paga com R$ 100.",
      [leitura("resumir_pedido", { subtotal: 85, total: 90 })],
      { textoDoCliente: "troco para 100" },
    );
    expect(r.ok).toBe(true);
  });

  it("recusa a conta que o modelo fez de cabeça", () => {
    const r = conferirResposta(
      "São 2 unidades, dá R$ 170,00 no total",
      [leitura("consultar_preco", { preco: 85 })],
    );
    expect(r.ok).toBe(false);
  });

  it("recusa resposta vazia", () => {
    expect(conferirResposta("   ", [leitura("buscar_marcas", { marcas: ["Ignite"] })]).ok)
      .toBe(false);
  });

  it("recusa dizer que tem produto sem ter consultado nada", () => {
    const r = conferirResposta("Tenho Watermelon Ice sim, pode pedir!", [], CATALOGO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("disponibilidade");
  });

  /**
   * Recusa falsa que aconteceu contra a API: o cliente perguntou "vocês
   * fazem fiado?", o bot respondeu certo falando das formas de pagamento, e
   * o "temos" bateu na regra de disponibilidade de produto. A resposta certa
   * foi barrada e o cliente caiu no "não entendi".
   */
  it("deixa falar da loja sem tratar 'temos' como afirmação de estoque", () => {
    for (const frase of [
      "Fiado a gente não faz, mas temos PIX e dinheiro na entrega 👍",
      "Temos entrega até 23h",
      "Tenho como mandar hoje ainda sim",
    ]) {
      expect(conferirResposta(frase, [], CATALOGO).ok, frase).toBe(true);
    }
  });

  it("sem a lista do catálogo, prefere deixar passar a barrar resposta certa", () => {
    expect(conferirResposta("Tenho Watermelon Ice sim!", []).ok).toBe(true);
  });

  it("deixa dizer que NÃO tem sem consultar — negar não arrisca venda", () => {
    expect(conferirResposta("Watermelon Ice eu não tenho agora", [], CATALOGO).ok).toBe(true);
  });

  /**
   * Caso real: pedi ao modelo "adiciona 2 watermelon no carrinho" e ele
   * respondeu "Fechou, 2 Watermelon Ice 👌" sem nada ter sido reservado.
   */
  it("recusa dizer que separou ou reservou, porque ele não consegue", () => {
    for (const frase of [
      "Já separei 2 unidades de Watermelon Ice pra você",
      "Adicionei no seu carrinho 🖤",
      "Coloquei 1 Mint no carrinho, já reservei",
      "Anotei seu pedido, pode considerar fechado",
    ]) {
      const r = conferirResposta(
        frase, [leitura("buscar_sabores", { produto: "Ignite V150" })], CATALOGO);
      expect(r.ok, frase).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("reservado");
    }
  });

  /**
   * Recusas falsas que aconteceram ao vivo. Oferecer separar é o que o bot
   * DEVE fazer antes de agir, e "coloquei seu endereço" não tem nada a ver
   * com estoque.
   */
  it("deixa ele OFERECER separar, que é o passo certo antes de agir", () => {
    for (const frase of [
      "Quer que eu já separe 2 pra você?",
      "Me confirma que eu já separo o Watermelon Ice",
      "Vou separar assim que você confirmar",
      "Coloquei seu endereço aqui: Rua A, 10",
    ]) {
      expect(conferirResposta(frase, [], CATALOGO).ok, frase).toBe(true);
    }
  });

  it("aceita dizer que adicionou depois de a ferramenta ter rodado", () => {
    const r = conferirResposta(
      "Adicionei 2 Watermelon Ice no carrinho 🖤",
      [leitura("adicionar_carrinho", { produto: "Ignite V150", sabor: "Watermelon Ice", quantidade: 2 })],
      CATALOGO,
    );
    expect(r.ok).toBe(true);
  });

  it("deixa ele dizer que NÃO separou, e perguntar antes", () => {
    const r = conferirResposta(
      "Ainda não separei nada. Confirma pra mim: Ignite V150 Watermelon Ice, 2 unidades?",
      [leitura("buscar_sabores", { produto: "Ignite V150" })],
    );
    expect(r.ok).toBe(true);
  });

  it("recusa anunciar que o PIX caiu sem consultar o pagamento", () => {
    const r = conferirResposta("Seu PIX caiu, já estou separando!", []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("pagamento");
  });

  it("deixa falar do pagamento depois de consultar", () => {
    const r = conferirResposta(
      "O PIX ainda não caiu aqui, me avisa quando enviar",
      [leitura("consultar_pagamento", { pago: false })],
    );
    expect(r.ok).toBe(true);
  });

  it("deixa responder sobre a loja sem consulta nenhuma", () => {
    const r = conferirResposta("A entrega leva uns 45 minutos 🛵", []);
    expect(r.ok).toBe(true);
  });

  it("ignora o que veio de consulta que falhou", () => {
    const r = conferirResposta("Sai por R$ 85,00", [
      { nome: "consultar_preco", ok: false, dados: { preco: 85 } },
    ]);
    expect(r.ok).toBe(false);
  });
});
