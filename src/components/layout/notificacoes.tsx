"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell, MessageCircle, ListChecks, Package, ShoppingBag, Wallet, RefreshCcw,
  Check, ChevronRight,
} from "lucide-react";
import type { Notificacao } from "@/app/api/notificacoes/route";
import { cn, tempoRelativo } from "@/lib/utils";

const ICONES = {
  conversa: MessageCircle, tarefa: ListChecks, estoque: Package,
  pedido: ShoppingBag, financeiro: Wallet, troca: RefreshCcw,
} as const;

const TONS = {
  alta: "bg-bad-500/12 text-bad-400 ring-bad-500/20",
  media: "bg-warn-500/12 text-warn-400 ring-warn-500/20",
  baixa: "bg-info-500/12 text-info-400 ring-info-500/20",
} as const;

export function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [urgentes, setUrgentes] = useState(0);
  const [ancora, setAncora] = useState({ top: 0, right: 0 });
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes").then((x) => x.json());
      setLista(r.notificacoes ?? []);
      setUrgentes(r.urgentes ?? 0);
    } catch {
      /* mantém a última lista conhecida */
    }
  }, []);

  // a primeira carga entra na fila de tarefas em vez de rodar no corpo do
  // efeito, para não disparar um render em cascata logo após a montagem
  useEffect(() => {
    const primeira = setTimeout(carregar, 0);
    const ciclo = setInterval(carregar, 45000);
    return () => { clearTimeout(primeira); clearInterval(ciclo); };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || gatilho.current?.contains(alvo)) return;
      setAberto(false);
    };
    const reposicionar = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (r) setAncora({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    reposicionar();
    document.addEventListener("mousedown", fora);
    window.addEventListener("resize", reposicionar);
    window.addEventListener("scroll", reposicionar, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("resize", reposicionar);
      window.removeEventListener("scroll", reposicionar, true);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={gatilho}
        onClick={() => { setAberto((v) => !v); if (!aberto) carregar(); }}
        aria-label={`Notificações${lista.length ? `: ${lista.length}` : ""}`}
        className={cn(
          "relative grid size-8 place-items-center rounded-lg transition",
          aberto ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:bg-ink-800 hover:text-ink-200",
        )}
      >
        <Bell className="size-4" />
        {lista.length > 0 && (
          <span className={cn(
            "absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-ink-990",
            urgentes > 0 ? "bg-bad-500" : "bg-brand-500",
          )}>
            {lista.length > 9 ? "9+" : lista.length}
          </span>
        )}
      </button>

      {aberto && createPortal(
        <div
          ref={caixa}
          style={{ top: ancora.top, right: ancora.right }}
          className="flutua fixed z-[100] w-[min(92vw,360px)] animate-in-up overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-[var(--linha)] px-4 py-2.5">
            <h3 className="text-xs font-semibold text-ink-100">Notificações</h3>
            {urgentes > 0 && (
              <span className="rounded-full bg-bad-500/14 px-2 py-0.5 text-[10px] font-semibold text-bad-400 ring-1 ring-inset ring-bad-500/25">
                {urgentes} urgente{urgentes > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {lista.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid size-10 place-items-center rounded-xl bg-ok-500/12 text-ok-400">
                  <Check className="size-4" />
                </span>
                <p className="text-xs font-medium text-ink-200">Nada pendente</p>
                <p className="text-[11px] text-ink-500">A operação está em dia.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {lista.map((n) => {
                  const Icone = ICONES[n.tipo];
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.href}
                        onClick={() => setAberto(false)}
                        className="flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-ink-850"
                      >
                        <span className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                          TONS[n.prioridade],
                        )}>
                          <Icone className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium leading-snug text-ink-100">
                            {n.titulo}
                          </span>
                          {n.detalhe && (
                            <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                              {n.detalhe}
                            </span>
                          )}
                          {n.quando && (
                            <span className="mt-0.5 block text-[10px] text-ink-600">
                              há {tempoRelativo(n.quando)}
                            </span>
                          )}
                        </span>
                        <ChevronRight className="mt-1.5 size-3 shrink-0 text-ink-600" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--linha)] px-4 py-2">
            <button
              onClick={carregar}
              className="text-[11px] font-medium text-brand-300 transition hover:text-brand-200"
            >
              Atualizar agora
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
