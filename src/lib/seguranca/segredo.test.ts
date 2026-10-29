import { afterEach, describe, expect, it, vi } from "vitest";
import { segredoConfere } from "./segredo";

afterEach(() => vi.unstubAllEnvs());

describe("segredo de webhook", () => {
  it("em produção, sem segredo configurado, nada passa", () => {
    // antes "sem segredo" era "aceita tudo": qualquer um forjava mensagem
    // de cliente ou pagamento aprovado
    vi.stubEnv("NODE_ENV", "production");
    expect(segredoConfere(undefined, "qualquer")).toBe(false);
    expect(segredoConfere("", null)).toBe(false);
  });

  it("fora de produção continua testável sem configurar", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(segredoConfere(undefined, null)).toBe(true);
  });

  it("com segredo, só o igual passa", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(segredoConfere("abc123", "abc123")).toBe(true);
    expect(segredoConfere("abc123", "abc124")).toBe(false);
    expect(segredoConfere("abc123", "abc")).toBe(false);
    expect(segredoConfere("abc123", null)).toBe(false);
  });
});
