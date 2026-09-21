import { GradeCatalogo } from "@/components/catalogo/grade";
import { Realtime } from "@/components/realtime";
import { getCatalogo } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const itens = await getCatalogo();
  return (
    <>
      <Realtime tabelas={["inventory", "product_flavors", "products"]} />
      <GradeCatalogo itens={itens} />
    </>
  );
}
