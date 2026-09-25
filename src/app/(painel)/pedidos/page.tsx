import { ListaPedidos } from "@/components/pedidos/lista";
import { Realtime } from "@/components/realtime";
import { getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Hora do servidor, fora do render. */
async function agoraDoServidor() {
  return Date.now();
}

export default async function PedidosPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const agora = await agoraDoServidor();

  return (
    <>
      <Realtime tabelas={["orders"]} />
      <ListaPedidos
        pedidos={await getPedidos(200)}
        buscaInicial={sp.q ?? ""}
        statusInicial={sp.status ?? "todos"}
        agora={agora}
      />
    </>
  );
}
