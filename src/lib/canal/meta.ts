import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AtualizacaoStatus, Canal, EventoCanal, MensagemEntrada, MensagemSaida,
  ResultadoEnvio,
} from "./tipos";

/**
 * WhatsApp Cloud API, da Meta.
 *
 * É a via oficial: não cai por uso automatizado, tem status de entrega e
 * leitura, e permite botão. Exige número verificado e conta comercial.
 */
export class CanalMeta implements Canal {
  nome = "whatsapp-meta";

  private readonly token = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  private readonly numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  private readonly segredo = process.env.WHATSAPP_APP_SECRET ?? "";
  private readonly versao = "v21.0";

  configurado() {
    return Boolean(this.token && this.numeroId);
  }

  async enviar(m: MensagemSaida): Promise<ResultadoEnvio> {
    if (!this.configurado()) {
      return { ok: false, erro: "WhatsApp não configurado", tentarDeNovo: false };
    }

    const corpo = this.montarCorpo(m);

    try {
      const r = await fetch(
        `https://graph.facebook.com/${this.versao}/${this.numeroId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(corpo),
        },
      );

      const dados = await r.json();

      if (!r.ok) {
        const erro = dados?.error?.message ?? `HTTP ${r.status}`;
        // 4xx é problema do conteúdo ou do número: insistir não resolve
        const vale = r.status >= 500 || r.status === 429;
        return { ok: false, erro, tentarDeNovo: vale };
      }

      return { ok: true, idExterno: dados?.messages?.[0]?.id };
    } catch (e) {
      // rede fora do ar merece nova tentativa
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "falha de rede",
        tentarDeNovo: true,
      };
    }
  }

  private montarCorpo(m: MensagemSaida): Record<string, unknown> {
    const base = { messaging_product: "whatsapp", to: m.para };

    switch (m.tipo) {
      case "imagem":
        return { ...base, type: "image", image: { link: m.arquivo, caption: m.legenda } };
      case "documento":
        return { ...base, type: "document", document: { link: m.arquivo, caption: m.legenda } };
      case "botoes":
        return {
          ...base,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: m.texto },
            action: {
              buttons: (m.botoes ?? []).slice(0, 3).map((b) => ({
                type: "reply",
                reply: { id: b.id, title: b.rotulo.slice(0, 20) },
              })),
            },
          },
        };
      default:
        return { ...base, type: "text", text: { body: m.texto ?? "", preview_url: false } };
    }
  }

  interpretarWebhook(corpo: unknown): EventoCanal | null {
    const c = corpo as {
      entry?: Array<{
        id?: string;
        changes?: Array<{
          value?: {
            messages?: Array<Record<string, unknown>>;
            statuses?: Array<Record<string, unknown>>;
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          };
        }>;
      }>;
    };

    const entrada = c?.entry?.[0];
    const valor = entrada?.changes?.[0]?.value;
    if (!valor) return null;

    const mensagens: MensagemEntrada[] = [];
    const statusAtualizados: AtualizacaoStatus[] = [];

    for (const m of valor.messages ?? []) {
      const de = String(m.from ?? "");
      const contato = valor.contacts?.find((x) => x.wa_id === de);
      const tipo = String(m.type ?? "");

      mensagens.push({
        idExterno: String(m.id ?? ""),
        de,
        nome: contato?.profile?.name,
        tipo: this.traduzirTipo(tipo),
        texto:
          (m.text as { body?: string } | undefined)?.body ??
          (m.interactive as { button_reply?: { title?: string } } | undefined)?.button_reply?.title ??
          (m.image as { caption?: string } | undefined)?.caption,
        arquivo:
          (m.image as { id?: string } | undefined)?.id ??
          (m.document as { id?: string } | undefined)?.id,
        botaoId: (m.interactive as { button_reply?: { id?: string } } | undefined)?.button_reply?.id,
        recebidaEm: new Date(Number(m.timestamp ?? Date.now() / 1000) * 1000),
      });
    }

    for (const s of valor.statuses ?? []) {
      const situacao = String(s.status ?? "");
      statusAtualizados.push({
        idExterno: String(s.id ?? ""),
        status: situacao === "read" ? "lida"
          : situacao === "delivered" ? "entregue"
          : situacao === "failed" ? "erro" : "enviada",
        erro: (s.errors as Array<{ title?: string }> | undefined)?.[0]?.title,
        em: new Date(Number(s.timestamp ?? Date.now() / 1000) * 1000),
      });
    }

    // o id do evento é o que impede processar a mesma entrega duas vezes
    const id = mensagens[0]?.idExterno
      ?? statusAtualizados[0]?.idExterno
      ?? `${entrada?.id}-${Date.now()}`;

    return { id, mensagens, statusAtualizados };
  }

  private traduzirTipo(tipo: string): MensagemEntrada["tipo"] {
    switch (tipo) {
      case "text": return "texto";
      case "image": return "imagem";
      case "document": return "documento";
      case "audio": case "voice": return "audio";
      case "video": return "video";
      case "location": return "localizacao";
      case "interactive": case "button": return "botoes";
      default: return "desconhecido";
    }
  }

  /** HMAC-SHA256 do corpo cru, como a Meta assina. */
  validarAssinatura(corpo: string, assinatura: string | null): boolean {
    if (!this.segredo) return true;           // sem segredo configurado, não bloqueia
    if (!assinatura?.startsWith("sha256=")) return false;

    const esperado = createHmac("sha256", this.segredo).update(corpo).digest("hex");
    const recebido = assinatura.slice(7);

    if (esperado.length !== recebido.length) return false;
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
  }
}
