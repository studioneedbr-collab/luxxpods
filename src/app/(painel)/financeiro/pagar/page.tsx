import { TelaLancamentos } from "@/components/financeiro/lancamentos";
import { getCategoriasFinanceiras, getContasBancarias, getLancamentos } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

/** Data de referência do servidor, fora do render. */
async function hojeDoServidor() {
  return new Date().toISOString().slice(0, 10);
}

export default async function PagarPage() {
  const hoje = await hojeDoServidor();
  const [lancamentos, categorias, contas] = await Promise.all([
    getLancamentos("pagar"), getCategoriasFinanceiras(), getContasBancarias(),
  ]);
  return (
    <TelaLancamentos tipo="pagar" lancamentos={lancamentos}
      categorias={categorias} contas={contas}
      hoje={hoje} />
  );
}
