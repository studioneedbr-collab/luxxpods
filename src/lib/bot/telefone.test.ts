import { describe, expect, it } from "vitest";
import { validarTelefone } from "./telefone";

describe("validarTelefone", () => {
  it("aceita celular com DDI", () => {
    const r = validarTelefone("5533912345678");
    expect(r?.e164).toBe("5533912345678");
    expect(r?.formatado).toBe("(33) 91234-5678");
    expect(r?.celular).toBe(true);
  });

  it("aceita celular sem DDI e normaliza", () => {
    expect(validarTelefone("33912345678")?.e164).toBe("5533912345678");
  });

  it("aceita telefone já formatado", () => {
    expect(validarTelefone("(33) 91234-5678")?.e164).toBe("5533912345678");
  });

  it("aceita fixo de 8 dígitos", () => {
    const r = validarTelefone("3335211234");
    expect(r?.celular).toBe(false);
    expect(r?.formatado).toBe("(33) 3521-1234");
  });

  // a regra que protege de mandar mensagem para desconhecido
  it("NÃO conserta celular antigo de 8 dígitos — recusa", () => {
    expect(validarTelefone("3391234567")).toBeNull();
  });

  it("recusa DDD que não existe", () => {
    expect(validarTelefone("33091234567")).toBeNull();
    expect(validarTelefone("5520912345678")).toBeNull();
  });

  it("recusa comprimento fora do padrão", () => {
    expect(validarTelefone("339123456")).toBeNull();
    expect(validarTelefone("55339123456789")).toBeNull();
  });

  it("recusa vazio e lixo", () => {
    expect(validarTelefone("")).toBeNull();
    expect(validarTelefone(null)).toBeNull();
    expect(validarTelefone("não é telefone")).toBeNull();
  });
});
