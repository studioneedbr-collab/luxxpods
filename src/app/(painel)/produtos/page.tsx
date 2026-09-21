import { ListaProdutos } from "@/components/produtos/lista";
import { Realtime } from "@/components/realtime";
import { getProdutos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  return (
    <>
      <Realtime tabelas={["products", "inventory"]} />
      <ListaProdutos produtos={await getProdutos()} />
    </>
  );
}
