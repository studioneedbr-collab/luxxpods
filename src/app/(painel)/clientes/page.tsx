import { ListaClientes } from "@/components/clientes/lista";
import { Realtime } from "@/components/realtime";
import { getClientes } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  return (
    <>
      <Realtime tabelas={["customers", "orders"]} />
      <ListaClientes clientes={await getClientes()} />
    </>
  );
}
