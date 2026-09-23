import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NovoPedido } from "@/components/pedidos/novo";
import { Button } from "@/components/ui";
import { getCatalogo, getClientes } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage() {
  const [catalogo, clientes] = await Promise.all([getCatalogo(), getClientes()]);

  return (
    <div className="space-y-4">
      <Link href="/pedidos">
        <Button variante="fantasma" tamanho="sm">
          <ArrowLeft className="size-3.5" /> Pedidos
        </Button>
      </Link>
      <NovoPedido catalogo={catalogo} clientes={clientes} />
    </div>
  );
}
