"use client";

import Link from "next/link";
import { FileDown, Table2 } from "lucide-react";
import { baixarCSV, type ColunaExport } from "@/lib/exportar";
import { useToast } from "@/components/ui/toast";

/**
 * As duas saídas do catálogo, num controle só.
 *
 * Elas servem a gente diferente, e o desenho diz isso: o PDF é a peça que vai
 * para o cliente, então leva o botão cheio; o CSV é conferência de estoque e
 * margem, trabalho interno, então fica no botão de ícone ao lado. Dois botões
 * iguais faziam parecer que era escolha de formato, quando é escolha de uso.
 */
export function ExportarCatalogo<T>({
  itens, colunas, nomeArquivo,
}: {
  itens: T[];
  colunas: ColunaExport<T>[];
  nomeArquivo: string;
}) {
  const toast = useToast();

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg ring-1 ring-inset ring-[var(--linha-forte)]">
      <Link
        href="/catalogo/pdf"
        target="_blank"
        title="Abre o catálogo pronto para salvar em PDF e mandar para o cliente"
        className="flex h-9 items-center gap-2 bg-brand-500 px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-400"
      >
        <FileDown className="size-3.5" /> Catálogo PDF
      </Link>

      <button
        type="button"
        onClick={() => {
          if (itens.length === 0) {
            toast.aviso("Nada para exportar", "Ajuste os filtros da tela.");
            return;
          }
          baixarCSV(nomeArquivo, itens, colunas);
          toast.ok(`${itens.length} linha(s) exportadas`, `${nomeArquivo}.csv`);
        }}
        title="Baixar a lista filtrada em CSV, com custo e margem — para conferência interna"
        aria-label="Exportar em CSV"
        className="grid w-9 place-items-center border-l border-[var(--linha-forte)] bg-ink-850 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
      >
        <Table2 className="size-3.5" />
      </button>
    </div>
  );
}
