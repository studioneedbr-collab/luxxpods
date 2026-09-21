"use client";

import { Download } from "lucide-react";
import { Button } from "./index";
import { baixarCSV, type ColunaExport } from "@/lib/exportar";
import { useToast } from "./toast";

/** Baixa a lista exatamente como está filtrada na tela. */
export function BotaoExportar<T>({
  itens, colunas, nomeArquivo, rotulo = "Exportar",
}: {
  itens: T[];
  colunas: ColunaExport<T>[];
  nomeArquivo: string;
  rotulo?: string;
}) {
  const toast = useToast();

  return (
    <Button
      onClick={() => {
        if (itens.length === 0) {
          toast.avisar("Nada para exportar", { tom: "aviso", detalhe: "Ajuste os filtros da tela." });
          return;
        }
        baixarCSV(nomeArquivo, itens, colunas);
        toast.ok(`${itens.length} registro(s) exportados`, `${nomeArquivo}.csv`);
      }}
      title="Baixar a lista filtrada em CSV"
    >
      <Download className="size-3.5" /> {rotulo}
    </Button>
  );
}
