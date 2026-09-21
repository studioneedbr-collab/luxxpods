"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Menu, X, Zap } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";

export function Sidebar({ contadores }: { contadores: Record<string, number> }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.sidebar = recolhido ? "recolhido" : "normal";
  }, [recolhido]);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* botão mobile */}
      <button
        onClick={() => setAberto(true)}
        className="fixed left-4 top-3.5 z-50 grid size-9 place-items-center rounded-lg bg-ink-800/90 ring-1 ring-white/10 backdrop-blur lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-4" />
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setAberto(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/6 bg-ink-900/95 backdrop-blur-xl transition-all duration-300",
          "lg:translate-x-0",
          recolhido ? "w-[72px]" : "w-[248px]",
          aberto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* marca */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/6 px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
            <Zap className="size-4 text-white" strokeWidth={2.5} />
          </span>
          {!recolhido && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-none tracking-tight text-ink-100">LUXX PODS</p>
              <p className="mt-1 text-[10px] leading-none text-ink-500">Sistema de operação</p>
            </div>
          )}
          <button
            onClick={() => setAberto(false)}
            className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-white/6 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* navegação */}
        <nav className="no-scrollbar flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((grupo) => (
            <div key={grupo.titulo} className="mb-4">
              {!recolhido && (
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {grupo.titulo}
                </p>
              )}
              <ul className="space-y-0.5">
                {grupo.itens.map((item) => {
                  const on = ativo(item.href);
                  const n = item.badge ? contadores[item.badge] ?? 0 : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setAberto(false)}
                        title={recolhido ? item.rotulo : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all",
                          on
                            ? "bg-brand-500/14 text-brand-200"
                            : "text-ink-400 hover:bg-white/5 hover:text-ink-200",
                          recolhido && "justify-center px-0",
                        )}
                      >
                        {on && (
                          <span className="absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400" />
                        )}
                        <item.icone className={cn("size-4 shrink-0", on && "text-brand-300")} />
                        {!recolhido && <span className="flex-1 truncate">{item.rotulo}</span>}
                        {!recolhido && n > 0 && (
                          <span className="rounded-full bg-brand-500 px-1.5 py-px text-[10px] font-bold text-white tabular-nums">
                            {n > 99 ? "99+" : n}
                          </span>
                        )}
                        {recolhido && n > 0 && (
                          <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-brand-400" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          onClick={() => setRecolhido((v) => !v)}
          className="hidden h-10 shrink-0 items-center justify-center gap-2 border-t border-white/6 text-[11px] text-ink-500 transition hover:bg-white/4 hover:text-ink-300 lg:flex"
        >
          <ChevronLeft className={cn("size-3.5 transition-transform", recolhido && "rotate-180")} />
          {!recolhido && "Recolher"}
        </button>
      </aside>
    </>
  );
}
