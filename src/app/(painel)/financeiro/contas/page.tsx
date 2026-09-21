import { TelaContas } from "@/components/financeiro/contas";
import { getContasBancarias, getLancamentos } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

export default async function ContasPage() {
  const [contas, lancamentos] = await Promise.all([
    getContasBancarias(), getLancamentos(),
  ]);
  return <TelaContas contas={contas} lancamentos={lancamentos} />;
}
