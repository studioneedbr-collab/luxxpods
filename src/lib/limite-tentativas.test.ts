import { beforeEach, describe, expect, it } from "vitest";
import {
  limparTentativas, LIMITE_LOGIN, registrarTentativa, zerarTudo,
} from "./limite-tentativas";

const t0 = 1_700_000_000_000;

beforeEach(() => zerarTudo());

describe("freio de tentativas", () => {
  it("deixa passar dentro do limite", () => {
    for (let i = 1; i <= LIMITE_LOGIN.max; i++) {
      const r = registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
      expect(r.permitido, `tentativa ${i}`).toBe(true);
    }
  });

  it("bloqueia ao estourar e diz quanto esperar", () => {
    for (let i = 0; i < LIMITE_LOGIN.max; i++) registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    const r = registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    expect(r.permitido).toBe(false);
    expect(r.esperarSegundos).toBe(900);
  });

  it("continua bloqueado durante o castigo", () => {
    for (let i = 0; i <= LIMITE_LOGIN.max; i++) registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    const r = registrarTentativa("a@b.com", LIMITE_LOGIN, t0 + 60_000);
    expect(r.permitido).toBe(false);
  });

  it("libera depois do castigo", () => {
    for (let i = 0; i <= LIMITE_LOGIN.max; i++) registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    const depois = t0 + LIMITE_LOGIN.bloqueioMs + 1000;
    expect(registrarTentativa("a@b.com", LIMITE_LOGIN, depois).permitido).toBe(true);
  });

  it("janela vencida começa a contar do zero", () => {
    for (let i = 0; i < LIMITE_LOGIN.max; i++) registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    const depois = t0 + LIMITE_LOGIN.janelaMs + 1000;
    const r = registrarTentativa("a@b.com", LIMITE_LOGIN, depois);
    expect(r.permitido).toBe(true);
    expect(r.restantes).toBe(LIMITE_LOGIN.max - 1);
  });

  it("login certo zera o contador", () => {
    for (let i = 0; i < LIMITE_LOGIN.max; i++) registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    limparTentativas("a@b.com");
    expect(registrarTentativa("a@b.com", LIMITE_LOGIN, t0).restantes).toBe(LIMITE_LOGIN.max - 1);
  });

  it("uma pessoa bloqueada não bloqueia as outras", () => {
    for (let i = 0; i <= LIMITE_LOGIN.max; i++) registrarTentativa("a@b.com", LIMITE_LOGIN, t0);
    expect(registrarTentativa("outro@b.com", LIMITE_LOGIN, t0).permitido).toBe(true);
  });
});
