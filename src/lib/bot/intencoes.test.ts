import { describe, expect, it } from "vitest";
import { classificar, ehNao, ehSim, idadeDeclarada } from "./intencoes";

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

describe("confirmação de maioridade", () => {
  it("reconhece as formas de dizer que é maior", () => {
    ["sim", "sou maior de 18", "sou de maior", "tenho 25 anos",
     "já sou maior", "maior de idade", "25 anos", "tenho 30"]
      .forEach((t) => expect(ehSim(t), `"${t}" deveria ser sim`).toBe(true));
  });

  it("reconhece quem diz que é menor", () => {
    ["não", "sou menor", "menor de idade", "tenho 16 anos", "17 anos"]
      .forEach((t) => expect(ehNao(t), `"${t}" deveria ser não`).toBe(true));
  });

  // um não pode ser confundido com o outro: vender para menor é o pior erro
  it("não confunde maior com menor", () => {
    expect(ehSim("sou menor de idade")).toBe(false);
    expect(ehSim("tenho 16 anos")).toBe(false);
    expect(ehNao("sou maior de 18")).toBe(false);
    expect(ehNao("tenho 25 anos")).toBe(false);
  });

  it("classifica como intenção de maioridade", () => {
    expect(classificar("sou maior de 18").intencao).toBe("maioridade");
    expect(classificar("tenho 25 anos").intencao).toBe("maioridade");
  });
});

describe("idade declarada", () => {
  it("lê a idade do texto", () => {
    expect(idadeDeclarada("tenho 25 anos")).toBe(25);
    expect(idadeDeclarada("18")).toBe(18);
    expect(idadeDeclarada("sou maior de 18")).toBe(18);
  });

  it("devolve nulo quando não há idade", () => {
    expect(idadeDeclarada("sim")).toBeNull();
    expect(idadeDeclarada("quero um pod")).toBeNull();
  });

  // a checagem que impede vender para menor
  it("a idade manda sobre a forma da frase", () => {
    expect(ehSim("tenho 16 anos")).toBe(false);
    expect(ehSim("tenho 17")).toBe(false);
    expect(ehSim("tenho 18 anos")).toBe(true);
    expect(ehNao("tenho 16 anos")).toBe(true);
    expect(ehNao("tenho 21 anos")).toBe(false);
  });
});
