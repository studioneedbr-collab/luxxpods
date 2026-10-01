import { describe, it, expect } from "vitest";
import { avaliarCupom, type CupomParaValidar } from "./cupom-core";

const base: CupomParaValidar = {
  codigo: "LUXX10", tipo_desconto: "percentual", valor: 10,
  valor_minimo: 80, status: "ativo", usos: 0, limite_total: 500,
};

const EM = new Date("2026-10-01T12:00:00Z");

describe("avaliação do cupom", () => {
  it("percentual sobre o subtotal", () => {
    expect(avaliarCupom(base, 200, EM)).toEqual({ vale: true, desconto: 20 });
  });

  it("valor fixo sai inteiro", () => {
    expect(avaliarCupom({ ...base, tipo_desconto: "valor", valor: 15 }, 200, EM))
      .toEqual({ vale: true, desconto: 15 });
  });

  it("não deixa o desconto passar do subtotal", () => {
    // senão o pedido fecharia com total negativo e o caixa ficaria devendo
    const r = avaliarCupom(
      { ...base, tipo_desconto: "valor", valor: 500, valor_minimo: 0 }, 90, EM);
    expect(r).toEqual({ vale: true, desconto: 90 });
  });

  it("recusa abaixo do mínimo, dizendo quanto falta", () => {
    const r = avaliarCupom(base, 50, EM);
    expect(r.vale).toBe(false);
    if (!r.vale) expect(r.motivo).toContain("faltam R$ 30.00");
  });

  it("recusa cupom vencido", () => {
    const r = avaliarCupom({ ...base, fim: "2026-09-01T00:00:00Z" }, 200, EM);
    expect(r).toMatchObject({ vale: false });
    if (!r.vale) expect(r.motivo).toContain("venceu");
  });

  it("recusa cupom que ainda não começou", () => {
    const r = avaliarCupom({ ...base, inicio: "2026-12-01T00:00:00Z" }, 200, EM);
    if (!r.vale) expect(r.motivo).toContain("ainda não começou");
  });

  it("recusa cupom desativado", () => {
    const r = avaliarCupom({ ...base, status: "inativo" }, 200, EM);
    if (!r.vale) expect(r.motivo).toContain("desativado");
  });

  it("recusa quando os usos esgotaram", () => {
    const r = avaliarCupom({ ...base, limite_total: 10, usos: 10 }, 200, EM);
    if (!r.vale) expect(r.motivo).toContain("esgotou");
  });

  it("limite nulo é ilimitado, não zero", () => {
    // `limite_total: null` significa sem limite; tratar como 0 mataria o cupom
    expect(avaliarCupom({ ...base, limite_total: null, usos: 9999 }, 200, EM).vale).toBe(true);
  });

  it("código inexistente não quebra", () => {
    expect(avaliarCupom(null, 200, EM)).toEqual({
      vale: false, motivo: "Cupom não encontrado.",
    });
  });

  it("arredonda o percentual ao centavo", () => {
    const r = avaliarCupom({ ...base, valor: 7 }, 99.99, EM);
    expect(r).toEqual({ vale: true, desconto: 7 });
  });
});
