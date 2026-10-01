import { TelaTrocas } from "@/components/operacional/trocas";
import { getTrocas } from "@/lib/data-mvp2";
import { getPedidosParaTroca } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TrocasPage() {
  // o filtro de status agora vai na consulta, e os itens vêm junto: a troca
  // precisa do product_flavor_id para saber o que baixar do estoque
  const [trocas, pedidos] = await Promise.all([
    getTrocas(),
    getPedidosParaTroca(100),
  ]);

  return <TelaTrocas trocas={trocas} pedidos={pedidos} />;
}
