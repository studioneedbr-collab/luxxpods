import type {
  Cobranca, DadosCobranca, EventoPagamento, MeioPagamento,
} from "./tipos";

/**
 * InfinitePay — Checkout Integrado.
 *
 * Devolve um link de checkout onde o cliente paga por PIX ou cartão, e
 * confirma o pagamento por webhook. É o que falta ao PIX estático: com ele
 * o pedido confirma sozinho, sem alguém conferir comprovante.
 *
 * Autenticação é pelo handle (o InfiniteTag, sem o "$").
 * Valores vão em CENTAVOS.
 */
export class MeioInfinitePay implements MeioPagamento {
  nome = "infinitepay";
  confirmacaoAutomatica = true;

  private readonly handle = (process.env.INFINITEPAY_HANDLE ?? "").replace(/^\$/, "");
  private readonly base = "https://api.checkout.infinitepay.io";
  private readonly site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  configurado() {
    return Boolean(this.handle && this.site);
  }

  async criarCobranca(
    dados: DadosCobranca,
  ): Promise<{ ok: true; cobranca: Cobranca } | { ok: false; erro: string }> {
    if (!this.configurado()) {
      return {
        ok: false,
        erro: "InfinitePay não configurada: falta INFINITEPAY_HANDLE ou NEXT_PUBLIC_SITE_URL.",
      };
    }

    const corpo = {
      handle: this.handle,
      // para onde o cliente volta depois de pagar
      redirect_url: `${this.site}/pedidos/${dados.pedidoId}?pago=1`,
      webhook_url: `${this.site}/api/webhooks/pagamento`,
      // é por este número que o webhook reencontra o pedido
      order_nsu: dados.numeroPedido,
      items: dados.itens.map((i) => ({
        quantity: i.quantidade,
        price: Math.round(i.precoUnitario * 100),
        description: i.descricao.slice(0, 100),
      })),
      ...(dados.cliente?.nome || dados.cliente?.email
        ? {
            customer: {
              name: dados.cliente.nome ?? undefined,
              email: dados.cliente.email ?? undefined,
              phone_number: dados.cliente.telefone ?? undefined,
            },
          }
        : {}),
      ...(dados.entrega?.cep
        ? {
            address: {
              cep: dados.entrega.cep,
              number: dados.entrega.numero ?? undefined,
              complement: dados.entrega.complemento ?? undefined,
            },
          }
        : {}),
    };

    try {
      const r = await fetch(`${this.base}/links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });

      const resposta = await r.json().catch(() => ({}));

      if (!r.ok) {
        return {
          ok: false,
          erro: resposta?.message ?? resposta?.error ?? `InfinitePay respondeu ${r.status}`,
        };
      }

      // a resposta traz o link; o nome do campo variou entre versões da API,
      // então aceitamos as formas conhecidas em vez de quebrar numa delas
      const link: string | undefined =
        resposta?.url ?? resposta?.link ?? resposta?.payment_url ??
        (resposta?.slug ? `https://checkout.infinitepay.io/${this.handle}/${resposta.slug}` : undefined);

      if (!link) {
        return { ok: false, erro: "A InfinitePay não devolveu o link de pagamento." };
      }

      return {
        ok: true,
        cobranca: {
          idExterno: String(resposta?.slug ?? resposta?.id ?? dados.numeroPedido),
          link,
          expiraEm: new Date(Date.now() + 24 * 3600e3),
        },
      };
    } catch (e) {
      return {
        ok: false,
        erro: e instanceof Error ? e.message : "não consegui falar com a InfinitePay",
      };
    }
  }

  /**
   * O webhook chega com os dados da transação.
   * Os nomes dos campos variam conforme a versão, então lemos as formas
   * conhecidas — errar aqui é deixar um pedido pago como não pago.
   */
  interpretarWebhook(corpo: unknown): EventoPagamento | null {
    const c = corpo as Record<string, unknown>;
    if (!c) return null;

    const referencia = String(
      c.order_nsu ?? c.orderNsu ?? c.order_id ?? c.external_order_nsu ?? "",
    );
    const transacao = String(
      c.transaction_nsu ?? c.transactionNsu ?? c.invoice_slug ?? c.slug ?? c.id ?? "",
    );
    if (!referencia && !transacao) return null;

    const bruto = String(c.status ?? c.payment_status ?? "").toLowerCase();
    const pago = c.paid === true || c.success === true ||
      ["paid", "approved", "succeeded", "captured"].includes(bruto);
    const estornado = ["refunded", "chargeback", "canceled", "cancelled"].includes(bruto);

    const centavos = Number(c.amount ?? c.paid_amount ?? c.value ?? 0);

    const situacao = estornado ? "estornado" as const
      : pago ? "aprovado" as const
      : bruto === "refused" || bruto === "declined" ? "recusado" as const
      : "pendente" as const;

    return {
      // o id do evento leva a situação junto: a mesma transação manda
      // "pendente" e depois "aprovado", e o segundo não pode ser descartado
      // como repetição do primeiro — isso deixaria um pedido pago como aberto
      id: `${transacao || referencia}:${situacao}`,
      referenciaPedido: referencia,
      idTransacao: transacao,
      situacao,
      // a API trabalha em centavos
      valor: centavos > 0 ? centavos / 100 : 0,
      metodo: String(c.payment_method ?? c.capture_method ?? "pix"),
      em: new Date(),
    };
  }

  /**
   * Pergunta à InfinitePay se a cobrança foi paga.
   *
   * É a saída para quando o webhook não chega: em vez de esperar alguém
   * perceber, o painel pergunta. A resposta entra pela mesma recepção do
   * webhook, então a conferência de valor e a idempotência valem igual.
   */
  async conferirPagamento(
    numeroPedido: string, idExterno?: string,
  ): Promise<EventoPagamento | null> {
    if (!this.configurado()) return null;

    try {
      const r = await fetch(`${this.base}/payment_check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle: this.handle,
          order_nsu: numeroPedido,
          ...(idExterno ? { slug: idExterno } : {}),
        }),
      });

      if (!r.ok) return null;
      const resposta = await r.json().catch(() => null);
      if (!resposta?.success || resposta?.paid !== true) return null;

      // reaproveita a leitura do webhook: um caminho só para interpretar
      return this.interpretarWebhook({
        order_nsu: numeroPedido,
        transaction_nsu: resposta.transaction_nsu ?? idExterno ?? numeroPedido,
        status: "paid",
        amount: resposta.paid_amount ?? resposta.amount,
        payment_method: resposta.capture_method ?? "pix",
      });
    } catch (e) {
      console.error("[luxx] não consegui consultar a InfinitePay:", e);
      return null;
    }
  }

  /**
   * A InfinitePay não assina o corpo. A proteção é o segredo na própria URL
   * do webhook mais a conferência do valor contra o pedido, feita na
   * recepção — nunca confiar só no que o corpo diz.
   */
  validarAssinatura(_corpo: string, cabecalhos: Headers): boolean {
    const esperado = process.env.INFINITEPAY_WEBHOOK_SECRET;
    if (!esperado) return true;
    return cabecalhos.get("x-webhook-secret") === esperado;
  }
}
