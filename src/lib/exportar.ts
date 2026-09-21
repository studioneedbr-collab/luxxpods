/**
 * Exportação para CSV (§52 do escopo).
 * Gera no navegador, sem round-trip no servidor, e abre no Excel em pt-BR.
 */

type Valor = string | number | boolean | null | undefined;

export interface ColunaExport<T> {
  cabecalho: string;
  valor: (item: T) => Valor;
}

function escapar(v: Valor): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") {
    // vírgula decimal, como o Excel pt-BR espera
    return String(v).replace(".", ",");
  }
  const texto = String(v);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function paraCSV<T>(itens: T[], colunas: ColunaExport<T>[]): string {
  const linhas = [
    colunas.map((c) => escapar(c.cabecalho)).join(";"),
    ...itens.map((item) => colunas.map((c) => escapar(c.valor(item))).join(";")),
  ];
  return linhas.join("\r\n");
}

export function baixarCSV<T>(
  nomeArquivo: string, itens: T[], colunas: ColunaExport<T>[],
) {
  // BOM para o Excel reconhecer os acentos
  const conteudo = "﻿" + paraCSV(itens, colunas);
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const carimbo = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nomeArquivo}-${carimbo}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Data no formato que o Excel pt-BR entende direto. */
export const dataExport = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) : "";

export const dataCurtaExport = (v?: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "";
