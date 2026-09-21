"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { PERIODOS } from "@/lib/periodo";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function FiltroPeriodo({ rotulo }: { rotulo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const atual = params.get("p") ?? "mes";
  const offset = Number(params.get("m") ?? 0);
  const ehCustom = atual === "custom";

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
    q.set("p", "custom");
    q.set("de", de);
    q.set("ate", ate);
    q.delete("m");
    setAberto(false);
    router.push(`${pathname}?${q.toString()}`);
  };

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-white/4 p-0.5 ring-1 ring-inset ring-white/8">
        {PERIODOS.map((p) => {
          const ativo = !ehCustom && atual === p.chave && !(p.chave === "mes" && offset !== 0);
          return (
            <button
              key={p.chave}
              onClick={() => ir(p.chave)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                ativo ? "bg-brand-500 text-white shadow"
                      : "text-ink-400 hover:bg-white/6 hover:text-ink-200",
              )}
            >
              {p.rotulo}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-0.5 rounded-lg bg-white/4 p-0.5 ring-1 ring-inset ring-white/8">
        <button
          onClick={() => ir("mes", offset - 1)}
          aria-label="Mês anterior"
          title="Mês anterior"
          className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-white/6 hover:text-ink-100"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className={cn(
          "flex min-w-[118px] items-center justify-center gap-1.5 px-2 text-xs font-semibold capitalize",
          ehCustom ? "text-brand-200" : "text-ink-200",
        )}>
          <CalendarRange className="size-3.5 shrink-0 text-brand-400" />
          <span className="truncate">{rotulo}</span>
        </span>
        <button
          onClick={() => ir("mes", Math.min(0, offset + 1))}
          disabled={!ehCustom && offset >= 0 && atual === "mes"}
          aria-label="Próximo mês"
          title="Próximo mês"
          className="grid size-7 place-items-center rounded-md text-ink-400 transition hover:bg-white/6 hover:text-ink-100 disabled:opacity-30"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* período personalizado */}
      <div className="relative" ref={caixa}>
        <button
          onClick={() => setAberto((v) => !v)}
          title="Período personalizado"
          className={cn(
            "flex h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset transition",
            ehCustom
              ? "bg-brand-500/16 text-brand-200 ring-brand-500/30"
              : "bg-white/4 text-ink-400 ring-white/8 hover:bg-white/6 hover:text-ink-200",
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="hidden sm:inline">Personalizado</span>
        </button>

        {aberto && (
          <div className="panel absolute left-0 top-10 z-40 w-[min(92vw,300px)] animate-in-up p-3 shadow-2xl">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Escolher período
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-ink-500">De</span>
                <input
                  type="date" value={de} max={ate || hoje}
                  onChange={(e) => setDe(e.target.value)}
                  className="h-8 w-full rounded-lg bg-white/4 px-2 text-xs text-ink-100 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-ink-500">Até</span>
                <input
                  type="date" value={ate} min={de} max={hoje}
                  onChange={(e) => setAte(e.target.value)}
                  className="h-8 w-full rounded-lg bg-white/4 px-2 text-xs text-ink-100 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
                />
              </label>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { rotulo: "7 dias", dias: 7 },
                { rotulo: "15 dias", dias: 15 },
                { rotulo: "30 dias", dias: 30 },
                { rotulo: "90 dias", dias: 90 },
              ].map((atalho) => (
                <button
                  key={atalho.dias}
                  onClick={() => {
                    const fim = new Date();
                    const inicio = new Date(Date.now() - atalho.dias * 864e5);
                    setDe(inicio.toISOString().slice(0, 10));
                    setAte(fim.toISOString().slice(0, 10));
                  }}
                  className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-ink-400 transition hover:bg-brand-500/15 hover:text-brand-200"
                >
                  {atalho.rotulo}
                </button>
              ))}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <Button tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button tamanho="sm" variante="primario" disabled={!de || !ate} onClick={aplicarCustom}>
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
