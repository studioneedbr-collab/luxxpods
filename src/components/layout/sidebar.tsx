"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePreferencia } from "@/lib/preferencia-local";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X, Menu } from "lucide-react";
import { NAV } from "./nav";
import { Simbolo, Wordmark } from "./marca";
import { cn } from "@/lib/utils";

export function Sidebar({ contadores }: { contadores: Record<string, number> }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [estreito, setEstreito] = usePreferencia<boolean>("luxx:menu-estreito", false);
  const [recolhidas, setRecolhidas] = usePreferencia<string[]>("luxx:secoes-recolhidas", []);

  const ativo = useCallback(
    (href: string) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    [pathname],
  );

  useEffect(() => {
    document.documentElement.dataset.sidebar = estreito ? "recolhido" : "normal";
  }, [estreito]);

  const alternarSecao = (titulo: string) => {
    setRecolhidas(
      recolhidas.includes(titulo)
        ? recolhidas.filter((t) => t !== titulo)
        : [...recolhidas, titulo],
    );
  };

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="fixed left-3 top-3 z-40 grid size-9 place-items-center rounded-lg bg-ink-850/95 ring-1 ring-[var(--linha)] backdrop-blur lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden"
          onClick={() => setAberto(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--linha)] bg-ink-950 transition-[width,transform] duration-200 lg:translate-x-0",
          estreito ? "w-16" : "w-[244px]",
          aberto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* ------------------------------ marca ------------------------------ */}
        <div className={cn(
          "flex h-[72px] shrink-0 items-center border-b border-[var(--linha)]",
          estreito ? "justify-center px-0" : "gap-3 px-4",
        )}>
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Luxx Pods — início">
            <Simbolo tamanho={estreito ? 38 : 40} />
            {!estreito && <Wordmark altura={17} />}
          </Link>
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="ml-auto grid size-7 place-items-center rounded-md text-ink-400 hover:bg-ink-800 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* --------------------------- navegação ---------------------------- */}
        <nav className="no-scrollbar flex-1 overflow-y-auto py-2">
          {NAV.map((grupo, indice) => {
            const fechada = recolhidas.includes(grupo.titulo);
            const temAtivo = grupo.itens.some((i) => ativo(i.href));
            const pendentes = grupo.itens.reduce(
              (soma, i) => soma + (i.badge ? contadores[i.badge] ?? 0 : 0), 0);

            return (
              <div key={grupo.titulo}>
                {/* separador tracejado entre setores */}
                {indice > 0 && !estreito && (
                  <div className="px-4 py-1.5" aria-hidden>
                    <div className="border-t border-dashed border-[var(--linha-forte)]" />
                  </div>
                )}
                {indice > 0 && estreito && (
                  <div className="mx-3 my-1.5 border-t border-dashed border-[var(--linha-forte)]" aria-hidden />
                )}

                {!estreito && (
                  <button
                    onClick={() => alternarSecao(grupo.titulo)}
                    aria-expanded={!fechada}
                    className="group flex w-full items-center gap-1.5 px-4 py-1.5 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3 shrink-0 text-ink-500 transition-transform duration-200",
                        fechada && "-rotate-90",
                      )}
                    />
                    <span className={cn(
                      "flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors",
                      temAtivo ? "text-brand-300" : "text-ink-500 group-hover:text-ink-300",
                    )}>
                      {grupo.titulo}
                    </span>
                    {fechada && pendentes > 0 && (
                      <span className="size-1.5 rounded-full bg-brand-400" />
                    )}
                  </button>
                )}

                {(!fechada || estreito) && (
                  <ul className={cn("space-y-px", estreito ? "px-2" : "px-2 pb-1")}>
                    {grupo.itens.map((item) => {
                      const on = ativo(item.href);
                      const n = item.badge ? contadores[item.badge] ?? 0 : 0;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setAberto(false)}
                            title={estreito ? item.rotulo : undefined}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                              "group relative flex items-center gap-2.5 rounded-md text-[13px] transition-colors",
                              estreito ? "justify-center px-0 py-2" : "px-2.5 py-[7px]",
                              on
                                ? "bg-brand-500/12 font-medium text-brand-100"
                                : "text-ink-400 hover:bg-ink-850 hover:text-ink-200",
                            )}
                          >
                            {on && (
                              <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-brand-400" />
                            )}
                            <item.icone className={cn(
                              "size-[15px] shrink-0",
                              on ? "text-brand-300" : "text-ink-500 group-hover:text-ink-300",
                            )} />
                            {!estreito && <span className="flex-1 truncate">{item.rotulo}</span>}
                            {!estreito && n > 0 && (
                              <span className={cn(
                                "rounded px-1.5 py-px text-[10px] font-semibold tabular-nums",
                                on ? "bg-brand-400 text-ink-990" : "bg-ink-700 text-ink-300",
                              )}>
                                {n > 99 ? "99+" : n}
                              </span>
                            )}
                            {estreito && n > 0 && (
                              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-brand-400" />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <button
          onClick={() => setEstreito(!estreito)}
          aria-label={estreito ? "Expandir menu" : "Recolher menu"}
          className="hidden h-10 shrink-0 items-center justify-center gap-2 border-t border-[var(--linha)] text-[11px] text-ink-500 transition-colors hover:bg-ink-900 hover:text-ink-300 lg:flex"
        >
          {estreito
            ? <PanelLeftOpen className="size-3.5" />
            : <><PanelLeftClose className="size-3.5" /> Recolher</>}
        </button>
      </aside>
    </>
  );
}
