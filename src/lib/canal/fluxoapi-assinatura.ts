import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A assinatura da FluxoAPI — a parte que não pode errar por um caractere.
 *
 * Mora separada do adaptador, e sem `server-only`, para ter teste próprio:
 * errar a ordem das linhas ou esquecer a query string dá 401 em tudo, e
 * descobrir isso contra a API de verdade é caro e lento.
 *
 * São DUAS strings assinadas diferentes, e misturá-las é o erro fácil:
 *
 * - no PEDIDO: seis linhas — v1, timestamp, nonce, método, caminho com query,
 *   e o sha256 do corpo cru em hexadecimal. Segredo `fxs_`.
 * - no WEBHOOK: duas linhas — timestamp e o corpo cru. Sem nonce, sem método,
 *   sem caminho. Segredo `whsec_` da instância.
 */

const sha256Hex = (corpo: string) =>
  createHash("sha256").update(corpo, "utf8").digest("hex");

/** O nonce precisa ser único por requisição; repetir em 10 min dá 409. */
export const gerarNonce = () => randomBytes(16).toString("hex");

export interface PedidoAssinado {
  "X-Fluxo-Key": string;
  "X-Fluxo-Timestamp": string;
  "X-Fluxo-Nonce": string;
  "X-Fluxo-Signature": string;
}

/**
 * `caminho` entra com a query string, exatamente como vai na requisição —
 * a documentação é explícita, e o exemplo dela é `/v1/messages?limit=10`.
 * Assinar sem a query faz toda chamada paginada falhar.
 */
export function assinarPedido(entrada: {
  chave: string;
  segredo: string;
  metodo: string;
  caminho: string;
  corpo?: string;
  /** injetáveis para o teste poder comparar com um valor fixo */
  timestamp?: number;
  nonce?: string;
}): PedidoAssinado {
  const timestamp = String(entrada.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = entrada.nonce ?? gerarNonce();

  const aAssinar = [
    "v1",
    timestamp,
    nonce,
    entrada.metodo.toUpperCase(),
    entrada.caminho,
    sha256Hex(entrada.corpo ?? ""),
  ].join("\n");

  const hmac = createHmac("sha256", entrada.segredo).update(aAssinar, "utf8").digest("hex");

  return {
    "X-Fluxo-Key": entrada.chave,
    "X-Fluxo-Timestamp": timestamp,
    "X-Fluxo-Nonce": nonce,
    "X-Fluxo-Signature": `v1=${hmac}`,
  };
}

/** Comparação de tempo constante, tolerando tamanhos diferentes. */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export type Veredito =
  | { valida: true }
  | { valida: false; motivo: string };

/**
 * Confere o webhook.
 *
 * Três detalhes que a documentação pede e que são fáceis de perder:
 *
 * 1. O corpo tem que ser o CRU. JSON re-serializado muda espaço e ordem, e a
 *    assinatura deixa de bater.
 * 2. Durante a rotação do segredo vêm DUAS assinaturas separadas por vírgula,
 *    e basta uma bater. Sem isso, trocar o segredo derruba o canal por 24h.
 * 3. O timestamp entra na string assinada, então ele também é conferido:
 *    aceitar qualquer idade deixaria um corpo capturado valer para sempre.
 */
export function conferirWebhook(entrada: {
  segredo: string;
  corpoCru: string;
  assinatura: string | null;
  timestamp: string | null;
  /** tolerância de idade do evento, em segundos */
  tolerancia?: number;
  agora?: number;
}): Veredito {
  if (!entrada.assinatura) return { valida: false, motivo: "sem X-Fluxo-Signature" };
  if (!entrada.timestamp) return { valida: false, motivo: "sem X-Fluxo-Timestamp" };

  const ts = Number(entrada.timestamp);
  if (!Number.isFinite(ts)) return { valida: false, motivo: "timestamp não é número" };

  const agora = entrada.agora ?? Math.floor(Date.now() / 1000);
  const tolerancia = entrada.tolerancia ?? 300;
  if (Math.abs(agora - ts) > tolerancia) {
    return { valida: false, motivo: `evento com ${Math.abs(agora - ts)}s de idade` };
  }

  const esperado = createHmac("sha256", entrada.segredo)
    .update(`${entrada.timestamp}\n${entrada.corpoCru}`, "utf8")
    .digest("hex");

  const recebidas = entrada.assinatura.split(",").map((a) => a.trim());
  const bateu = recebidas.some((a) => {
    const hex = a.startsWith("v1=") ? a.slice(3) : a;
    return iguais(esperado, hex);
  });

  return bateu ? { valida: true } : { valida: false, motivo: "assinatura não confere" };
}
