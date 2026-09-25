import { TelaSabores } from "@/components/catalogo/sabores";
import { Realtime } from "@/components/realtime";
import { getCatalogo } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SaboresPage() {
  return (
    <>
      <Realtime tabelas={["inventory", "product_flavors"]} />
      <TelaSabores catalogo={await getCatalogo()} />
    </>
  );
}
