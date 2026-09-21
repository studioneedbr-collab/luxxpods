import { TelaCategorias } from "@/components/financeiro/categorias";
import { getCategoriasFinanceiras, getLancamentos } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const [categorias, lancamentos] = await Promise.all([
    getCategoriasFinanceiras(), getLancamentos(),
  ]);

  // consolida uso real de cada categoria
  const comUso = categorias.map((c) => {
    const l = lancamentos.filter((x) => x.categoria_id === c.id);
    return { ...c, lancamentos: l.length, total: l.reduce((a, x) => a + x.valor, 0) };
  });

  return <TelaCategorias categorias={comUso} />;
}
