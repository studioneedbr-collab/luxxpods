import { describe, expect, it } from "vitest";
import {
  cnpjValido, cpfValido, documentoValido, mascaraCEP, mascaraCNPJ,
  mascaraCPF, mascaraDocumento, mascaraTelefone,
} from "./mascaras";

describe("máscara de CPF", () => {
  it("formata conforme digita", () => {
    expect(mascaraCPF("123")).toBe("123");
    expect(mascaraCPF("123456")).toBe("123.456");
    expect(mascaraCPF("123456789")).toBe("123.456.789");
    expect(mascaraCPF("12345678909")).toBe("123.456.789-09");
  });
  it("ignora o que passa de 11 dígitos", () => {
    expect(mascaraCPF("123456789099999")).toBe("123.456.789-09");
  });
  it("aceita texto já formatado", () => {
    expect(mascaraCPF("123.456.789-09")).toBe("123.456.789-09");
  });
});

describe("máscara de CNPJ", () => {
  it("formata conforme digita", () => {
    expect(mascaraCNPJ("12345678")).toBe("12.345.678");
    expect(mascaraCNPJ("12345678000195")).toBe("12.345.678/0001-95");
  });
});

describe("documento escolhe a máscara pelo tamanho", () => {
  it("até 11 dígitos é CPF", () => {
    expect(mascaraDocumento("12345678909")).toBe("123.456.789-09");
  });
  it("acima disso é CNPJ", () => {
    expect(mascaraDocumento("12345678000195")).toBe("12.345.678/0001-95");
  });
});

describe("validação de CPF", () => {
  it("aceita CPF real", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
  });
  it("recusa dígito verificador errado", () => {
    expect(cpfValido("529.982.247-26")).toBe(false);
  });
  it("recusa sequência repetida", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
  it("recusa tamanho errado", () => {
    expect(cpfValido("1234567890")).toBe(false);
  });
});

describe("validação de CNPJ", () => {
  it("aceita CNPJ real", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
  });
  it("recusa dígito verificador errado", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
  });
  it("recusa sequência repetida", () => {
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
  });
});

describe("documentoValido", () => {
  it("campo vazio é permitido", () => {
    expect(documentoValido("")).toBe(true);
  });
  it("valida pelo tipo certo", () => {
    expect(documentoValido("529.982.247-25")).toBe(true);
    expect(documentoValido("11.222.333/0001-81")).toBe(true);
    expect(documentoValido("529.982.247-26")).toBe(false);
  });
});

describe("telefone e CEP", () => {
  it("formata celular", () => {
    expect(mascaraTelefone("33912345678")).toBe("(33) 91234-5678");
  });
  it("formata fixo", () => {
    expect(mascaraTelefone("3335211234")).toBe("(33) 3521-1234");
  });
  it("formata parcial conforme digita", () => {
    expect(mascaraTelefone("33")).toBe("(33");
    expect(mascaraTelefone("339")).toBe("(33) 9");
  });
  it("formata CEP", () => {
    expect(mascaraCEP("39800000")).toBe("39800-000");
  });
});
