"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn, num } from "@/lib/utils";

const TAMANHOS = [25, 50, 100, 200];

/**
 * Pagina uma lista já carregada e devolve a fatia visível.
 * Volta para a primeira página sempre que o conteúdo filtrado muda.
 */
export function usePaginacao<T>(itens: T[], tamanhoInicial = 25) {
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(tamanhoInicial);

  const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanho));

  // Se um filtro encolheu a lista, corrige a página durante o render — sem
  // efeito, que causaria um segundo render em cascata.
  const paginaAtual = Math.min(pagina, totalPaginas);
  if (paginaAtual !== pagina) setPagina(paginaAtual);

  const visiveis = useMemo(
    () => itens.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho),
    [itens, paginaAtual, tamanho],
  );

  return {
    visiveis,
    props: {
      pagina: paginaAtual, totalPaginas, tamanho, total: itens.length,
      onPagina: setPagina,
      onTamanho: (t: number) => { setTamanho(t); setPagina(1); },
    },
    reiniciar: () => setPagina(1),
  };
}

export interface PaginacaoProps {
  pagina: number;
  totalPaginas: number;
  tamanho: number;
  total: number;
  onPagina: (p: number) => void;
  onTamanho: (t: number) => void;
  rotulo?: string;
}

export function Paginacao({
  pagina, totalPaginas, tamanho, total, onPagina, onTamanho, rotulo = "registros",
}: PaginacaoProps) {
  if (total === 0) return null;

  const primeiro = (pagina - 1) * tamanho + 1;
  const ultimo = Math.min(pagina * tamanho, total);
  const paginas = janelaDePaginas(pagina, totalPaginas);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--linha)] px-4 py-2.5">
      <p className="text-[11px] tabular-nums text-ink-500">
        <span className="font-medium text-ink-300">{num(primeiro)}–{num(ultimo)}</span>
        {" de "}
        <span className="font-medium text-ink-300">{num(total)}</span> {rotulo}
      </p>

      <div className="flex items-center gap-3">
        {total > TAMANHOS[0] && (
          <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
            <span className="hidden sm:inline">Por página</span>
            <select
              value={tamanho}
              onChange={(e) => onTamanho(Number(e.target.value))}
              className="h-7 cursor-pointer rounded-md bg-ink-850 px-1.5 text-[11px] text-ink-200 ring-1 ring-inset ring-[var(--linha)] focus:outline-none focus:ring-2 focus:ring-brand-500/60 [&>option]:bg-ink-850"
            >
              {TAMANHOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}

        {totalPaginas > 1 && (
          <div className="flex items-center gap-0.5">
            <BotaoPagina onClick={() => onPagina(1)} desabilitado={pagina === 1} titulo="Primeira página">
              <ChevronsLeft className="size-3.5" />
            </BotaoPagina>
            <BotaoPagina onClick={() => onPagina(pagina - 1)} desabilitado={pagina === 1} titulo="Página anterior">
              <ChevronLeft className="size-3.5" />
            </BotaoPagina>

            {paginas.map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-[11px] text-ink-600">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPagina(p)}
                  aria-current={p === pagina ? "page" : undefined}
                  className={cn(
                    "h-7 min-w-7 rounded-md px-1.5 text-[11px] font-medium tabular-nums transition",
                    p === pagina
                      ? "bg-brand-500 text-white"
                      : "text-ink-400 hover:bg-ink-800 hover:text-ink-200",
                  )}
                >
                  {p}
                </button>
              ),
            )}

            <BotaoPagina onClick={() => onPagina(pagina + 1)} desabilitado={pagina === totalPaginas} titulo="Próxima página">
              <ChevronRight className="size-3.5" />
            </BotaoPagina>
            <BotaoPagina onClick={() => onPagina(totalPaginas)} desabilitado={pagina === totalPaginas} titulo="Última página">
              <ChevronsRight className="size-3.5" />
            </BotaoPagina>
          </div>
        )}
      </div>
    </div>
  );
}

function BotaoPagina({
  children, onClick, desabilitado, titulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  desabilitado: boolean;
  titulo: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      title={titulo}
      aria-label={titulo}
      className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-ink-800 hover:text-ink-200 disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

/** Mostra no máximo 7 slots: 1 … 4 5 6 … 20 */
function janelaDePaginas(atual: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const paginas: Array<number | null> = [1];
  const inicio = Math.max(2, atual - 1);
  const fim = Math.min(total - 1, atual + 1);

  if (inicio > 2) paginas.push(null);
  for (let p = inicio; p <= fim; p++) paginas.push(p);
  if (fim < total - 1) paginas.push(null);
  paginas.push(total);

  return paginas;
}
