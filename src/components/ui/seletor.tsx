"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Opcao {
  valor: string;
  rotulo: string;
  detalhe?: string;
  cor?: string;
  desabilitada?: boolean;
}

/**
 * Seletor próprio — o <select> nativo herda o visual do sistema operacional
 * e quebra a identidade do painel. Este abre num painel flutuante, aceita
 * teclado e busca quando a lista é longa.
 */
export function Seletor({
  valor, opcoes, aoMudar, placeholder = "Selecione…", className, largura,
  buscavel, disabled, id,
}: {
  valor: string | null;
  opcoes: Opcao[];
  aoMudar: (v: string) => void;
  placeholder?: string;
  className?: string;
  largura?: number | string;
  /** mostra campo de busca (ligado automaticamente acima de 8 opções) */
  buscavel?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState(0);
  const [ancora, setAncora] = useState({ top: 0, left: 0, width: 0, acima: false });

  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);
  const idGerado = useId();

  const comBusca = buscavel ?? opcoes.length > 8;
  const selecionada = opcoes.find((o) => o.valor === valor) ?? null;

  const filtradas = busca.trim()
    ? opcoes.filter((o) =>
        o.rotulo.toLowerCase().includes(busca.trim().toLowerCase()) ||
        (o.detalhe ?? "").toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes;

  /* posiciona o painel e fecha ao clicar fora */
  useEffect(() => {
    if (!aberto) return;

    const posicionar = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (!r) return;
      const alturaEstimada = Math.min(288, filtradas.length * 34 + (comBusca ? 44 : 8));
      const cabeAbaixo = window.innerHeight - r.bottom > alturaEstimada + 12;
      setAncora({
        top: cabeAbaixo ? r.bottom + 4 : r.top - alturaEstimada - 4,
        left: r.left,
        width: r.width,
        acima: !cabeAbaixo,
      });
    };

    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (gatilho.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setAberto(false);
    };

    posicionar();
    if (comBusca) setTimeout(() => campoBusca.current?.focus(), 20);

    document.addEventListener("mousedown", fora);
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto, comBusca, filtradas.length]);

  function escolher(opcao: Opcao) {
    if (opcao.desabilitada) return;
    aoMudar(opcao.valor);
    setAberto(false);
    setBusca("");
    gatilho.current?.focus();
  }

  function teclas(e: React.KeyboardEvent) {
    if (!aberto) {
      if (["Enter", " ", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        setAberto(true);
        setFoco(Math.max(0, opcoes.findIndex((o) => o.valor === valor)));
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setAberto(false); setBusca(""); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(f + 1, filtradas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtradas[foco]) escolher(filtradas[foco]); }
  }

  return (
    <>
      <button
        ref={gatilho}
        id={id ?? idGerado}
        type="button"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${idGerado}-lista`}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setAberto((v) => !v)}
        onKeyDown={teclas}
        style={largura ? { width: largura } : undefined}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md bg-ink-950 px-2.5 text-[13px]",
          "ring-1 ring-inset ring-[var(--linha)] transition-colors",
          "hover:ring-[var(--linha-forte)] focus:outline-none focus:ring-2 focus:ring-brand-500/60",
          "disabled:pointer-events-none disabled:opacity-50",
          aberto && "ring-2 ring-brand-500/60",
          className,
        )}
      >
        {selecionada?.cor && (
          <span className="size-2 shrink-0 rounded-full" style={{ background: selecionada.cor }} />
        )}
        <span className={cn(
          "min-w-0 flex-1 truncate text-left",
          selecionada ? "text-ink-100" : "text-ink-500",
        )}>
          {selecionada?.rotulo ?? placeholder}
        </span>
        <ChevronDown className={cn(
          "size-3.5 shrink-0 text-ink-500 transition-transform",
          aberto && "rotate-180",
        )} />
      </button>

      {aberto && createPortal(
        <div
          ref={painel}
          id={`${idGerado}-lista`}
          role="listbox"
          style={{ top: ancora.top, left: ancora.left, minWidth: ancora.width }}
          className="flutua fixed z-[110] max-h-72 overflow-hidden animate-in-up"
        >
          {comBusca && (
            <div className="flex items-center gap-2 border-b border-[var(--linha)] px-2.5 py-2">
              <Search className="size-3.5 shrink-0 text-ink-500" />
              <input
                ref={campoBusca}
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setFoco(0); }}
                onKeyDown={teclas}
                placeholder="Buscar…"
                className="w-full bg-transparent text-[13px] text-ink-100 placeholder:text-ink-600 focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1">
            {filtradas.length === 0 && (
              <p className="px-3 py-4 text-center text-[11px] text-ink-500">Nada encontrado</p>
            )}
            {filtradas.map((o, i) => {
              const ativa = o.valor === valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  role="option"
                  aria-selected={ativa}
                  disabled={o.desabilitada}
                  onClick={() => escolher(o)}
                  onMouseEnter={() => setFoco(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    o.desabilitada && "cursor-not-allowed opacity-40",
                    i === foco && !o.desabilitada ? "bg-brand-500/14" : "",
                    ativa ? "text-brand-200" : "text-ink-200",
                  )}
                >
                  {o.cor && (
                    <span className="size-2 shrink-0 rounded-full" style={{ background: o.cor }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.rotulo}</span>
                    {o.detalhe && (
                      <span className="block truncate text-[11px] text-ink-500">{o.detalhe}</span>
                    )}
                  </span>
                  {ativa && <Check className="size-3.5 shrink-0 text-brand-300" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
