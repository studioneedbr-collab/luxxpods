import { describe, expect, it } from "vitest";
import { PADRAO, validar } from "./configuracoes";

describe("padrões seguros", () => {
  // sem configuração, o canal não pode disparar marketing sozinho
  it("marketing nasce desligado", () => {
    expect(PADRAO.whatsapp_envios.marketing).toBe(false);
    expect(PADRAO.whatsapp_envios.cobranca).toBe(false);
    expect(PADRAO.whatsapp_envios.transacional).toBe(true);
  });

  it("o bot valida maioridade por padrão", () => {
    expect(PADRAO.chatbot.validar_maioridade).toBe(true);
  });

  it("venda sem estoque nasce bloqueada", () => {
    expect(PADRAO.estoque.bloquear_venda_sem_estoque).toBe(true);
  });
});

describe("validação do atendimento", () => {
  const ok = { ...PADRAO.atendimento };

  it("aceita a configuração padrão", () => {
    expect(validar("atendimento", ok)).toEqual([]);
  });

  it("recusa horário fora do formato", () => {
    const p = validar("atendimento", { ...ok, horario_inicio: "10h" });
    expect(p[0].campo).toBe("horario_inicio");
  });

  it("recusa horário impossível", () => {
    expect(validar("atendimento", { ...ok, horario_fim: "25:00" }).length).toBe(1);
  });

  it("recusa follow-up de zero minuto", () => {
    expect(validar("atendimento", { ...ok, followup_minutos: 0 }).length).toBe(1);
  });

  it("recusa primeira mensagem vazia", () => {
    expect(validar("atendimento", { ...ok, mensagem_inicial: "  " }).length).toBe(1);
  });
});

describe("validação de pagamentos", () => {
  // a regra que impede deixar a loja sem como receber
  it("recusa desligar todas as formas de pagamento", () => {
    const p = validar("pagamentos", {
      pix_ativo: false, dinheiro_ativo: false, cartao_ativo: false,
    });
    expect(p[0].erro).toContain("ao menos uma forma");
  });

  it("exige a chave quando o PIX está ativo", () => {
    const p = validar("pagamentos", { pix_ativo: true, chave_pix: "" });
    expect(p.some((x) => x.campo === "chave_pix")).toBe(true);
  });

  it("aceita PIX ativo com chave", () => {
    expect(validar("pagamentos", {
      pix_ativo: true, chave_pix: "contato@luxx.com", dinheiro_ativo: true,
    })).toEqual([]);
  });

  it("não exige chave se o PIX está desligado", () => {
    expect(validar("pagamentos", {
      pix_ativo: false, dinheiro_ativo: true, chave_pix: null,
    })).toEqual([]);
  });
});

describe("validação de estoque e entrega", () => {
  it("recusa reserva curta demais", () => {
    // 1 minuto tiraria a peça do cliente no meio da conversa
    expect(validar("estoque", { reserva_minutos: 1, estoque_minimo_padrao: 3 }).length).toBe(1);
  });

  it("aceita a faixa usável de reserva", () => {
    expect(validar("estoque", { reserva_minutos: 15, estoque_minimo_padrao: 3 })).toEqual([]);
  });

  it("recusa taxa de entrega negativa", () => {
    expect(validar("entrega", {
      taxa_padrao: -1, taxa_gratis_acima: 150, prazo_minutos: 45,
    }).length).toBe(1);
  });
});
