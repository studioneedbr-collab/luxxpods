import { afterEach, describe, expect, it, vi } from "vitest";
import { CanalFluxoApi } from "./fluxoapi";

/**
 * Os corpos abaixo são os exemplos da especificação OpenAPI da FluxoAPI,
 * copiados de `/docs/openapi.json`. Inventar o formato aqui faria o teste
 * passar e o webhook de verdade chegar vazio — foi o que aconteceu com a
 * Z-API, que lia só texto e imagem.
 */

const canal = new CanalFluxoApi();

const evento = (tipo: string, data: Record<string, unknown>) => ({
  id: "evt_01M1HQ9K2V7D4FRX8NCP3TQZWA",
  type: tipo,
  instance_id: "inst_01M1HQ7SE7C7QFBGMN8Y8ZNKAP",
  created_at: "2026-09-04T11:31:02.000Z",
  data,
});

describe("webhook da FluxoAPI — mensagem recebida", () => {
  it("lê texto", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      conversation_id: "conv_1", message_id: "msg_1",
      from: "5519991802264", type: "text", text: "quanto é o ignite?",
      sent_from_phone: false,
    }));

    expect(e?.id).toBe("evt_01M1HQ9K2V7D4FRX8NCP3TQZWA");
    expect(e?.mensagens).toHaveLength(1);
    expect(e?.mensagens[0]).toMatchObject({
      idExterno: "msg_1", de: "5519991802264",
      tipo: "texto", texto: "quanto é o ignite?",
    });
  });

  /**
   * Áudio é o caso mais comum no Brasil e o que mais machuca quando quebra:
   * sem texto descritivo o atendente abre a conversa, vê uma linha em branco
   * e acha que o sistema perdeu a mensagem.
   */
  it("descreve áudio de voz, que não tem legenda", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_2", from: "5519991802264", type: "audio", text: "",
      media: { id: "1", mime_type: "audio/ogg; codecs=opus", voice: true,
               download_path: "/v1/messages/msg_2/media" },
    }));

    expect(e?.mensagens[0]?.tipo).toBe("audio");
    expect(e?.mensagens[0]?.texto).toBe("[áudio de voz]");
    /**
     * A nossa rota, não a da FluxoAPI: a mídia deles exige GET assinado, e
     * a URL crua num `<img src>` daria 401 e ícone quebrado na conversa.
     */
    expect(e?.mensagens[0]?.arquivo).toBe("/api/midia/msg_2");
  });

  it("usa o nome do arquivo quando o documento não tem legenda", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_3", from: "5519991802264", type: "document",
      text: "comprovante.pdf",
      media: { filename: "comprovante.pdf", mime_type: "application/pdf",
               download_path: "/v1/messages/msg_3/media" },
    }));

    expect(e?.mensagens[0]?.tipo).toBe("documento");
    expect(e?.mensagens[0]?.texto).toBe("comprovante.pdf");
  });

  it("descreve figurinha, que nunca tem texto", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_4", from: "5519991802264", type: "sticker", text: "",
      media: { download_path: "/v1/messages/msg_4/media" },
    }));
    expect(e?.mensagens[0]?.texto).toBe("[figurinha]");
  });

  it("lê o botão apertado, com id e título", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_5", from: "5519991802264", type: "interactive",
      text: "Confirmar",
      reply: { kind: "button_reply", id: "confirmar", title: "Confirmar" },
    }));

    expect(e?.mensagens[0]).toMatchObject({
      tipo: "botoes", botaoId: "confirmar", texto: "Confirmar",
    });
  });

  it("lê a linha escolhida da lista", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_6", from: "5519991802264", type: "interactive", text: "",
      reply: { kind: "list_reply", id: "sabor_watermelon", title: "Watermelon Ice" },
    }));

    expect(e?.mensagens[0]?.botaoId).toBe("sabor_watermelon");
    expect(e?.mensagens[0]?.texto).toBe("Watermelon Ice");
  });

  it("tira o que não é dígito do telefone", () => {
    const e = canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_7", from: "+55 (19) 99180-2264", type: "text", text: "oi",
    }));
    expect(e?.mensagens[0]?.de).toBe("5519991802264");
  });

  it("descarta evento sem telefone ou sem id de mensagem", () => {
    expect(canal.interpretarWebhook(evento("message.received", {
      message_id: "msg_8", type: "text", text: "oi",
    }))).toBeNull();

    expect(canal.interpretarWebhook(evento("message.received", {
      from: "5519991802264", type: "text", text: "oi",
    }))).toBeNull();
  });
});

/* ------------------------------------------------- resposta pelo celular -- */

describe("o dono respondendo pelo aplicativo", () => {
  /**
   * É a diferença que importa em relação à Z-API. Sem tratar isso, o bot
   * responde por cima de quem já está atendendo e o cliente lê duas
   * respostas diferentes para a mesma pergunta.
   */
  it("vira fala da loja, não mensagem de cliente", () => {
    const e = canal.interpretarWebhook(evento("message.sent_from_phone", {
      conversation_id: "conv_1", message_id: "msg_9",
      to: "5519996155951", type: "text",
      text: "Oi! Já vou te atender por aqui.", sent_from_phone: true,
    }));

    // `de` é o telefone do CLIENTE: é a conversa onde a mensagem cai
    expect(e?.mensagens).toHaveLength(1);
    expect(e?.mensagens[0]).toMatchObject({
      idExterno: "msg_9", de: "5519996155951",
      texto: "Oi! Já vou te atender por aqui.", enviadaPorMim: true,
    });
  });

  it("descreve a mídia que o dono mandou sem legenda", () => {
    const e = canal.interpretarWebhook(evento("message.sent_from_phone", {
      message_id: "msg_10", to: "5519996155951", type: "image", text: "",
      media: { download_path: "/v1/messages/msg_10/media" },
    }));
    expect(e?.mensagens[0]?.texto).toBe("[imagem]");
    expect(e?.mensagens[0]?.enviadaPorMim).toBe(true);
  });
});

/* ----------------------------------------------------------- status ------ */

describe("status de entrega", () => {
  it("traduz os status da Meta para os de casa", () => {
    const pares: Array<[string, string]> = [
      ["queued", "enviada"], ["sent", "enviada"],
      ["delivered", "entregue"], ["read", "lida"], ["failed", "erro"],
    ];

    for (const [daMeta, daCasa] of pares) {
      const e = canal.interpretarWebhook(evento("message.status", {
        message_id: "msg_11", conversation_id: "conv_1",
        status: daMeta, rank: 2, at: "2026-09-04T11:27:59.000Z",
      }));
      expect(e?.statusAtualizados[0]?.status, daMeta).toBe(daCasa);
    }
  });

  it("não inventa status que não conhece", () => {
    expect(canal.interpretarWebhook(evento("message.status", {
      message_id: "msg_12", status: "algo_novo",
    }))).toBeNull();
  });

  it("usa a hora do evento, não a de agora", () => {
    const e = canal.interpretarWebhook(evento("message.status", {
      message_id: "msg_13", status: "delivered", at: "2026-09-04T11:27:59.000Z",
    }));
    expect(e?.statusAtualizados[0]?.em.toISOString())
      .toBe("2026-09-04T11:27:59.000Z");
  });
});

/* ---------------------------------------------------- o que não processa -- */

describe("o que a FluxoAPI manda e não vira conversa", () => {
  it("ignora evento de instância, que não tem mensagem", () => {
    for (const tipo of ["instance.status_changed", "instance.access_expiring"]) {
      expect(canal.interpretarWebhook(evento(tipo, { status: "connected" })), tipo)
        .toBeNull();
    }
  });

  it("ignora corpo sem tipo ou sem dados", () => {
    expect(canal.interpretarWebhook({ id: "evt_1" })).toBeNull();
    expect(canal.interpretarWebhook({ type: "message.received" })).toBeNull();
    expect(canal.interpretarWebhook(null)).toBeNull();
    expect(canal.interpretarWebhook("não é objeto")).toBeNull();
  });
});

/* ------------------------------------------------- assinatura ausente -- */

describe("webhook sem segredo configurado", () => {
  const pedido = () =>
    new Request("https://exemplo.com/api/webhooks/whatsapp", { method: "POST" });

  afterEach(() => { vi.unstubAllEnvs(); });

  /**
   * O endereço do webhook é descobrível. Sem conferência, qualquer um forja
   * mensagem de cliente — inclusive pedido. Antes isto devolvia `true` com
   * um aviso no log, e passou batido até o deploy.
   */
  it("recusa em produção quando o segredo não está configurado", () => {
    vi.stubEnv("FLUXOAPI_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(canal.validarAssinatura("{}", pedido())).toBe(false);
  });

  it("fora de produção passa, senão não dá para exercitar à mão", () => {
    vi.stubEnv("FLUXOAPI_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(canal.validarAssinatura("{}", pedido())).toBe(true);
  });

  it("com segredo, confere de verdade em qualquer ambiente", () => {
    vi.stubEnv("FLUXOAPI_WEBHOOK_SECRET", "whsec_qualquer");
    vi.stubEnv("NODE_ENV", "development");
    expect(canal.validarAssinatura("{}", pedido())).toBe(false);
  });
});

/* -------------------------------------------------------- configuração -- */

describe("configuração", () => {
  it("exige as três credenciais", () => {
    expect(canal.configurado()).toBe(
      Boolean(process.env.FLUXOAPI_KEY && process.env.FLUXOAPI_SECRET
              && process.env.FLUXOAPI_INSTANCE_ID));
  });

  it("não envia sem credencial, e diz que não vale tentar de novo", async () => {
    if (canal.configurado()) return;
    const r = await canal.enviar({ para: "5533999990000", tipo: "texto", texto: "oi" });
    expect(r.ok).toBe(false);
    expect(r.tentarDeNovo).toBe(false);
  });
});
