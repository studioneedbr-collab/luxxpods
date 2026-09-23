import { describe, expect, it } from "vitest";
import { classificar, ehNao, ehSim } from "./intencoes";

const CATALOGO = {
  marcas: ["Ignite", "Elfbar", "Lost Mary"],
  modelos: ["Ignite V300", "Elfbar BC10000"],
  sabores: ["Watermelon Ice", "Blueberry Ice"],
};

describe("classificar", () => {
  it("reconhece saudação", () => {
    expect(classificar("Boa noite").intencao).toBe("saudacao");
    expect(classificar("oi").intencao).toBe("saudacao");
  });

  it("pedir atendente vence qualquer outra intenção na mesma frase", () => {
    expect(classificar("quero comprar mas quero falar com atendente").intencao)
      .toBe("falar_humano");
  });

  it("problema com produto vira atendimento humano, não venda", () => {
    expect(classificar("o pod que comprei não liga").intencao).toBe("problema");
  });

  it("reconhece modelo antes de marca", () => {
    const r = classificar("quero o Ignite V300", CATALOGO);
    expect(r.intencao).toBe("modelo");
    expect(r.termo).toBe("Ignite V300");
  });

  it("reconhece marca sozinha", () => {
    expect(classificar("tem ignite?", CATALOGO).termo).toBe("Ignite");
  });

  it("reconhece sabor do catálogo", () => {
    expect(classificar("tem watermelon ice?", CATALOGO).termo).toBe("Watermelon Ice");
  });

  it("ignora acento e caixa", () => {
    expect(classificar("QUAL O PREÇO?").intencao).toBe("preco");
  });

  it("separa pix de dinheiro", () => {
    expect(classificar("vou pagar no pix").intencao).toBe("pix");
    expect(classificar("pago em dinheiro").intencao).toBe("dinheiro");
    expect(classificar("precisa de troco pra 100").intencao).toBe("troco");
  });

  it("devolve desconhecida quando não dá para ter certeza", () => {
    expect(classificar("xyz abc").intencao).toBe("desconhecida");
  });
});

describe("sim e não", () => {
  it("entende as formas faladas de sim", () => {
    ["sim", "isso", "pode ser", "blz", "fechou", "tudo certo", "bora"]
      .forEach((t) => expect(ehSim(t)).toBe(true));
  });

  it("entende as formas faladas de não", () => {
    ["não", "nao", "agora não", "ainda não", "espera"]
      .forEach((t) => expect(ehNao(t)).toBe(true));
  });

  it("não confunde um com o outro", () => {
    expect(ehSim("não")).toBe(false);
    expect(ehNao("sim")).toBe(false);
  });
});
