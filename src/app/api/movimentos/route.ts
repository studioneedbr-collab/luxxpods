import { NextResponse } from "next/server";
import { getMovimentosDoSabor } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Histórico de um SKU, para o painel abrir direto do número do estoque. */
export async function GET(req: Request) {
  const pf = new URL(req.url).searchParams.get("pf");
  if (!pf) return NextResponse.json({ movimentos: [] });

  return NextResponse.json({ movimentos: await getMovimentosDoSabor(pf) });
}
