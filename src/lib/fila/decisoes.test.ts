import { describe, expect, it } from "vitest";
import { decidirFollowup, decidirTentativa } from "./decisoes";

const agendadoApos = new Date("2026-09-23T12:00:00Z");
const depois = "2026-09-23T12:03:00Z";
const antes = "2026-09-23T11:58:00Z";

describe("follow-up do catálogo", () => {
  it("envia quando o cliente sumiu depois do catálogo", () => {
    const r = decidirFollowup(
      { bot_ativo: true, ultima_interacao_cliente: antes }, agendadoApos);
    expect(r.enviar).toBe(true);
  });

  // a regra que evita parecer robô
  it("NÃO envia se o cliente respondeu no meio tempo", () => {
    const r = decidirFollowup(
      { bot_ativo: true, ultima_interacao_cliente: depois }, agendadoApos);
    expect(r.enviar).toBe(false);
    expect(r).toMatchObject({ motivo: "o cliente respondeu" });
  });

  it("NÃO envia se um atendente assumiu", () => {
    const r = decidirFollowup(
      { bot_ativo: false, ultima_interacao_cliente: antes }, agendadoApos);
    expect(r.enviar).toBe(false);
    expect(r).toMatchObject({ motivo: "um atendente assumiu a conversa" });
  });

  it("NÃO envia se a conversa sumiu", () => {
    expect(decidirFollowup(null, agendadoApos).enviar).toBe(false);
  });

  it("envia quando o cliente nunca escreveu depois", () => {
    const r = decidirFollowup(
      { bot_ativo: true, ultima_interacao_cliente: null }, agendadoApos);
    expect(r.enviar).toBe(true);
  });
});

describe("insistir ou desistir", () => {
  it("sucesso encerra o job", () => {
    expect(decidirTentativa("enviar_mensagem", 0, { ok: true }))
      .toEqual({ status: "pendente", reagendar: false });
  });

  it("cancelado não vira erro — não era para ter rodado", () => {
    expect(decidirTentativa("followup_catalogo", 0, { ok: false, cancelado: true }))
      .toEqual({ status: "cancelado", reagendar: false });
  });

  // insistir em número inválido só atrasa o que tem conserto
  it("erro sem conserto desiste na hora", () => {
    expect(decidirTentativa("enviar_mensagem", 0, { ok: false, tentarDeNovo: false }))
      .toEqual({ status: "erro", reagendar: false });
  });

  it("erro de rede tenta de novo", () => {
    expect(decidirTentativa("enviar_mensagem", 0, { ok: false, tentarDeNovo: true }))
      .toEqual({ status: "pendente", reagendar: true });
  });

  it("desiste ao bater no limite do tipo", () => {
    // enviar_mensagem tem limite 4
    expect(decidirTentativa("enviar_mensagem", 2, { ok: false, tentarDeNovo: true }).reagendar)
      .toBe(true);
    expect(decidirTentativa("enviar_mensagem", 3, { ok: false, tentarDeNovo: true }))
      .toEqual({ status: "erro", reagendar: false });
  });

  it("follow-up desiste antes que a impressão", () => {
    // follow-up: 2 tentativas · impressão: 5
    expect(decidirTentativa("followup_catalogo", 1, { ok: false, tentarDeNovo: true }).status)
      .toBe("erro");
    expect(decidirTentativa("imprimir_pedido", 1, { ok: false, tentarDeNovo: true }).status)
      .toBe("pendente");
  });
});
