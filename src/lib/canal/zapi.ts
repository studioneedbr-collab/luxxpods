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

  /** O Client-Token vai em todas as chamadas quando a conta exige. */
  private cabecalhos(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.clientToken ? { "Client-Token": this.clientToken } : {}),
    };
  }

  async enviar(m: MensagemSaida): Promise<ResultadoEnvio> {
    if (!this.configurado()) {
      return { ok: false, erro: "Z-API não configurada", tentarDeNovo: false };
    }

    const { rota, corpo } = this.montarCorpo(m);

    try {
      const r = await fetch(`${this.base}/${rota}`, {
        method: "POST",
        headers: this.cabecalhos(),
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

  /**
   * O corpo do webhook "Ao receber".
   *
   * A Z-API manda um objeto aninhado por tipo de mídia, com nomes diferentes
   * em cada um (`text.message`, `audio.audioUrl`, `document.documentUrl`…).
   * A versão anterior tratava só texto e imagem: áudio, vídeo, documento,
   * figurinha, localização e contato chegavam como "desconhecido" e SEM
   * CONTEÚDO. No Brasil o cliente manda áudio o tempo todo — o atendente via
   * uma mensagem vazia na conversa e não sabia que tinha recebido algo.
   */
  interpretarWebhook(corpo: unknown): EventoCanal | null {
    const c = corpo as Record<string, unknown>;
    if (!c) return null;

    // a Z-API manda a mensagem do próprio número de volta; ignoramos
    if (c.fromMe === true) return null;

    // grupo e canal de transmissão não são atendimento: o número da loja é
    // adicionado em grupo o tempo todo, e cada mensagem criaria um "cliente"
    // com o id do grupo no lugar do telefone
    if (c.isGroup === true || c.isNewsletter === true || c.broadcast === true) {
      return null;
    }

    // status alheio respondido não é conversa
    if (c.isStatusReply === true) return null;

    const mensagens: MensagemEntrada[] = [];
    const statusAtualizados: AtualizacaoStatus[] = [];

    const conteudo = this.lerConteudo(c);

    if (conteudo) {
      mensagens.push({
        idExterno: String(c.messageId ?? c.id ?? ""),
        de: String(c.phone ?? ""),
        nome: (c.senderName ?? c.chatName) as string | undefined,
        ...conteudo,
        recebidaEm: new Date(Number(c.momment ?? Date.now())),
      });
    }

    if (c.type === "MessageStatusCallback" || (c.status && !conteudo)) {
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

  /**
   * De qual objeto aninhado sai o conteúdo, e o que mostrar na conversa.
   *
   * Mídia sem legenda recebe um texto descritivo entre colchetes, para o
   * atendente ver que chegou algo e o quê. Mensagem vazia na tela faz ele
   * achar que é bug do sistema, quando o cliente mandou um áudio.
   */
  private lerConteudo(c: Record<string, unknown>): Pick<
    MensagemEntrada, "tipo" | "texto" | "arquivo" | "botaoId"
  > | null {
    const obj = <T,>(chave: string) => c[chave] as T | undefined;

    const texto = obj<{ message?: string }>("text")?.message;
    if (texto) return { tipo: "texto", texto };

    const imagem = obj<{ imageUrl?: string; caption?: string }>("image");
    if (imagem?.imageUrl) {
      return {
        tipo: "imagem",
        texto: imagem.caption || "[imagem]",
        arquivo: imagem.imageUrl,
      };
    }

    const audio = obj<{ audioUrl?: string; seconds?: number; ptt?: boolean }>("audio");
    if (audio?.audioUrl) {
      const seg = audio.seconds ? ` ${audio.seconds}s` : "";
      return {
        tipo: "audio",
        texto: `[${audio.ptt ? "áudio de voz" : "áudio"}${seg}]`,
        arquivo: audio.audioUrl,
      };
    }

    const video = obj<{ videoUrl?: string; caption?: string; seconds?: number }>("video");
    if (video?.videoUrl) {
      return {
        tipo: "video",
        texto: video.caption || `[vídeo${video.seconds ? ` ${video.seconds}s` : ""}]`,
        arquivo: video.videoUrl,
      };
    }

    const doc = obj<{ documentUrl?: string; fileName?: string; title?: string }>("document");
    if (doc?.documentUrl) {
      return {
        tipo: "documento",
        texto: `[documento: ${doc.fileName || doc.title || "arquivo"}]`,
        arquivo: doc.documentUrl,
      };
    }

    const figurinha = obj<{ stickerUrl?: string }>("sticker");
    if (figurinha?.stickerUrl) {
      return { tipo: "imagem", texto: "[figurinha]", arquivo: figurinha.stickerUrl };
    }

    // localização: o endereço é o que interessa para entregar
    const local = obj<{
      latitude?: number; longitude?: number; address?: string; name?: string; url?: string;
    }>("location");
    if (local?.latitude != null || local?.address) {
      const onde = local.address || local.name
        || `${local.latitude}, ${local.longitude}`;
      return { tipo: "localizacao", texto: `[localização] ${onde}`, arquivo: local.url };
    }

    const contato = obj<{ displayName?: string; phones?: string[] }>("contact");
    if (contato?.displayName || contato?.phones?.length) {
      const fones = contato.phones?.join(", ") ?? "";
      return {
        tipo: "texto",
        texto: `[contato] ${contato.displayName ?? ""}${fones ? ` — ${fones}` : ""}`.trim(),
      };
    }

    // resposta de botão e de lista: o id é o que o bot usa para decidir
    const botao = obj<{ buttonId?: string; message?: string }>("buttonsResponseMessage");
    if (botao?.buttonId || botao?.message) {
      return { tipo: "botoes", texto: botao.message ?? "", botaoId: botao.buttonId };
    }

    const lista = obj<{ selectedRowId?: string; message?: string; title?: string }>(
      "listResponseMessage");
    if (lista?.selectedRowId || lista?.message) {
      return {
        tipo: "botoes",
        texto: lista.message || lista.title || "",
        botaoId: lista.selectedRowId,
      };
    }

    return null;
  }

  /**
   * Os chats que já existem no WhatsApp conectado.
   *
   * Serve para o primeiro dia: ao conectar, o painel passa a mostrar quem já
   * estava conversando, em vez de uma caixa de entrada vazia.
   *
   * O que NÃO vem: o histórico das mensagens. A Z-API entrega a lista de
   * conversas e as mensagens novas a partir da conexão — o histórico antigo
   * fica no aparelho, é assim que o WhatsApp funciona. Prometer o contrário
   * seria mentir para quem espera ver as conversas de ontem.
   */
  async listarChats(pagina = 1, porPagina = 100): Promise<Array<{
    telefone: string;
    nome: string | null;
    naoLidas: number;
    ultimaEm: Date | null;
    arquivado: boolean;
  }> | null> {
    if (!this.configurado()) return null;

    try {
      const r = await fetch(
        `${this.base}/chats?page=${pagina}&pageSize=${porPagina}`,
        { headers: this.cabecalhos() },
      );
      if (!r.ok) {
        console.error(`[luxx] a Z-API respondeu ${r.status} ao listar os chats`);
        return null;
      }

      const d = await r.json();
      const lista = Array.isArray(d) ? d : (d?.chats ?? []);

      return (lista as Array<Record<string, unknown>>)
        // grupo não é atendimento: viraria um "cliente" com o id do grupo
        .filter((x) => x.isGroup !== true)
        .map((x) => ({
          telefone: String(x.phone ?? "").replace(/\D/g, ""),
          nome: (x.name as string | null) || null,
          naoLidas: Number(x.unread ?? 0),
          ultimaEm: x.lastMessageTime
            ? new Date(Number(x.lastMessageTime))
            : null,
          arquivado: x.archived === true,
        }))
        .filter((x) => x.telefone.length >= 10);
    } catch (e) {
      console.error("[luxx] não consegui listar os chats da Z-API:", e);
      return null;
    }
  }

  /** A Z-API usa um token fixo no header, não assinatura por corpo. */
  validarAssinatura(_corpo: string, assinatura: string | null): boolean {
    const esperado = process.env.ZAPI_WEBHOOK_SECRET;
    if (!esperado) return true;
    return assinatura === esperado;
  }
}
