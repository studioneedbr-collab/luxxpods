import { describe, expect, it } from "vitest";
import { brCodeValido, crc16, gerarBrCode, tipoDaChave } from "./brcode";

describe("CRC16 do BR Code", () => {
  // vetor oficial do CRC-16/CCITT-FALSE: é o que prova a implementação
  it("bate com o vetor de teste do algoritmo", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("é determinístico", () => {
    const payload =
      "00020126330014BR.GOV.BCB.PIX0111123456789015204000053039865802BR" +
      "5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(payload)).toBe(crc16(payload));
    expect(crc16(payload)).toMatch(/^[0-9A-F]{4}$/);
  });

  it("muda quando o payload muda — é o que detecta adulteração", () => {
    expect(crc16("00020101")).not.toBe(crc16("00020102"));
  });

  it("sempre devolve 4 dígitos hexadecimais", () => {
    expect(crc16("teste")).toMatch(/^[0-9A-F]{4}$/);
    expect(crc16("")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("gerar BR Code", () => {
  const base = { chave: "33999990000", nome: "Luxx Pods", cidade: "Teofilo Otoni" };

  it("gera um código que valida contra o próprio CRC", () => {
    const codigo = gerarBrCode({ ...base, valor: 89.9 });
    expect(brCodeValido(codigo)).toBe(true);
  });

  it("começa com o indicador de formato", () => {
    expect(gerarBrCode(base).startsWith("000201")).toBe(true);
  });

  it("carrega o domínio do PIX e a chave", () => {
    const codigo = gerarBrCode(base);
    expect(codigo).toContain("BR.GOV.BCB.PIX");
    expect(codigo).toContain("33999990000");
  });

  it("grava o valor com duas casas", () => {
    expect(gerarBrCode({ ...base, valor: 89.9 })).toContain("54058" + "9.90");
  });

  it("omite o valor quando não informado — o pagador escolhe", () => {
    const codigo = gerarBrCode(base);
    expect(codigo).not.toContain("5405");
  });

  // é o identificador que casa o comprovante com o pedido
  it("carrega o número do pedido como identificador", () => {
    const codigo = gerarBrCode({ ...base, identificador: "LX-2026-000123" });
    expect(codigo).toContain("LX2026000123");
  });

  it("tira acento e símbolo do nome e da cidade", () => {
    const codigo = gerarBrCode({
      ...base, nome: "Açaí & Cia Ltda.", cidade: "São José",
    });
    expect(codigo).toContain("ACAI  CIA LTDA");
    expect(codigo).toContain("SAO JOSE");
    expect(brCodeValido(codigo)).toBe(true);
  });

  it("corta nome e cidade no limite da especificação", () => {
    const codigo = gerarBrCode({
      ...base,
      nome: "Um nome muito maior que o limite de vinte e cinco",
      cidade: "Uma cidade com nome enorme",
    });
    expect(brCodeValido(codigo)).toBe(true);
  });

  it("recusa chave vazia", () => {
    expect(() => gerarBrCode({ ...base, chave: "  " })).toThrow("Chave PIX");
  });
});

describe("validar código colado", () => {
  it("aceita código íntegro", () => {
    expect(brCodeValido(gerarBrCode({
      chave: "teste@luxx.com", nome: "Luxx", cidade: "Teofilo Otoni", valor: 10,
    }))).toBe(true);
  });

  it("recusa código adulterado", () => {
    const codigo = gerarBrCode({ chave: "teste@luxx.com", nome: "Luxx", cidade: "TO", valor: 10 });
    expect(brCodeValido(codigo.slice(0, -5) + "00000")).toBe(false);
  });

  it("recusa texto curto demais", () => {
    expect(brCodeValido("123")).toBe(false);
  });
});

describe("tipo da chave", () => {
  it("reconhece cada formato", () => {
    expect(tipoDaChave("12345678909")).toBe("cpf");
    expect(tipoDaChave("12345678000195")).toBe("cnpj");
    expect(tipoDaChave("contato@luxxpods.com.br")).toBe("email");
    expect(tipoDaChave("5533999990000")).toBe("telefone");
    expect(tipoDaChave("123e4567-e89b-12d3-a456-426614174000")).toBe("aleatoria");
  });
});
