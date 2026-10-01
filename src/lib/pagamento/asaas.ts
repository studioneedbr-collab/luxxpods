import type {
  Cobranca, DadosCobranca, EventoPagamento, MeioPagamento,
} from "./tipos";

/**
 * Asaas — PIX por QR Code estático com valor.
 *
 * É o caminho que serve para vender no WhatsApp: devolve o copia e cola de
 * verdade (o cliente cola no banco, sem abrir link) e mesmo assim confirma
 * sozinho por webhook. A cobrança comum do Asaas também faria isso, mas
 * exigiria o CPF do cliente antes de gerar o código — pedir documento no meio
 * da conversa derruba venda.
 *
 * Valores vão em reais. A autenticação é o header `access_token`.
 */
export class MeioAsaas implements MeioPagamento {
  nome = "asaas";
  confirmacaoAutomatica = true;

  private readonly chaveApi = process.env.ASAAS_API_KEY ?? "";
  private readonly chavePix = process.env.ASAAS_PIX_KEY ?? "";
  private readonly base = process.env.ASAAS_AMBIENTE === "producao"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

  configurado() {
    return Boolean(this.chaveApi);
  }

  private cabecalhos() {
    return {
      "content-type": "application/json",
      "access_token": this.chaveApi,
      "User-Agent": "LuxxPods/1.0 (Next.js)",
    };
  }

  /**
   * A chave PIX que recebe. Vem do ambiente quando está definida; senão
   * perguntamos ao Asaas qual chave a conta tem — errar a chave aqui é
   * mandar o cliente pagar numa conta que não é a da loja.
   */
  private chaveCache: string | null = null;

  private async chaveDeRecebimento(): Promise<string | null> {
    if (this.chavePix) return this.chavePix;
    if (this.chaveCache) return this.chaveCache;

    try {
      // o filtro vai na consulta: pedir tudo e escolher aqui falharia numa
      // conta com mais de 100 chaves, e GET do Asaas recusa corpo
      const r = await fetch(
        `${this.base}/pix/addressKeys?status=ACTIVE&limit=100`,
        { headers: this.cabecalhos() },
      );
      if (!r.ok) return null;

      const d = await r.json();
      const ativa = (d?.data as Array<{ key?: string; status?: string }> | undefined)
        ?.find((k) => k.status === "ACTIVE" && k.key);

      this.chaveCache = ativa?.key ?? null;
      return this.chaveCache;
    } catch (e) {
      console.error("[luxx] não consegui listar as chaves PIX do Asaas:", e);
      return null;
    }
  }

  async criarCobranca(
    dados: DadosCobranca,
  ): Promise<{ ok: true; cobranca: Cobranca } | { ok: false; erro: string }> {
    if (!this.configurado()) {
      return { ok: false, erro: "Asaas não configurado: falta ASAAS_API_KEY." };
    }

    const chave = await this.chaveDeRecebimento();
    if (!chave) {
      return {
        ok: false,
        erro: "Nenhuma chave PIX ativa no Asaas. Cadastre uma na conta ou defina ASAAS_PIX_KEY.",
      };
    }

    // o QR vale por 24h: código de pedido que não vence vira cobrança
    // fantasma paga semanas depois, com o estoque já vendido para outro
    const expiraEm = new Date(Date.now() + 24 * 3600e3);

    try {
      const r = await fetch(`${this.base}/pix/qrCodes/static`, {
        method: "POST",
        headers: this.cabecalhos(),
        body: JSON.stringify({
          addressKey: chave,
          description: `Pedido ${dados.numeroPedido}`,
          value: Number(dados.total.toFixed(2)),
          format: "ALL",
          expirationDate: expiraEm.toISOString().slice(0, 19).replace("T", " "),
          allowsMultiplePayments: false,
          externalReference: dados.numeroPedido,
        }),
      });

      const resposta = await r.json().catch(() => ({}));

      if (!r.ok) {
        const erro = resposta?.errors?.[0]?.description
          ?? resposta?.message
          ?? `Asaas respondeu ${r.status}`;
        return { ok: false, erro };
      }

      if (!resposta?.payload) {
        return { ok: false, erro: "O Asaas não devolveu o código PIX." };
      }

      return {
        ok: true,
        cobranca: {
          idExterno: String(resposta.id ?? dados.numeroPedido),
          copiaECola: String(resposta.payload),
          // a imagem vem em base64 puro; a tela espera data URI
          qrCode: resposta.encodedImage
            ? `data:image/png;base64,${resposta.encodedImage}`
            : undefined,
          expiraEm,
        },
      };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "não consegui falar com o Asaas",
      };
    }
  }

  /**
   * Webhook de cobrança do Asaas: `{ event, payment }`.
   *
   * Dois eventos dizem que o dinheiro entrou: PAYMENT_CONFIRMED (pago, saldo
   * ainda bloqueado) e PAYMENT_RECEIVED (pago e liberado). Os dois chegam para
   * a mesma cobrança, então o id da transação é o mesmo de propósito — é assim
   * que a recepção sabe que é progressão de status, e não cobrança dobrada.
   */
  interpretarWebhook(corpo: unknown): EventoPagamento | null {
    const c = corpo as { event?: string; id?: string; payment?: Record<string, unknown> };
    if (!c?.event || !c.payment) return null;

    const p = c.payment;
    const transacao = String(p.id ?? "");
    if (!transacao) return null;

    // o QR estático gera uma cobrança na hora do pagamento; o número do
    // pedido pode voltar no externalReference da cobrança ou só no do QR
    const referencia = String(
      p.externalReference ?? p.pixQrCodeExternalReference ?? "",
    );

    const evento = c.event;
    const situacao: EventoPagamento["situacao"] =
      evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED" ? "aprovado"
      : evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_CHARGEBACK_REQUESTED"
        || evento === "PAYMENT_DELETED" ? "estornado"
      : "pendente";

    return {
      // o id do evento leva a situação junto, e não o nome do evento: assim
      // CONFIRMED e RECEIVED da mesma cobrança entram uma vez só, que é o
      // que queremos — o dinheiro entrou uma vez
      id: `${transacao}:${situacao}`,
      referenciaPedido: referencia,
      idTransacao: transacao,
      situacao,
      valor: Number(p.value ?? 0),
      metodo: String(p.billingType ?? "PIX").toLowerCase(),
      em: p.paymentDate ? new Date(String(p.paymentDate)) : new Date(),
      // para achar o pedido quando o número não veio no corpo
      referenciaAlternativa: p.pixQrCodeId ? String(p.pixQrCodeId) : undefined,
    };
  }

  /**
   * O Asaas manda o token que você cadastrou no painel dele, no header
   * `asaas-access-token`. Sem token cadastrado não dá para validar — e aí a
   * proteção que sobra é a conferência de valor contra o pedido.
   */
  validarAssinatura(_corpo: string, cabecalhos: Headers): boolean {
    const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!esperado) return true;
    return cabecalhos.get("asaas-access-token") === esperado;
  }

  /** Pergunta ao Asaas se a cobrança daquele pedido já foi paga. */
  async conferirPagamento(numeroPedido: string): Promise<EventoPagamento | null> {
    if (!this.configurado()) return null;

    try {
      const r = await fetch(
        `${this.base}/payments?externalReference=${encodeURIComponent(numeroPedido)}&limit=10`,
        { headers: this.cabecalhos() },
      );
      if (!r.ok) return null;

      const d = await r.json().catch(() => null);
      const paga = (d?.data as Array<Record<string, unknown>> | undefined)
        ?.find((p) => p.status === "RECEIVED" || p.status === "CONFIRMED");

      if (!paga) return null;

      return this.interpretarWebhook({
        event: paga.status === "RECEIVED" ? "PAYMENT_RECEIVED" : "PAYMENT_CONFIRMED",
        payment: { ...paga, externalReference: numeroPedido },
      });
    } catch (e) {
      console.error("[luxx] não consegui consultar o Asaas:", e);
      return null;
    }
  }
}
