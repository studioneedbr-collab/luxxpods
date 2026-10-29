import { describe, expect, it } from "vitest";
import {
  enderecoEmLinha, extrairEndereco, extrairPreferencias, preferenciasEmTexto,
  quantidadeNoTexto, saborCombina,
} from "./extrair";

describe("quantidade pedida", () => {
  it("número solto e por extenso — antes era sempre 1", () => {
    expect(quantidadeNoTexto("quero 2 watermelon ice")).toBe(2);
    expect(quantidadeNoTexto("manda 3x")).toBe(3);
    expect(quantidadeNoTexto("duas unidades do grape")).toBe(2);
    expect(quantidadeNoTexto("me vê tres")).toBe(3);
  });

  it("nome de modelo e puffs não são quantidade", () => {
    expect(quantidadeNoTexto("quero o v300 watermelon")).toBeNull();
    expect(quantidadeNoTexto("tem de 10k?")).toBeNull();
    expect(quantidadeNoTexto("um de 30 mil puffs")).toBeNull();
    expect(quantidadeNoTexto("watermelon ice")).toBeNull();
  });

  it("fora do limite não vale", () => {
    expect(quantidadeNoTexto("quero 50")).toBeNull();
  });
});

describe("endereço digitado", () => {
  it("com vírgulas", () => {
    expect(extrairEndereco("Rua das Flores, 120, Centro")).toEqual({
      rua: "Rua das Flores", numero: "120", bairro: "Centro",
      complemento: null, referencia: null,
    });
  });

  it("sem vírgula nenhuma e sem a palavra rua", () => {
    const e = extrairEndereco("av brasil 230 centro")!;
    expect(e.rua).toBe("Av Brasil");
    expect(e.numero).toBe("230");
    expect(e.bairro).toBe("Centro");
  });

  it("complemento e referência saem do bairro", () => {
    const e = extrairEndereco("rua sete de setembro 212 bairro grão pará apto 3 perto da padaria")!;
    expect(e.numero).toBe("212");
    expect(e.bairro).toBe("Grão Pará");
    expect(e.complemento).toBe("apto 3");
    expect(e.referencia).toBe("perto da padaria");
  });

  it("nº e traço", () => {
    const e = extrairEndereco("R. João Pessoa, nº 45 - Vila Barreiros")!;
    expect(e.numero).toBe("45");
    expect(e.bairro).toBe("Vila Barreiros");
  });

  it("sem bairro devolve vazio para o motor perguntar", () => {
    expect(extrairEndereco("Rua Epaminondas Otoni 500")!.bairro).toBe("");
  });

  it("sem número não é endereço", () => {
    expect(extrairEndereco("Rua das Flores, Centro")).toBeNull();
    expect(extrairEndereco("sim")).toBeNull();
    expect(extrairEndereco("pix")).toBeNull();
  });

  it("vira uma linha legível", () => {
    expect(enderecoEmLinha({
      rua: "Rua A", numero: "10", bairro: "Centro", complemento: "apto 2", referencia: "perto da praça",
    })).toBe("Rua A, 10 — apto 2 — Centro (perto da praça)");
  });
});

describe("preferência do cliente", () => {
  const catalogo = { marcas: ["Ignite", "Elf Bar"], sabores: ["Watermelon Ice", "Grape"] };

  it("frase de gosto", () => {
    const p = extrairPreferencias("gosto de gelado e curto ignite, uns 10k", catalogo);
    expect(p.perfil).toEqual(["gelado"]);
    expect(p.marcas).toEqual(["Ignite"]);
    expect(p.puffs).toBe(10_000);
  });

  it("pedido de compra não é declaração de gosto", () => {
    const p = extrairPreferencias("1 watermelon ice", catalogo);
    expect(p.perfil).toEqual([]);
    expect(p.sabores).toEqual([]);
  });

  it("resposta seca à pergunta de preferência vale", () => {
    const p = extrairPreferencias("doce", catalogo, true);
    expect(p.perfil).toEqual(["doce"]);
    expect(extrairPreferencias("frutas, 30 mil puffs", catalogo, true).puffs).toBe(30_000);
  });

  it("reconhece o perfil no nome do sabor", () => {
    expect(saborCombina("Watermelon Ice", ["gelado"])).toBe(true);
    expect(saborCombina("Grape", ["fruta"])).toBe(true);
    expect(saborCombina("Grape", ["gelado"])).toBe(false);
  });

  it("repete o que anotou em português", () => {
    expect(preferenciasEmTexto({ perfil: ["gelado", "fruta"], marcas: ["Ignite"], puffs: 10000 }))
      .toBe("gelado, frutado, Ignite e uns 10k puffs");
  });
});
