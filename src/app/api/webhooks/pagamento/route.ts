import { NextResponse } from "next/server";
import { meioDoWebhook } from "@/lib/pagamento";
import { registrarPagamento } from "@/lib/pagamento/recepcao";

export const dynamic = "force-dynamic";

/**
 * Confirmação de pagamento vinda do gateway.
 *
 * Gateway reenvia quando não recebe resposta rápida, então o trabalho pesado
 * não acontece aqui: o evento é gravado e o pedido confirmado, e o que sobra
 * (avisar o cliente, imprimir a comanda) vai para a fila.
 */
export async function POST(req: Request) {
  const cru = await req.text();

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return NextResponse.json({ success: false, erro: "corpo inválido" }, { status: 400 });
  }

  const meio = meioDoWebhook(corpo);
  if (!meio) {
    // 200 de propósito: formato desconhecido não melhora com reenvio
    return NextResponse.json({ success: true, ignorado: "provedor não reconhecido" });
  }

  if (meio.validarAssinatura && !meio.validarAssinatura(cru, req.headers)) {
    return NextResponse.json({ success: false, erro: "não autorizado" }, { status: 401 });
  }

  const evento = meio.interpretarWebhook(corpo);
  if (!evento) return NextResponse.json({ success: true, ignorado: "sem dados de pagamento" });

  try {
    const r = await registrarPagamento(evento, meio.nome);
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    console.error("[luxx] falha ao registrar pagamento:", e);
    // 400 faz o provedor tentar de novo — é o que queremos quando o erro
    // é nosso, porque o dinheiro já entrou e o pedido precisa confirmar
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
