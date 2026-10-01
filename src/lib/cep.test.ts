import { describe, it, expect } from "vitest";
import { cepCompleto, limparCep } from "./cep";

describe("CEP", () => {
  it("tira a máscara", () => {
    expect(limparCep("39800-000")).toBe("39800000");
    expect(limparCep("39.800-000")).toBe("39800000");
  });

  it("aguenta campo vazio sem estourar", () => {
    // o campo não é obrigatório: vazio é o estado normal, não erro
    expect(limparCep("")).toBe("");
    expect(limparCep(undefined as unknown as string)).toBe("");
    expect(cepCompleto("")).toBe(false);
  });

  it("só considera completo com 8 dígitos", () => {
    expect(cepCompleto("39800-00")).toBe(false);
    expect(cepCompleto("39800-000")).toBe(true);
    expect(cepCompleto("398000001")).toBe(false);
  });
});
