import { describe, expect, it } from "vitest";
import {
  classificarAutor, escolherParaHistorico, janelaAberta, previaSemHistorico,
  TETO_DE_HISTORICOS,
} from "./importar-core";

describe("quem falou na mensagem do histórico", () => {
  it("entrada é sempre o cliente", () => {
    expect(classificarAutor({ direction: "inbound" })).toBe("cliente");
    expect(classificarAutor({ direction: "inbound", sent_from_phone: false }))
      .toBe("cliente");
  });

  /**
   * `outbound` sozinho não diz nada: pode ter saído do sistema ou do dedo do
   * dono no celular. Creditar tudo ao bot faria o relatório de atendimento
   * dar ao robô o trabalho da pessoa.
   */
  it("saída do celular do dono é atendente, não bot", () => {
    expect(classificarAutor({ direction: "outbound", sent_from_phone: true }))
      .toBe("atendente");
  });

  it("saída pela API é o bot", () => {
    expect(classificarAutor({ direction: "outbound", sent_from_phone: false }))
      .toBe("bot");
    expect(classificarAutor({ direction: "outbound" })).toBe("bot");
  });
});

describe("janela de 24h da Meta", () => {
  const agora = new Date("2026-10-29T12:00:00Z");

  it("aberta quando o fim está no futuro", () => {
    expect(janelaAberta(new Date("2026-10-29T20:00:00Z"), agora)).toBe(true);
  });

  it("fechada quando o fim já passou", () => {
    expect(janelaAberta(new Date("2026-10-29T06:00:00Z"), agora)).toBe(false);
  });

  /**
   * `null` é fechada, não aberta. Tratar ausência como "pode enviar" faria a
   * tela liberar o campo de texto e a mensagem morrer com 422 na fila.
   */
  it("sem data é fechada", () => {
    expect(janelaAberta(null, agora)).toBe(false);
    expect(janelaAberta(undefined, agora)).toBe(false);
  });
});

describe("prévia da conversa importada sem conteúdo", () => {
  it("avisa quando há não lidas, que é o que pede ação", () => {
    expect(previaSemHistorico(3)).toContain("não lidas");
  });

  it("diz que foi importada quando não há nada pendente", () => {
    expect(previaSemHistorico(0)).toContain("importada");
  });
});

describe("quais conversas ganham histórico", () => {
  const chat = (iso: string | undefined) =>
    ({ ultimaEm: iso ? new Date(iso) : undefined });

  it("as mais recentes primeiro: são as que alguém vai abrir", () => {
    const r = escolherParaHistorico([
      chat("2026-10-20T10:00:00Z"),
      chat("2026-10-29T10:00:00Z"),
      chat("2026-10-25T10:00:00Z"),
    ], 2);

    expect(r.map((c) => c.ultimaEm?.toISOString())).toEqual([
      "2026-10-29T10:00:00.000Z",
      "2026-10-25T10:00:00.000Z",
    ]);
  });

  /**
   * Cada histórico é uma chamada assinada à parte. Sem teto, cem conversas
   * seriam cem chamadas e a ação do servidor estoura no meio da gravação —
   * o usuário veria erro com metade já importada.
   */
  it("corta no teto", () => {
    const muitos = Array.from({ length: 100 }, (_, i) =>
      chat(`2026-10-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`));

    expect(escolherParaHistorico(muitos)).toHaveLength(TETO_DE_HISTORICOS);
  });

  it("não derruba conversa sem data, só a põe no fim", () => {
    const r = escolherParaHistorico([
      chat(undefined),
      chat("2026-10-29T10:00:00Z"),
    ], 2);
    expect(r[0]?.ultimaEm?.toISOString()).toBe("2026-10-29T10:00:00.000Z");
    expect(r).toHaveLength(2);
  });

  it("não mexe na lista que recebeu", () => {
    const original = [chat("2026-10-20T10:00:00Z"), chat("2026-10-29T10:00:00Z")];
    const copia = [...original];
    escolherParaHistorico(original, 1);
    expect(original).toEqual(copia);
  });
});
