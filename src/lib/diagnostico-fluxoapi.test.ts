import { describe, expect, it } from "vitest";
import { avaliarInstancia } from "./diagnostico-fluxoapi";
import type { DiagnosticoInstancia } from "./canal/fluxoapi";

/**
 * O corpo abaixo é o que a instância da loja devolveu de verdade na primeira
 * chamada assinada, em 29/10/2026. Partir do real importa: eu tinha lido o
 * nível errado do JSON e a tela dizia "no ar" sem número nem estado.
 */
const REAL: DiagnosticoInstancia = {
  ok: true,
  numero: "+1 711-603-4151",
  nomeVerificado: "Luxx",
  estado: "connected",
  modo: "coexistence",
  qualidade: "unknown",
  webhook: "https://www.luxxpods.com/api/webhooks/whatsapp",
  acessoExpiraEm: new Date("2026-12-28T15:06:08.806Z"),
  limite24h: 250,
};

const hoje = new Date("2026-10-29T12:00:00Z");
const ok = { semSegredoDeWebhook: false, chaveDeTeste: false, agora: hoje };

describe("avaliar a instância da FluxoAPI", () => {
  it("instância saudável fica verde e diz o número", () => {
    const s = avaliarInstancia(REAL, ok);
    expect(s.tom).toBe("ok");
    expect(s.rotulo).toContain("+1 711-603-4151");
    expect(s.detalhe).toContain("250 conversas");
  });

  /**
   * O defeito que a chamada de verdade me mostrou, e o pior de todos: a
   * instância responde `connected`, o envio funciona, e sem webhook NENHUMA
   * mensagem de cliente chega. Verde aqui faria alguém conferir a tela, ver
   * "no ar", e descobrir pelo cliente reclamando que ninguém respondeu.
   */
  it("sem webhook é VERMELHO, não aviso — o canal está pela metade", () => {
    const s = avaliarInstancia({ ...REAL, webhook: null }, ok);
    expect(s.tom).toBe("bad");
    expect(s.rotulo).toContain("sem webhook");
    expect(s.detalhe).toContain("nenhuma mensagem de cliente chega");
  });

  it("o webhook faltando ganha prioridade sobre qualquer aviso", () => {
    const s = avaliarInstancia({ ...REAL, webhook: null, qualidade: "red" }, {
      semSegredoDeWebhook: true, chaveDeTeste: true, agora: hoje,
    });
    expect(s.tom).toBe("bad");
    expect(s.rotulo).toContain("sem webhook");
  });

  it("explica cada estado que não é connected, em português", () => {
    for (const [estado, trecho] of [
      ["pending", "não terminou de conectar"],
      ["disconnected", "reconecte"],
      ["suspended", "suspensa"],
    ] as const) {
      const s = avaliarInstancia({ ...REAL, estado }, ok);
      expect(s.tom, estado).toBe("bad");
      expect(s.detalhe, estado).toContain(trecho);
    }
  });

  it("não engole estado novo que a FluxoAPI inventar", () => {
    const s = avaliarInstancia({ ...REAL, estado: "algo_novo" }, ok);
    expect(s.tom).toBe("bad");
    expect(s.detalhe).toContain("algo_novo");
  });

  it("avisa que o webhook aceita qualquer corpo sem o segredo", () => {
    const s = avaliarInstancia(REAL, { ...ok, semSegredoDeWebhook: true });
    expect(s.tom).toBe("warn");
    expect(s.detalhe).toContain("qualquer um pode postar");
  });

  it("avisa que a chave de teste não manda nada de verdade", () => {
    const s = avaliarInstancia(REAL, { ...ok, chaveDeTeste: true });
    expect(s.tom).toBe("warn");
    expect(s.detalhe).toContain("fxk_test_");
  });

  /**
   * `api_only` tira o WhatsApp do celular do dono — que é exatamente a razão
   * de escolher a FluxoAPI. Mudar de modo sem perceber mataria o recurso.
   */
  it("avisa quando o modo deixa de ser coexistência", () => {
    const s = avaliarInstancia({ ...REAL, modo: "api_only" }, ok);
    expect(s.tom).toBe("warn");
    expect(s.detalhe).toContain("não funciona no app do celular");
  });

  it("avisa qualidade amarela e vermelha, e ignora as outras", () => {
    expect(avaliarInstancia({ ...REAL, qualidade: "red" }, ok).tom).toBe("warn");
    expect(avaliarInstancia({ ...REAL, qualidade: "yellow" }, ok).tom).toBe("warn");
    expect(avaliarInstancia({ ...REAL, qualidade: "green" }, ok).tom).toBe("ok");
    expect(avaliarInstancia({ ...REAL, qualidade: "unknown" }, ok).tom).toBe("ok");
  });

  /* ------------------------------------------------- validade do acesso -- */

  it("fica quieto enquanto o vencimento está longe", () => {
    // 2026-12-28 está a 60 dias de 2026-10-29
    expect(avaliarInstancia(REAL, ok).tom).toBe("ok");
    expect(avaliarInstancia(REAL, ok).detalhe).toContain("acesso até");
  });

  it("avisa quando o acesso está perto de vencer", () => {
    const s = avaliarInstancia(
      { ...REAL, acessoExpiraEm: new Date("2026-11-05T12:00:00Z") }, ok);
    expect(s.tom).toBe("warn");
    expect(s.detalhe).toMatch(/vence em \d+ dia/);
  });

  it("grita quando já venceu", () => {
    const s = avaliarInstancia(
      { ...REAL, acessoExpiraEm: new Date("2026-10-01T12:00:00Z") }, ok);
    expect(s.tom).toBe("warn");
    expect(s.detalhe).toContain("VENCEU");
  });

  it("aguenta instância sem data de vencimento", () => {
    const s = avaliarInstancia({ ...REAL, acessoExpiraEm: null }, ok);
    expect(s.tom).toBe("ok");
  });

  it("erro de chamada vira vermelho com o motivo", () => {
    const s = avaliarInstancia(
      { ok: false, erro: "a chave foi recusada" }, ok);
    expect(s.tom).toBe("bad");
    expect(s.detalhe).toContain("recusada");
  });

  it("junta todos os avisos em vez de mostrar só o primeiro", () => {
    const s = avaliarInstancia({ ...REAL, modo: "api_only", qualidade: "red" }, {
      semSegredoDeWebhook: true, chaveDeTeste: true, agora: hoje,
    });
    expect(s.tom).toBe("warn");
    for (const trecho of ["qualquer um pode postar", "fxk_test_", "api_only", "red"]) {
      expect(s.detalhe, trecho).toContain(trecho);
    }
  });
});
