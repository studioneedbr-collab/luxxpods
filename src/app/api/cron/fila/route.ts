import { NextResponse } from "next/server";
import { rodarFila } from "@/lib/fila/worker";
import { enfileirar } from "@/lib/fila/worker";

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
    const autorizacao = req.headers.get("authorization");
    if (autorizacao !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  }

  // a limpeza de reserva entra na mesma rodada, sem cron separado
  await enfileirar("liberar_reservas", {});

  const resultado = await rodarFila();

  return NextResponse.json({
    ok: true,
    em: new Date().toISOString(),
    ...resultado,
  });
}
