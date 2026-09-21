import { notFound } from "next/navigation";
import { DetalhePedido } from "@/components/pedidos/detalhe";
import { getPedido } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PedidoPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pedido = await getPedido(id);
  if (!pedido) notFound();
  return <DetalhePedido pedido={pedido} />;
}
