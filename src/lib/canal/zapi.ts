import type {
  AtualizacaoStatus, Canal, EventoCanal, MensagemEntrada, MensagemSaida,
  ResultadoEnvio,
} from "./tipos";

/**
 * Z-API — provedor não oficial, sobre o WhatsApp comum.
 *
 * Entra no ar em minutos, sem verificação de conta comercial, mas o número
 * pode ser banido por uso automatizado. Por isso todo envio passa pelo
 * controle de ritmo (`src/lib/bot/ritmo.ts`) antes de chegar aqui.
 */
export class CanalZApi implements Canal {
  nome = "whatsapp-zapi";

  private readonly instancia = process.env.ZAPI_INSTANCE_ID ?? "";
  private readonly token = process.env.ZAPI_TOKEN ?? "";
  private readonly clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  configurado() {
    return Boolean(this.instancia && this.token);
  }

  private get base() {
    return `https://api.z-api.io/instances/${this.instancia}/token/${this.token}`;
  }

  async enviar(m: MensagemSaida): Promise<ResultadoEnvio> {
    if (!this.configurado()) {
      return { ok: false, erro: "Z-API não configurada", tentarDeNovo: false };
    }

    const { rota, corpo } = this.montarCorpo(m);

    try {
      const r = await fetch(`${this.base}/${rota}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.clientToken ? { "Client-Token": this.clientToken } : {}),
        },
        body: JSON.stringify(corpo),
      });

      const dados = await r.json().catch(() => ({}));

      if (!r.ok) {
        return {
          ok: false,
          erro: dados?.error ?? dados?.message ?? `HTTP ${r.status}`,
          tentarDeNovo: r.status >= 500 || r.status === 429,
        };
      }

      return { ok: true, idExterno: dados?.messageId ?? dados?.id };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "falha de rede",
        tentarDeNovo: true,
      };
    }
  }

  private montarCorpo(m: MensagemSaida): { rota: string; corpo: Record<string, unknown> } {
    switch (m.tipo) {
      case "imagem":
        return { rota: "send-image", corpo: { phone: m.para, image: m.arquivo, caption: m.legenda } };
      case "documento":
        return {
          rota: "send-document/pdf",
          corpo: { phone: m.para, document: m.arquivo, fileName: m.legenda ?? "arquivo.pdf" },
        };
      case "botoes":
        return {
          rota: "send-button-list",
          corpo: {
            phone: m.para,
            message: m.texto,
            buttonList: {
              buttons: (m.botoes ?? []).map((b) => ({ id: b.id, label: b.rotulo })),
            },
          },
        };
      default:
        return { rota: "send-text", corpo: { phone: m.para, message: m.texto ?? "" } };
    }
  }

  interpretarWebhook(corpo: unknown): EventoCanal | null {
    const c = corpo as Record<string, unknown>;
    if (!c) return null;

    // a Z-API manda a mensagem do próprio número de volta; ignoramos
    if (c.fromMe === true) return null;

    const mensagens: MensagemEntrada[] = [];
    const statusAtualizados: AtualizacaoStatus[] = [];

    if (c.type === "ReceivedCallback" || c.text || c.image) {
      const texto = (c.text as { message?: string } | undefined)?.message;
      const imagem = c.image as { imageUrl?: string; caption?: string } | undefined;

      mensagens.push({
        idExterno: String(c.messageId ?? c.id ?? ""),
        de: String(c.phone ?? ""),
        nome: (c.senderName ?? c.chatName) as string | undefined,
        tipo: imagem ? "imagem" : texto ? "texto" : "desconhecido",
        texto: texto ?? imagem?.caption,
        arquivo: imagem?.imageUrl,
        recebidaEm: new Date(Number(c.momment ?? Date.now())),
      });
    }

    if (c.type === "MessageStatusCallback" || c.status) {
      const bruto = String(c.status ?? "").toUpperCase();
      statusAtualizados.push({
        idExterno: String(c.messageId ?? c.id ?? ""),
        status: bruto === "READ" ? "lida"
          : bruto === "RECEIVED" || bruto === "DELIVERED" ? "entregue"
          : bruto === "ERROR" || bruto === "FAILED" ? "erro" : "enviada",
        em: new Date(Number(c.momment ?? Date.now())),
      });
    }

    if (mensagens.length === 0 && statusAtualizados.length === 0) return null;

    return {
      id: String(c.messageId ?? c.id ?? `zapi-${Date.now()}`),
      mensagens,
      statusAtualizados,
    };
  }

  /** A Z-API usa um token fixo no header, não assinatura por corpo. */
  validarAssinatura(_corpo: string, assinatura: string | null): boolean {
    const esperado = process.env.ZAPI_WEBHOOK_SECRET;
    if (!esperado) return true;
    return assinatura === esperado;
  }
}
