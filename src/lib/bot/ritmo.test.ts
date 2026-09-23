import { describe, expect, it } from "vitest";
import { deveSilenciar, enviarComRitmo, envioLiberado, podeReceber } from "./ritmo";

describe("ritmo de envio", () => {
  it("para no teto do lote e devolve os adiados", async () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({ destino: `n${i}`, carga: i }));
    const r = await enviarComRitmo(itens, async () => true, {
      MAX_POR_LOTE: 3, PAUSA_MIN_MS: 0, PAUSA_MAX_MS: 0,
    });
    expect(r.enviados).toBe(3);
    expect(r.parouPor).toBe("lote");
    expect(r.adiados.length).toBe(17);
  });

  it("abre o disjuntor depois de falhas seguidas", async () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ destino: `n${i}`, carga: i }));
    const r = await enviarComRitmo(itens, async () => false, {
      PAUSA_MIN_MS: 0, PAUSA_MAX_MS: 0,
    });
    expect(r.parouPor).toBe("disjuntor");
    expect(r.falhados).toBe(3);
  });

  it("uma falha isolada não abre o disjuntor", async () => {
    const itens = Array.from({ length: 5 }, (_, i) => ({ destino: `n${i}`, carga: i }));
    let n = 0;
    const r = await enviarComRitmo(itens, async () => { n++; return n !== 2; }, {
      PAUSA_MIN_MS: 0, PAUSA_MAX_MS: 0,
    });
    expect(r.enviados).toBe(4);
    expect(r.falhados).toBe(1);
    expect(r.parouPor).toBeUndefined();
  });
});

describe("teto por pessoa", () => {
  const agora = new Date("2026-09-23T12:00:00Z");
  const diasAtras = (n: number) => new Date(agora.getTime() - n * 864e5);

  it("transacional nunca tem teto", () => {
    const muitos = Array.from({ length: 50 }, () => ({
      natureza: "transacional" as const, quando: diasAtras(1),
    }));
    expect(podeReceber("transacional", muitos, agora).pode).toBe(true);
  });

  it("marketing respeita 1 a cada 14 dias", () => {
    const recente = [{ natureza: "marketing" as const, quando: diasAtras(3) }];
    const r = podeReceber("marketing", recente, agora);
    expect(r.pode).toBe(false);
    expect(r.diasAteLiberar).toBe(11);
  });

  it("marketing libera depois da janela", () => {
    const antigo = [{ natureza: "marketing" as const, quando: diasAtras(20) }];
    expect(podeReceber("marketing", antigo, agora).pode).toBe(true);
  });
});

describe("interruptor", () => {
  // a regra que evita disparar quando a configuração some
  it("sem configuração, NADA é enviado", () => {
    expect(envioLiberado("marketing", null)).toBe(false);
    expect(envioLiberado("transacional", undefined)).toBe(false);
  });

  it("só envia o que está explicitamente ligado", () => {
    const cfg = { transacional: true, marketing: false };
    expect(envioLiberado("transacional", cfg)).toBe(true);
    expect(envioLiberado("marketing", cfg)).toBe(false);
    expect(envioLiberado("cobranca", cfg)).toBe(false);
  });
});

describe("silenciar cliente", () => {
  const limpo = { pediuParar: false, enviosSemNenhumaResposta: 0, entregasFalhadasSeguidas: 0 };

  it("quem pediu para parar não recebe marketing", () => {
    expect(deveSilenciar("marketing", { ...limpo, pediuParar: true }).silencia).toBe(true);
  });

  it("mas continua recebendo o transacional do próprio pedido", () => {
    expect(deveSilenciar("transacional", { ...limpo, pediuParar: true }).silencia).toBe(false);
  });

  it("silencia depois de 5 envios sem resposta", () => {
    expect(deveSilenciar("marketing", { ...limpo, enviosSemNenhumaResposta: 5 }).silencia)
      .toBe(true);
  });

  it("silencia quando as entregas param de chegar", () => {
    expect(deveSilenciar("cobranca", { ...limpo, entregasFalhadasSeguidas: 2 }).silencia)
      .toBe(true);
  });
});
