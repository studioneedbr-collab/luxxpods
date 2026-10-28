import { hojeSP } from "@/lib/data-hora";
import { TelaLancamentos } from "@/components/financeiro/lancamentos";
import { getCategoriasFinanceiras, getContasBancarias, getLancamentos } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

/** Data de referência do servidor, fora do render. */
async function hojeDoServidor() {
  return hojeSP();
}

export default async function ReceberPage() {
  const hoje = await hojeDoServidor();
  const [lancamentos, categorias, contas] = await Promise.all([
    getLancamentos("receber"), getCategoriasFinanceiras(), getContasBancarias(),
  ]);
  return (
    <TelaLancamentos tipo="receber" lancamentos={lancamentos}
      categorias={categorias} contas={contas}
      hoje={hoje} />
  );
}
