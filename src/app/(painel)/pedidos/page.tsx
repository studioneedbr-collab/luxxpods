import { ListaPedidos } from "@/components/pedidos/lista";
import { Realtime } from "@/components/realtime";
import { getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;

  return (
    <>
      <Realtime tabelas={["orders"]} />
      <ListaPedidos
        pedidos={await getPedidos(200)}
        buscaInicial={sp.q ?? ""}
        statusInicial={sp.status ?? "todos"}
      />
    </>
  );
}
