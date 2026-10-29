import { assinarPedido, conferirWebhook } from "./fluxoapi-assinatura";
import type {
  AtualizacaoStatus, Canal, EventoCanal, MensagemEntrada, MensagemSaida,
  ResultadoEnvio, TipoConteudo,
} from "./tipos";

/**
 * FluxoAPI — WhatsApp Cloud API oficial da Meta, com a assinatura e o
 * cadastro de número por conta deles.
 *
 * A diferença que importa em relação à Z-API não é preço: é que o número
 * continua funcionando no celular do dono. O que ele responde pelo aplicativo
 * chega aqui como `message.sent_from_phone`, e o sistema para de falar por
 * cima dele. Na Z-API isso não existia, e o bot respondia junto.
 *
 * Em troca vem a regra da Meta que o resto do sistema ainda não conhecia: a
 * JANELA DE 24 HORAS. Passada a janela desde a última mensagem do cliente, só
 * sai modelo aprovado — a API devolve 422 `window_closed`. Isso não é erro de
 * rede, e tentar de novo não resolve.
 */

const BASE = "https://api.fluxoapi.com.br/v1";
const TIMEOUT_MS = 20_000;

/* ------------------------------------------------------------- RESPOSTAS -- */

interface Erro {
  error?: { code?: string; message?: string; request_id?: string };
}

interface Midia {
  id?: string;
  mime_type?: string | null;
  filename?: string | null;
  caption?: string | null;
  voice?: boolean;
  download_path?: string;
}

interface DadosRecebida {
  conversation_id?: string;
  message_id?: string;
  from?: string;
  to?: string;
  type?: string;
  text?: string;
  sent_from_phone?: boolean;
  media?: Midia | null;
  reply?: { kind?: string; id?: string; title?: string; description?: string };
}

export interface ConversaFluxo {
  id: string;
  status: "open" | "closed";
  unread: number;
  phone: string;
  contact_name: string | null;
  last_message_at: string;
  last_message_text?: string;
  /** fim da janela de 24h; null ou no passado: só modelo aprovado */
  window_expires_at: string | null;
}

/** O corpo de `GET /instances/{id}`, por dentro do `data`. */
interface InstanciaFluxo {
  id?: string;
  name?: string;
  phone?: string | null;
  verified_name?: string | null;
  status?: string;
  mode?: string;
  quality?: string;
  throughput_mps?: number;
  messaging_limit_24h?: number;
  access_expires_at?: string | null;
  webhook_url?: string | null;
}

export interface DiagnosticoInstancia {
  ok: boolean;
  erro?: string;
  numero?: string;
  nomeVerificado?: string;
  estado?: string;
  modo?: string;
  qualidade?: string;
  /** null quando não há webhook cadastrado — nenhuma mensagem chega */
  webhook?: string | null;
  acessoExpiraEm?: Date | null;
  limite24h?: number;
}

export interface MensagemFluxo {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  text: string | null;
  sent_from_phone?: boolean;
  at: string;
  media?: Midia | null;
}

/* ----------------------------------------------------------------- CANAL -- */

export class CanalFluxoApi implements Canal {
  nome = "FluxoAPI";

  private chave = process.env.FLUXOAPI_KEY ?? "";
  private segredo = process.env.FLUXOAPI_SECRET ?? "";
  private instancia = process.env.FLUXOAPI_INSTANCE_ID ?? "";

  configurado(): boolean {
    return Boolean(this.chave && this.segredo && this.instancia);
  }

  /** Chave de teste não manda mensagem de verdade — a tela precisa avisar. */
  ehTeste(): boolean {
    return this.chave.startsWith("fxk_test_");
  }

  /* ------------------------------------------------------------- ENVIO -- */

  async enviar(mensagem: MensagemSaida): Promise<ResultadoEnvio> {
    if (!this.configurado()) {
      return { ok: false, erro: "FluxoAPI sem credenciais", tentarDeNovo: false };
    }

    const corpo = this.montarEnvio(mensagem);
    const caminho = `/v1/instances/${this.instancia}/messages`;

    const r = await this.chamar("POST", caminho, corpo);

    if (!r.ok) return r.falha;

    const d = r.dados as { message_id?: string; id?: string };
    return { ok: true, idExterno: d.message_id ?? d.id };
  }

  /**
   * `idempotency_key` sai do telefone + conteúdo + a hora arredondada ao
   * minuto. A mesma chave devolve a mesma mensagem por 7 dias sem reenviar,
   * então uma repetição da fila não vira mensagem dobrada para o cliente —
   * mas um reenvio legítimo no minuto seguinte continua passando.
   */
  private montarEnvio(m: MensagemSaida): Record<string, unknown> {
    const minuto = Math.floor(Date.now() / 60_000);
    const assinatura = `${m.para}:${m.tipo}:${m.texto ?? m.arquivo ?? ""}:${minuto}`;

    const base: Record<string, unknown> = {
      to: m.para.startsWith("+") ? m.para : `+${m.para}`,
      idempotency_key: assinatura.slice(0, 200),
    };

    if (m.tipo === "botoes" && m.botoes?.length) {
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: m.texto ?? "",
          // a Meta aceita no máximo 3, e título de 20 caracteres
          buttons: m.botoes.slice(0, 3).map((b) => ({
            id: b.id,
            title: b.rotulo.slice(0, 20),
          })),
        },
      };
    }

    if (m.tipo === "imagem" && m.arquivo) {
      return { ...base, type: "image", media: { url: m.arquivo, caption: m.legenda } };
    }

    if (m.tipo === "documento" && m.arquivo) {
      return {
        ...base,
        type: "document",
        media: { url: m.arquivo, caption: m.legenda, filename: nomeDoArquivo(m.arquivo) },
      };
    }

    return { ...base, type: "text", text: { body: (m.texto ?? "").slice(0, 4096) } };
  }

  /* ---------------------------------------------------------- CONSULTAS -- */

  /** As conversas da instância, para trazer quem já falou com a loja. */
  async listarConversas(cursor?: string, limite = 100): Promise<{
    conversas: ConversaFluxo[];
    proximo?: string;
    erro?: string;
  }> {
    const busca = new URLSearchParams({
      instance_id: this.instancia,
      limit: String(Math.min(limite, 100)),
    });
    if (cursor) busca.set("cursor", cursor);

    const r = await this.chamar("GET", `/v1/conversations?${busca}`);
    if (!r.ok) return { conversas: [], erro: r.falha.erro };

    const d = r.dados as { data?: ConversaFluxo[]; next_cursor?: string | null };
    return { conversas: d.data ?? [], proximo: d.next_cursor ?? undefined };
  }

  /**
   * O histórico de uma conversa.
   *
   * A Z-API não tinha este endpoint, e por isso a importação de lá só trazia
   * quem havia conversado, sem uma linha do que foi dito. Aqui vem.
   */
  async historico(conversationId: string, limite = 200): Promise<{
    mensagens: MensagemFluxo[];
    erro?: string;
  }> {
    const busca = new URLSearchParams({
      order: "asc",
      limit: String(Math.min(limite, 200)),
    });

    const r = await this.chamar(
      "GET", `/v1/conversations/${conversationId}/messages?${busca}`);
    if (!r.ok) return { mensagens: [], erro: r.falha.erro };

    const d = r.dados as { data?: MensagemFluxo[] };
    return { mensagens: d.data ?? [] };
  }

  /**
   * O estado real da instância.
   *
   * A resposta vem embrulhada em `data` — a especificação não declara o
   * corpo deste endpoint, e eu li o nível de cima: voltava `ok: true` com o
   * número vazio, então a tela dizia "no ar" sem conseguir avisar que a
   * instância estava desconectada. Foi a chamada de verdade que mostrou.
   */
  async diagnosticar(): Promise<DiagnosticoInstancia> {
    if (!this.configurado()) return { ok: false, erro: "sem credenciais" };

    const r = await this.chamar("GET", `/v1/instances/${this.instancia}`);
    if (!r.ok) return { ok: false, erro: r.falha.erro };

    const d = ((r.dados as { data?: InstanciaFluxo }).data ?? {}) as InstanciaFluxo;

    return {
      ok: true,
      numero: d.phone ?? undefined,
      nomeVerificado: d.verified_name ?? undefined,
      estado: d.status,
      /** `coexistence` é o que permite o dono responder pelo celular */
      modo: d.mode,
      qualidade: d.quality,
      /**
       * `null` aqui é o problema silencioso: sem webhook cadastrado o
       * número conecta, o envio funciona, e NENHUMA mensagem de cliente
       * chega. A tela precisa gritar isso, não dizer "no ar".
       */
      webhook: d.webhook_url ?? null,
      acessoExpiraEm: d.access_expires_at ? new Date(d.access_expires_at) : null,
      limite24h: d.messaging_limit_24h,
    };
  }

  /* ------------------------------------------------------------ WEBHOOK -- */

  validarAssinatura(corpoCru: string, cabecalhos: Headers): boolean {
    const segredo = process.env.FLUXOAPI_WEBHOOK_SECRET;

    if (!segredo) {
      console.warn(
        "[luxx] FLUXOAPI_WEBHOOK_SECRET vazio: o webhook aceita qualquer corpo",
      );
      return true;
    }

    const v = conferirWebhook({
      segredo,
      corpoCru,
      assinatura: cabecalhos.get("x-fluxo-signature"),
      timestamp: cabecalhos.get("x-fluxo-timestamp"),
    });

    if (!v.valida) console.warn(`[luxx] webhook FluxoAPI recusado: ${v.motivo}`);
    return v.valida;
  }

  interpretarWebhook(corpo: unknown): EventoCanal | null {
    const c = corpo as { id?: string; type?: string; data?: DadosRecebida };
    if (!c?.type || !c.data) return null;

    const id = c.id ?? `fluxo-${Date.now()}`;
    const vazio: EventoCanal = { id, mensagens: [], statusAtualizados: [] };

    if (c.type === "message.received") {
      const m = this.lerRecebida(c.data);
      return m ? { ...vazio, mensagens: [m] } : null;
    }

    /**
     * O dono respondeu pelo aplicativo do celular.
     *
     * Não é mensagem de cliente — vai como fala da loja, e quem recebe
     * precisa desligar o bot naquela conversa. Sem isso o bot responderia
     * por cima de uma pessoa que já está atendendo, e o cliente leria duas
     * respostas diferentes para a mesma pergunta.
     */
    if (c.type === "message.sent_from_phone") {
      const texto = (c.data.text ?? "").trim();
      return {
        ...vazio,
        respostasDoDono: [{
          idExterno: c.data.message_id ?? id,
          para: so_digitos(c.data.to ?? ""),
          texto: texto || descreverMidia(c.data.type, c.data.media),
          em: new Date(),
        }],
      };
    }

    if (c.type === "message.status") {
      const s = this.lerStatus(c.data as Record<string, unknown>);
      return s ? { ...vazio, statusAtualizados: [s] } : null;
    }

    // instance.status_changed e instance.access_expiring não têm mensagem;
    // o diagnóstico da tela de integrações já pergunta o estado à API
    return null;
  }

  private lerRecebida(d: DadosRecebida): MensagemEntrada | null {
    const de = so_digitos(d.from ?? "");
    if (!de) return null;

    const idExterno = d.message_id;
    if (!idExterno) return null;

    const legenda = (d.text ?? "").trim();
    const escolha = d.reply;

    return {
      idExterno,
      de,
      tipo: traduzirTipo(d.type),
      texto: escolha?.title?.trim() || legenda || descreverMidia(d.type, d.media),
      arquivo: d.media?.download_path
        ? `${BASE}${d.media.download_path.replace(/^\/v1/, "")}`
        : undefined,
      botaoId: escolha?.id,
      recebidaEm: new Date(),
    };
  }

  private lerStatus(d: Record<string, unknown>): AtualizacaoStatus | null {
    const idExterno = String(d.message_id ?? "");
    if (!idExterno) return null;

    const mapa: Record<string, AtualizacaoStatus["status"]> = {
      queued: "enviada", sent: "enviada",
      delivered: "entregue", read: "lida", failed: "erro",
    };
    const status = mapa[String(d.status ?? "")];
    if (!status) return null;

    return {
      idExterno,
      status,
      erro: status === "erro" ? String(d.error ?? "a Meta recusou a mensagem") : undefined,
      em: d.at ? new Date(String(d.at)) : new Date(),
    };
  }

  /* -------------------------------------------------------------- REDE -- */

  private async chamar(
    metodo: "GET" | "POST",
    caminho: string,
    corpo?: Record<string, unknown>,
  ): Promise<{ ok: true; dados: unknown } | { ok: false; falha: ResultadoEnvio }> {
    const texto = corpo ? JSON.stringify(corpo) : undefined;

    const cabecalhos: Record<string, string> = {
      ...assinarPedido({
        chave: this.chave,
        segredo: this.segredo,
        metodo,
        caminho,
        corpo: texto,
      }),
    };
    if (texto) cabecalhos["content-type"] = "application/json";

    let r: Response;
    try {
      r = await fetch(`${BASE}${caminho.replace(/^\/v1/, "")}`, {
        method: metodo,
        headers: cabecalhos,
        body: texto,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (e) {
      const expirou = e instanceof Error && e.name === "TimeoutError";
      return {
        ok: false,
        falha: {
          ok: false,
          erro: expirou ? `a FluxoAPI não respondeu em ${TIMEOUT_MS / 1000}s` : `rede: ${String(e)}`,
          tentarDeNovo: true,
        },
      };
    }

    const bruto = await r.text().catch(() => "");
    let dados: unknown = {};
    try { dados = bruto ? JSON.parse(bruto) : {}; } catch { dados = {}; }

    if (r.ok) return { ok: true, dados };

    return { ok: false, falha: this.traduzirFalha(r.status, dados as Erro) };
  }

  /**
   * O que vale tentar de novo e o que não vale.
   *
   * Marcar errado aqui custa caro das duas formas: `tentarDeNovo` numa janela
   * fechada faz a fila bater na mesma porta para sempre, e `false` num 429
   * perde uma mensagem que ia sair no segundo seguinte.
   */
  private traduzirFalha(status: number, corpo: Erro): ResultadoEnvio {
    const codigo = corpo.error?.code ?? "";
    const mensagem = corpo.error?.message ?? `HTTP ${status}`;

    const porCodigo: Record<string, { erro: string; tentarDeNovo: boolean }> = {
      window_closed: {
        erro: "a janela de 24h fechou: só modelo aprovado até o cliente escrever de novo",
        tentarDeNovo: false,
      },
      instance_reconnecting: {
        erro: "a instância está reconectando",
        tentarDeNovo: true,
      },
      instance_not_connected: {
        erro: "o número não está conectado na FluxoAPI",
        tentarDeNovo: false,
      },
      rate_limited: { erro: "limite de envio atingido", tentarDeNovo: true },
      nonce_reused: { erro: "nonce repetido (erro nosso de assinatura)", tentarDeNovo: true },
      stale_timestamp: { erro: "relógio do servidor fora de hora", tentarDeNovo: true },
      invalid_signature: { erro: "assinatura recusada: confira FLUXOAPI_SECRET", tentarDeNovo: false },
      invalid_key: { erro: "chave recusada: confira FLUXOAPI_KEY", tentarDeNovo: false },
      payment_required: { erro: "assinatura da FluxoAPI vencida", tentarDeNovo: false },
      invalid_input: { erro: `a FluxoAPI recusou: ${mensagem}`, tentarDeNovo: false },
      meta_error: { erro: `a Meta recusou: ${mensagem}`, tentarDeNovo: false },
    };

    const conhecido = porCodigo[codigo];
    if (conhecido) return { ok: false, ...conhecido };

    // desconhecido: 5xx e 429 valem retentativa, 4xx não
    return {
      ok: false,
      erro: `${mensagem}${codigo ? ` (${codigo})` : ""}`,
      tentarDeNovo: status >= 500 || status === 429,
    };
  }
}

/* ----------------------------------------------------------------- APOIO -- */

const so_digitos = (v: string) => v.replace(/\D/g, "");

const nomeDoArquivo = (url: string) => {
  const fim = url.split("?")[0]?.split("/").pop() ?? "";
  return fim || "arquivo";
};

function traduzirTipo(tipo?: string): MensagemEntrada["tipo"] {
  const mapa: Record<string, MensagemEntrada["tipo"]> = {
    text: "texto",
    image: "imagem",
    document: "documento",
    audio: "audio",
    video: "video",
    location: "localizacao",
    interactive: "botoes",
    button: "botoes",
  };
  return mapa[tipo ?? ""] ?? "desconhecido";
}

/**
 * Mídia sem legenda precisa virar texto, senão o atendente abre a conversa e
 * vê uma linha em branco — e acha que o sistema perdeu a mensagem.
 */
function descreverMidia(tipo?: string, midia?: Midia | null): string {
  switch (tipo) {
    case "audio": return midia?.voice ? "[áudio de voz]" : "[áudio]";
    case "image": return "[imagem]";
    case "video": return "[vídeo]";
    case "sticker": return "[figurinha]";
    case "document": return `[documento: ${midia?.filename ?? "sem nome"}]`;
    case "location": return "[localização]";
    case "contacts": return "[contato]";
    case "reaction": return "[reação]";
    default: return "";
  }
}

export type { TipoConteudo };
