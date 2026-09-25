import { TelaTrocas } from "@/components/operacional/trocas";
import { getTrocas } from "@/lib/data-mvp2";
import { getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TrocasPage() {
  const [trocas, pedidos] = await Promise.all([getTrocas(), getPedidos(200)]);

  // troca sai de venda concluída: pedido cancelado ou em aberto não gera
  const elegiveis = pedidos
    .filter((p) => ["entregue", "saiu_para_entrega"].includes(p.status_pedido))
    .slice(0, 100)
    .map((p) => ({
      id: p.id,
      numero_pedido: p.numero_pedido,
      cliente_nome: p.cliente_nome,
    }));

  return <TelaTrocas trocas={trocas} pedidos={elegiveis} />;
}
