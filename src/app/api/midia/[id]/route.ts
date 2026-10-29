import { NextResponse } from "next/server";
import { CanalFluxoApi } from "@/lib/canal/fluxoapi";
import { getSupabaseServer } from "@/lib/supabase/server";
import { STORE_ID } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * A mídia que o cliente mandou, buscada do provedor com a assinatura.
 *
 * A FluxoAPI só entrega arquivo por GET assinado com HMAC, e a bolha do chat
 * põe a URL direto num `<img src>`. Sem esta rota o navegador levaria 401 e o
 * atendente veria ícone quebrado — pior que não mostrar nada, porque parece
 * defeito do sistema.
 *
 * Aqui a sessão é conferida à mão, e não por RLS: os bytes não vêm do nosso
 * banco, vêm da internet. Sem esta conferência, qualquer pessoa com o id de
 * uma mensagem baixaria a foto que um cliente mandou para a loja.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const c = await getSupabaseServer();
  if (!c) return NextResponse.json({ erro: "sem banco" }, { status: 503 });

  const { data: usuario } = await c.auth.getUser();
  if (!usuario.user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const { data: pode } = await c.rpc("posso", { p_permissao: "acessar_chat" });
  if (pode !== true) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  /**
   * A mensagem tem que ser desta loja.
   *
   * A consulta sai pelo cliente de SESSÃO de propósito: o RLS responde por
   * quem pode ver o quê, e assim o id de uma mensagem de outra loja não vira
   * download. Hoje há uma loja só; no dia em que houver duas, isto já está
   * certo.
   */
  const { data: mensagem } = await c.from("messages")
    .select("id").eq("store_id", STORE_ID)
    .eq("external_message_id", id).maybeSingle();

  if (!mensagem) {
    return NextResponse.json({ erro: "mídia não encontrada" }, { status: 404 });
  }

  const canal = new CanalFluxoApi();
  const resposta = await canal.baixarMidia(id);

  if (!resposta) {
    return NextResponse.json({ erro: "canal sem credenciais" }, { status: 503 });
  }
  if (!resposta.ok) {
    // a Meta apaga a mídia 30 dias depois: 404 aqui costuma ser isso
    return NextResponse.json(
      { erro: "o provedor não entregou o arquivo" }, { status: resposta.status },
    );
  }

  /**
   * O corpo passa adiante como stream, sem virar Buffer: documento vai até
   * 100 MB, e carregar isso na memória derruba a função.
   */
  return new NextResponse(resposta.body, {
    headers: {
      "content-type": resposta.headers.get("content-type") ?? "application/octet-stream",
      // o arquivo não muda; o que expira é o direito de baixá-lo
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
    },
  });
}
