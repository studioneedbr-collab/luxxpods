import { NextResponse } from "next/server";
import { gerarCobranca } from "@/lib/pix/cobranca";

export const dynamic = "force-dynamic";

/** Cobrança PIX de um pedido — código copia e cola e QR Code. */
export async function GET(req: Request) {
  const pedido = new URL(req.url).searchParams.get("pedido");
  if (!pedido) {
    return NextResponse.json({ erro: "informe o pedido" }, { status: 400 });
  }

  const r = await gerarCobranca(pedido);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });

  return NextResponse.json({ cobranca: r.cobranca });
}

/** "Já paguei": pergunta ao provedor em vez de esperar o webhook. */
export async function POST(req: Request) {
  const pedido = new URL(req.url).searchParams.get("pedido");
  if (!pedido) {
    return NextResponse.json({ erro: "informe o pedido" }, { status: 400 });
  }

  const { conferirPagamentoDoPedido } = await import("@/lib/pagamento/conferir");
  return NextResponse.json(await conferirPagamentoDoPedido(pedido));
}
