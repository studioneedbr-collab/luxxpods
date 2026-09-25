import "server-only";
import QRCode from "qrcode";
import { getSupabaseServer } from "../supabase/server";
import { STORE_ID, supabaseConfigurado } from "../supabase/config";
import { gerarBrCode, tipoDaChave } from "./brcode";
import { demo } from "../demo";

/**
 * Cobrança PIX do pedido.
 *
 * Sem gateway, o código é estático e válido: qualquer banco lê e paga. O que
 * falta é a confirmação automática — alguém confere o comprovante e dá baixa.
 * Com gateway configurado, o webhook faz isso sozinho.
 */

export interface Cobranca {
  copiaECola: string;
  /** link de checkout, quando o pagamento é por gateway */
  link?: string;
  /** data URI do QR Code, pronto para <img src> */
  qrCode: string;
  valor: number;
  chave: string;
  tipoChave: ReturnType<typeof tipoDaChave>;
  recebedor: string;
  /** false quando não há gateway: a baixa é manual */
  confirmacaoAutomatica: boolean;
  identificador: string;
}

interface ConfigPix {
  chave: string;
  nome: string;
  cidade: string;
  gateway: string | null;
}

async function lerConfig(): Promise<ConfigPix | null> {
  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!c) {
    // na demonstração, uma chave de exemplo para o fluxo ficar navegável
    return {
      chave: "contato@luxxpods.com.br",
      nome: "Luxx Pods",
      cidade: "Teofilo Otoni",
      gateway: null,
    };
  }

  const { data } = await c.from("settings")
    .select("valor, chave").eq("store_id", STORE_ID)
    .in("chave", ["pagamentos", "empresa"]);

  const pagamentos = data?.find((d) => d.chave === "pagamentos")?.valor as
    { chave_pix?: string; gateway?: string } | undefined;
  const empresa = data?.find((d) => d.chave === "empresa")?.valor as
    { nome?: string; endereco?: string } | undefined;

  if (!pagamentos?.chave_pix) return null;

  return {
    chave: pagamentos.chave_pix,
    nome: empresa?.nome ?? "Luxx Pods",
    // a cidade sai do endereço cadastrado: "Teófilo Otoni - MG" → "Teófilo Otoni"
    cidade: (empresa?.endereco ?? "").split("-")[0].trim() || "Teofilo Otoni",
    gateway: pagamentos.gateway ?? null,
  };
}

export async function gerarCobranca(
  pedidoId: string,
): Promise<{ ok: boolean; cobranca?: Cobranca; erro?: string }> {
  // com gateway configurado, a cobrança sai dele — traz confirmação automática
  const { meioAtivo } = await import("../pagamento");
  const meio = meioAtivo();

  if (meio.confirmacaoAutomatica) {
    return gerarPeloGateway(pedidoId, meio);
  }

  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  const pedido = c
    ? (await c.from("orders")
        .select("id, numero_pedido, total, status_pagamento, forma_pagamento")
        .eq("id", pedidoId).maybeSingle()).data
    : demo().pedidos.find((p) => p.id === pedidoId);

  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (pedido.forma_pagamento !== "pix") {
    return { ok: false, erro: "Este pedido não é PIX." };
  }
  if (pedido.status_pagamento === "aprovado") {
    return { ok: false, erro: "Este pedido já está pago." };
  }

  const config = await lerConfig();
  if (!config) {
    return {
      ok: false,
      erro: "Chave PIX não configurada. Cadastre em Configurações → Pagamentos.",
    };
  }

  let copiaECola: string;
  try {
    copiaECola = gerarBrCode({
      chave: config.chave,
      nome: config.nome,
      cidade: config.cidade,
      valor: Number(pedido.total),
      identificador: pedido.numero_pedido,
    });
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha ao gerar o código" };
  }

  const qrCode = await QRCode.toDataURL(copiaECola, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#05060c", light: "#ffffff" },
  });

  // guarda a cobrança no pedido, para não gerar um código diferente a cada abertura
  if (c) {
    await c.from("payments").upsert({
      store_id: STORE_ID,
      order_id: pedidoId,
      metodo: "pix",
      valor: pedido.total,
      status: "aguardando",
      qr_code: qrCode,
      pix_copia_cola: copiaECola,
      gateway: config.gateway ?? "estatico",
      transaction_id: pedido.numero_pedido,
      expiracao: new Date(Date.now() + 24 * 3600e3).toISOString(),
    }, { onConflict: "gateway,transaction_id" });
  }

  return {
    ok: true,
    cobranca: {
      copiaECola,
      qrCode,
      valor: Number(pedido.total),
      chave: config.chave,
      tipoChave: tipoDaChave(config.chave),
      recebedor: config.nome,
      confirmacaoAutomatica: Boolean(config.gateway),
      identificador: pedido.numero_pedido,
    },
  };
}

/** Cobrança pelo gateway: devolve o link de checkout e confirma por webhook. */
async function gerarPeloGateway(
  pedidoId: string,
  meio: import("../pagamento").MeioPagamento,
): Promise<{ ok: boolean; cobranca?: Cobranca; erro?: string }> {
  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  const pedido = c
    ? (await c.from("orders")
        .select("id, numero_pedido, total, cliente_nome, cliente_telefone, endereco_snapshot, order_items(produto_nome, sabor_nome, quantidade, preco_unitario)")
        .eq("id", pedidoId).maybeSingle()).data
    : demo().pedidos.find((p) => p.id === pedidoId);

  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };

  const itens = (
    (pedido as { order_items?: Array<Record<string, unknown>>; itens?: Array<Record<string, unknown>> })
      .order_items ??
    (pedido as { itens?: Array<Record<string, unknown>> }).itens ??
    []
  ).map((i) => ({
    descricao: `${i.produto_nome} ${i.sabor_nome ?? ""}`.trim(),
    quantidade: Number(i.quantidade ?? 1),
    precoUnitario: Number(i.preco_unitario ?? 0),
  }));

  const r = await meio.criarCobranca({
    pedidoId,
    numeroPedido: String(pedido.numero_pedido),
    total: Number(pedido.total),
    itens: itens.length > 0 ? itens : [{
      descricao: `Pedido ${pedido.numero_pedido}`,
      quantidade: 1,
      precoUnitario: Number(pedido.total),
    }],
    cliente: {
      nome: pedido.cliente_nome as string | null,
      telefone: pedido.cliente_telefone as string | null,
    },
    entrega: {
      numero: (pedido.endereco_snapshot as { numero?: string } | null)?.numero ?? null,
    },
  });

  if (!r.ok) return { ok: false, erro: r.erro };

  const config = await lerConfig();

  if (c) {
    await c.from("payments").upsert({
      store_id: STORE_ID, order_id: pedidoId, metodo: "pix",
      valor: Number(pedido.total), status: "aguardando",
      gateway: meio.nome, transaction_id: r.cobranca.idExterno,
      pix_copia_cola: r.cobranca.copiaECola ?? r.cobranca.link,
      qr_code: r.cobranca.qrCode,
      expiracao: r.cobranca.expiraEm?.toISOString(),
    }, { onConflict: "gateway,transaction_id" });
  }

  return {
    ok: true,
    cobranca: {
      // nunca o link aqui: quem lê este campo cola no banco
      copiaECola: r.cobranca.copiaECola ?? "",
      qrCode: r.cobranca.qrCode ?? "",
      link: r.cobranca.link,
      valor: Number(pedido.total),
      chave: config?.chave ?? "",
      tipoChave: config ? tipoDaChave(config.chave) : "aleatoria",
      recebedor: config?.nome ?? "Luxx Pods",
      confirmacaoAutomatica: true,
      identificador: String(pedido.numero_pedido),
    },
  };
}
