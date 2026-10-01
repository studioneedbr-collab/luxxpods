import { describe, expect, it } from "vitest";
import { esperaAteProxima, MAX_TENTATIVAS } from "./tipos";

describe("espera entre tentativas", () => {
  it("cresce a cada falha", () => {
    expect(esperaAteProxima(0)).toBe(30_000);
    expect(esperaAteProxima(1)).toBe(60_000);
    expect(esperaAteProxima(2)).toBe(120_000);
    expect(esperaAteProxima(3)).toBe(240_000);
  });

  it("para de crescer em 15 minutos", () => {
    expect(esperaAteProxima(10)).toBe(900_000);
    expect(esperaAteProxima(99)).toBe(900_000);
  });
});

describe("limite de tentativas", () => {
  it("impressão insiste mais que follow-up", () => {
    // comanda não impressa trava a operação; follow-up atrasado perde a graça
    expect(MAX_TENTATIVAS.imprimir_pedido).toBeGreaterThan(MAX_TENTATIVAS.followup_catalogo);
  });

  it("todo tipo declara um limite", () => {
    Object.values(MAX_TENTATIVAS).forEach((n) => {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(10);
    });
  });
});
