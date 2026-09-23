"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarRange, Check } from "lucide-react";
import { Button, CampoData } from "@/components/ui";
import { cn } from "@/lib/utils";

const ATALHOS = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "ontem", rotulo: "Ontem" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
  { chave: "ano", rotulo: "Ano" },
] as const;

/**
 * Um controle só: o período escolhido fica em evidência e os atalhos ficam
 * ao lado. Antes eram três blocos disputando a mesma faixa da tela.
 */
export function FiltroPeriodo({ rotulo }: { rotulo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const atual = params.get("p") ?? "mes";
  const offset = Number(params.get("m") ?? 0);
  const ehCustom = atual === "custom";
  const ehMesNavegado = atual === "mes";

  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(params.get("de") ?? "");
  const [ate, setAte] = useState(params.get("ate") ?? "");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const ir = (chave: string, mes = 0) => {
    const q = new URLSearchParams(params.toString());
    q.set("p", chave);
    q.delete("de"); q.delete("ate");
    if (chave === "mes" && mes !== 0) q.set("m", String(mes));
    else q.delete("m");
    router.push(`${pathname}?${q.toString()}`);
  };

  const aplicarCustom = () => {
    if (!de || !ate) return;
    const q = new URLSearchParams(params.toString());
    q.set("p", "custom"); q.set("de", de); q.set("ate", ate); q.delete("m");
    setAberto(false);
    router.push(`${pathname}?${q.toString()}`);
  };

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2" ref={caixa}>
      {/* período em vigor, com navegação de mês embutida */}
      <div className="relative flex h-9 items-center rounded-lg bg-ink-900 ring-1 ring-inset ring-[var(--linha)]">
        <button
          onClick={() => ir("mes", offset - 1)}
          aria-label="Mês anterior"
          title="Mês anterior"
          className="grid h-full w-8 place-items-center rounded-l-lg text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100"
        >
          <ChevronLeft className="size-4" />
        </button>

        <button
          onClick={() => setAberto((v) => !v)}
          className="flex h-full min-w-[150px] items-center justify-center gap-2 px-3 transition-colors hover:bg-ink-800"
          title="Escolher um período livre"
        >
          <CalendarRange className={cn("size-3.5 shrink-0",
            ehCustom ? "text-brand-400" : "text-ink-500")} />
          <span className={cn(
            "display truncate text-[13px] font-semibold capitalize",
            ehCustom ? "text-brand-200" : "text-ink-100",
          )}>
            {rotulo}
          </span>
        </button>

        <button
          onClick={() => ir("mes", Math.min(0, offset + 1))}
          disabled={ehMesNavegado && offset >= 0}
          aria-label="Próximo mês"
          title="Próximo mês"
          className="grid h-full w-8 place-items-center rounded-r-lg text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* atalhos */}
      <div className="flex h-9 items-center gap-0.5 rounded-lg bg-ink-900 p-1 ring-1 ring-inset ring-[var(--linha)]">
        {ATALHOS.map((a) => {
          const ativo = !ehCustom && atual === a.chave && !(a.chave === "mes" && offset !== 0);
          return (
            <button
              key={a.chave}
              onClick={() => ir(a.chave)}
              className={cn(
                "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                ativo
                  ? "bg-brand-500 text-white"
                  : "text-ink-400 hover:bg-ink-800 hover:text-ink-100",
              )}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {/* painel do período livre */}
      {aberto && (
        <div className="flutua absolute left-4 top-[124px] z-40 w-[min(92vw,296px)] animate-in-up p-3 lg:left-auto">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            Período livre
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-ink-500">De</span>
              <CampoData valor={de || null} max={ate || hoje} aoMudar={(v) => setDe(v ?? "")} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-ink-500">Até</span>
              <CampoData valor={ate || null} min={de} max={hoje} aoMudar={(v) => setAte(v ?? "")} />
            </label>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[7, 15, 30, 90].map((dias) => (
              <button
                key={dias}
                onClick={() => {
                  setDe(new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10));
                  setAte(hoje);
                }}
                className="rounded bg-ink-850 px-2 py-1 text-[10px] text-ink-400 transition-colors hover:bg-brand-500/15 hover:text-brand-200"
              >
                {dias} dias
              </button>
            ))}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button tamanho="sm" variante="primario" disabled={!de || !ate} onClick={aplicarCustom}>
              <Check className="size-3.5" /> Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
