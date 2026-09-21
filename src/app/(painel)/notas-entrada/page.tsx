import { TelaNotas } from "@/components/operacional/notas";
import { getFornecedores, getNotasEntrada } from "@/lib/data-mvp2";
import { getCatalogo } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NotasEntradaPage() {
  const [notas, fornecedores, catalogo] = await Promise.all([
    getNotasEntrada(), getFornecedores(), getCatalogo(),
  ]);
  return <TelaNotas notas={notas} fornecedores={fornecedores} catalogo={catalogo} />;
}
