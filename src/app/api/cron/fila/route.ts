import { NextResponse } from "next/server";
import { segredoConfere } from "@/lib/seguranca/segredo";
import { rodarFila } from "@/lib/fila/worker";
import { enfileirar, limparHistorico } from "@/lib/fila/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Consome a fila. Chamado pelo cron da Vercel a cada minuto.
 *
 * É daqui que sai toda mensagem: o painel e o bot só gravam e enfileiram.
 * Assim uma falha no canal não derruba a requisição de quem está usando o
 * sistema, e a tentativa seguinte acontece sozinha.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    if (!segredoConfere(`Bearer ${segredo}`, req.headers.get("authorization"))) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production"
             && !(req.headers.get("user-agent") ?? "").startsWith("vercel-cron/")) {
    // sem CRON_SECRET a rota ficava aberta a qualquer um. O agente da Vercel
    // ainda passa, para a fila não parar — mas cadastre o CRON_SECRET: o
    // user-agent qualquer um imita
    console.warn("[luxx] CRON_SECRET não configurado: a rota da fila só aceita o cron da Vercel");
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  // a limpeza de reserva entra na mesma rodada, sem cron separado
  await enfileirar("liberar_reservas", {});

  const resultado = await rodarFila();

  // uma vez por hora basta para a faxina
  if (new Date().getUTCMinutes() === 7) {
    const limpos = await limparHistorico();
    resultado.detalhes.push(`limpeza: ${limpos.jobs} job(s), ${limpos.eventos} evento(s)`);
  }

  return NextResponse.json({
    ok: true,
    em: new Date().toISOString(),
    ...resultado,
  });
}
