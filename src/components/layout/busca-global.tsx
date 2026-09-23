"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Loader2, MessageCircle, Package, Search, ShoppingBag, User, CornerDownLeft,
} from "lucide-react";
import type { ResultadoBusca } from "@/app/api/busca/route";
import { cn } from "@/lib/utils";

const ICONES = {
  cliente: User, pedido: ShoppingBag, produto: Package, conversa: MessageCircle,
} as const;

const ROTULOS = {
  cliente: "Clientes", pedido: "Pedidos", produto: "Produtos", conversa: "Conversas",
} as const;

export function BuscaGlobal() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionado, setSelecionado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  /* ------------ atalho de teclado ------------ */
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", atalho);
    return () => document.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    if (aberto) setTimeout(() => campo.current?.focus(), 30);
  }, [aberto]);

  const fechar = useCallback(() => {
    setAberto(false);
    setTermo("");
    setResultados([]);
    setSelecionado(0);
  }, []);

  /* ------------ busca com debounce ------------ */
  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) return;

    const controle = new AbortController();
    const espera = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(t)}`, { signal: controle.signal });
        const dados = await r.json();
        setResultados(dados.resultados ?? []);
        setSelecionado(0);
      } catch {
        /* busca cancelada por uma digitação mais nova */
      } finally {
        setCarregando(false);
      }
    }, 220);

    return () => { clearTimeout(espera); controle.abort(); };
  }, [termo]);

  const abrir = useCallback((r: ResultadoBusca) => {
    fechar();
    router.push(r.href);
  }, [router, fechar]);

  // enquanto o termo é curto, nada é exibido — derivado, sem efeito
  const visiveis = termo.trim().length >= 2 ? resultados : [];
  const indiceAtivo = Math.min(selecionado, Math.max(0, visiveis.length - 1));

  function teclas(e: React.KeyboardEvent) {
    if (visiveis.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((s) => (s + 1) % visiveis.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((s) => (s - 1 + visiveis.length) % visiveis.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      abrir(visiveis[indiceAtivo]);
    }
  }

  const grupos = visiveis.reduce<Record<string, ResultadoBusca[]>>((acc, r) => {
    (acc[r.tipo] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      {aberto && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/75 p-4 backdrop-blur-[2px]"
          onClick={fechar}
        >
          <div
            className="flutua mx-auto mt-[10vh] w-full max-w-xl animate-in-up overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--linha)] px-4 py-3">
              {carregando
                ? <Loader2 className="size-4 shrink-0 animate-spin text-brand-400" />
                : <Search className="size-4 shrink-0 text-ink-500" />}
              <input
                ref={campo}
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={teclas}
                placeholder="Nome, telefone, número do pedido ou produto…"
                className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
              />
              <kbd className="rounded border border-[var(--linha-forte)] bg-ink-800 px-1.5 py-0.5 font-sans text-[10px] text-ink-500">
                esc
              </kbd>
            </div>

            <div className="max-h-[56vh] overflow-y-auto">
              {termo.trim().length < 2 && (
                <p className="px-4 py-8 text-center text-xs text-ink-500">
                  Digite ao menos 2 letras para buscar em toda a operação.
                </p>
              )}

              {termo.trim().length >= 2 && !carregando && visiveis.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-ink-500">
                  Nada encontrado para <span className="text-ink-300">“{termo}”</span>.
                </p>
              )}

              {Object.entries(grupos).map(([tipo, itens]) => {
                const Icone = ICONES[tipo as keyof typeof ICONES];
                return (
                  <div key={tipo}>
                    <p className="sticky top-0 z-10 bg-ink-850/95 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500 backdrop-blur">
                      {ROTULOS[tipo as keyof typeof ROTULOS]}
                    </p>
                    {itens.map((r) => {
                      const indice = visiveis.indexOf(r);
                      const ativo = indice === indiceAtivo;
                      return (
                        <button
                          key={`${r.tipo}-${r.id}`}
                          onClick={() => abrir(r)}
                          onMouseEnter={() => setSelecionado(indice)}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-4 py-2 text-left transition",
                            ativo ? "bg-brand-500/14" : "hover:bg-ink-850",
                          )}
                        >
                          <span className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-lg",
                            ativo ? "bg-brand-500/20 text-brand-300" : "bg-ink-800 text-ink-400",
                          )}>
                            <Icone className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-ink-100">
                              {r.titulo}
                            </span>
                            <span className="block truncate text-[11px] text-ink-500">
                              {r.detalhe}
                            </span>
                          </span>
                          {ativo && <CornerDownLeft className="size-3 shrink-0 text-ink-500" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {visiveis.length > 0 && (
              <div className="flex items-center gap-3 border-t border-[var(--linha)] px-4 py-2 text-[10px] text-ink-500">
                <span>↑↓ navegar</span>
                <span>↵ abrir</span>
                <span className="ml-auto tabular-nums">{visiveis.length} resultado(s)</span>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
