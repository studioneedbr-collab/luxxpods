import { describe, expect, it } from "vitest";
import { ehHojeSP, fimDoDiaSP, hojeSP, inicioDoDiaSP, somarDias } from "./data-hora";

describe("datas no fuso de Brasília", () => {
  it("22h de Brasília ainda é hoje — em UTC já era amanhã", () => {
    // 28/10 22:30 em Brasília = 29/10 01:30 UTC
    const noite = new Date("2026-10-29T01:30:00Z");
    expect(hojeSP(noite)).toBe("2026-10-28");
    expect(ehHojeSP("2026-10-28T23:00:00-03:00", noite)).toBe(true);
  });

  it("o dia começa e termina à meia-noite de Brasília", () => {
    expect(inicioDoDiaSP("2026-10-28").toISOString()).toBe("2026-10-28T03:00:00.000Z");
    expect(fimDoDiaSP("2026-10-28").toISOString()).toBe("2026-10-29T02:59:59.999Z");
  });

  it("soma dias atravessando o mês", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
