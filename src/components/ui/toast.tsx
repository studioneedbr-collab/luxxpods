"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { AlertTriangle, Check, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "ok" | "erro" | "aviso" | "info";

interface Aviso {
  id: number;
  tom: Tom;
  titulo: string;
  detalhe?: string;
}

interface ContextoToast {
  avisar: (titulo: string, opcoes?: { tom?: Tom; detalhe?: string }) => void;
  ok: (titulo: string, detalhe?: string) => void;
  erro: (titulo: string, detalhe?: string) => void;
}

const Contexto = createContext<ContextoToast | null>(null);

/** Feedback curto para o operador saber que a ação foi registrada. */
export function useToast(): ContextoToast {
  const ctx = useContext(Contexto);
  // fora do provider, vira no-op em vez de quebrar a tela
  return ctx ?? { avisar: () => {}, ok: () => {}, erro: () => {} };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(1);

  const remover = useCallback((id: number) => {
    setAvisos((l) => l.filter((a) => a.id !== id));
  }, []);

  const avisar = useCallback((
    titulo: string, opcoes?: { tom?: Tom; detalhe?: string },
  ) => {
    const id = proximoId.current++;
    setAvisos((l) => [...l.slice(-3), {
      id, titulo, tom: opcoes?.tom ?? "ok", detalhe: opcoes?.detalhe,
    }]);
  }, []);

  const valor = useMemo<ContextoToast>(() => ({
    avisar,
    ok: (titulo, detalhe) => avisar(titulo, { tom: "ok", detalhe }),
    erro: (titulo, detalhe) => avisar(titulo, { tom: "erro", detalhe }),
  }), [avisar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,340px)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {avisos.map((a) => (
          <Cartao key={a.id} aviso={a} aoFechar={() => remover(a.id)} />
        ))}
      </div>
    </Contexto.Provider>
  );
}

const ESTILOS: Record<Tom, { icone: typeof Check; classe: string }> = {
  ok:    { icone: Check,          classe: "text-ok-400 bg-ok-500/12 ring-ok-500/25" },
  erro:  { icone: XCircle,        classe: "text-bad-400 bg-bad-500/12 ring-bad-500/25" },
  aviso: { icone: AlertTriangle,  classe: "text-warn-400 bg-warn-500/12 ring-warn-500/25" },
  info:  { icone: Info,           classe: "text-info-400 bg-info-500/12 ring-info-500/25" },
};

function Cartao({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const [saindo, setSaindo] = useState(false);
  const estilo = ESTILOS[aviso.tom];

  useEffect(() => {
    const fim = setTimeout(() => setSaindo(true), aviso.tom === "erro" ? 6000 : 3200);
    const remover = setTimeout(aoFechar, aviso.tom === "erro" ? 6220 : 3420);
    return () => { clearTimeout(fim); clearTimeout(remover); };
  }, [aviso.tom, aoFechar]);

  return (
    <div
      className={cn(
        "panel pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 shadow-2xl transition-all duration-200",
        saindo ? "translate-x-2 opacity-0" : "animate-in-up",
      )}
    >
      <span className={cn(
        "mt-px grid size-5 shrink-0 place-items-center rounded-md ring-1 ring-inset",
        estilo.classe,
      )}>
        <estilo.icone className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-ink-100">{aviso.titulo}</p>
        {aviso.detalhe && (
          <p className="mt-0.5 text-[11px] leading-snug text-ink-400">{aviso.detalhe}</p>
        )}
      </div>
      <button
        onClick={aoFechar}
        aria-label="Fechar aviso"
        className="grid size-5 shrink-0 place-items-center rounded text-ink-500 transition hover:bg-ink-800 hover:text-ink-200"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
