import { describe, it, expect } from "vitest";
import { traduzirErroBanco } from "./erros-banco";

describe("tradução do erro do banco", () => {
  it("explica o bloqueio do controle de acesso e diz o que fazer", () => {
    // foi este o erro que o usuário viu: correto e inútil
    const t = traduzirErroBanco({
      message: 'new row violates row-level security policy for table "customers"',
    });
    expect(t).toContain("clientes");
    expect(t).toContain("perfil");
    expect(t).toContain("/primeiro-acesso");
  });

  it("reconhece o pedido sem atendente cadastrado", () => {
    const t = traduzirErroBanco({
      message: 'insert or update on table "orders" violates foreign key constraint "orders_atendente_id_fkey"',
    });
    expect(t).toContain("não tem perfil cadastrado");
    expect(t).toContain("Usuários");
  });

  it("não vaza nome de constraint como se fosse recado ao operador", () => {
    const t = traduzirErroBanco({
      message: 'violates foreign key constraint "orders_customer_id_fkey"',
    });
    expect(t).toContain("não existe mais");
  });

  it("telefone repetido vira recado de cliente duplicado", () => {
    expect(traduzirErroBanco({
      code: "23505",
      message: 'duplicate key value violates unique constraint "customers_store_id_telefone_key"',
    })).toBe("Já existe cliente com este telefone.");
  });

  it("campo obrigatório diz qual campo", () => {
    expect(traduzirErroBanco({
      code: "23502", message: 'null value in column "nome" violates not-null constraint',
    })).toBe("Falta preencher o campo nome.");
  });

  it("estoque negativo é dito como estoque, não como check constraint", () => {
    expect(traduzirErroBanco({
      message: 'new row for relation "inventory" violates check constraint "chk_estoque_nao_negativo"',
    })).toContain("estoque negativo");
  });

  it("erro das nossas funções passa inteiro — já está em português", () => {
    const nosso = "Estoque disponível insuficiente: 2 livres (3 reservadas para outros pedidos)";
    expect(traduzirErroBanco({ code: "P0001", message: nosso })).toBe(nosso);
  });

  it("sem erro nenhum usa a ação para montar a frase", () => {
    expect(traduzirErroBanco(null, "salvar o cliente")).toBe("Não consegui salvar o cliente.");
  });

  it("sessão vencida é dita como sessão, não como JWT", () => {
    expect(traduzirErroBanco({ message: "JWT expired" }))
      .toBe("Sua sessão expirou. Entre de novo.");
  });
});
