import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Panel */
export function Panel({
  className, children, ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  titulo, descricao, acao, icone: Icone, className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  icone?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 py-4 border-b border-white/5", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icone && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/12 text-brand-300">
            <Icone className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-100 truncate">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-ink-400">{descricao}</p>}
        </div>
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */
const tonsBadge = {
  neutro: "bg-white/6 text-ink-300 ring-white/10",
  brand: "bg-brand-500/14 text-brand-300 ring-brand-500/25",
  ok: "bg-ok-500/14 text-ok-400 ring-ok-500/25",
  warn: "bg-warn-500/14 text-warn-400 ring-warn-500/25",
  bad: "bg-bad-500/14 text-bad-400 ring-bad-500/25",
  info: "bg-info-500/14 text-info-400 ring-info-500/25",
  gold: "bg-gold-500/14 text-gold-400 ring-gold-500/25",
} as const;

export type BadgeTom = keyof typeof tonsBadge;

export function Badge({
  children, tom = "neutro", className, ponto,
}: {
  children: React.ReactNode;
  tom?: BadgeTom;
  className?: string;
  ponto?: boolean;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
      tonsBadge[tom], className,
    )}>
      {ponto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Button */
const variantes = {
  primario: "bg-brand-500 text-white hover:bg-brand-400 shadow-lg shadow-brand-500/20",
  suave: "bg-white/6 text-ink-200 hover:bg-white/10 ring-1 ring-inset ring-white/10",
  fantasma: "text-ink-300 hover:text-ink-100 hover:bg-white/5",
  perigo: "bg-bad-500/15 text-bad-400 hover:bg-bad-500/25 ring-1 ring-inset ring-bad-500/25",
  ok: "bg-ok-500/15 text-ok-400 hover:bg-ok-500/25 ring-1 ring-inset ring-ok-500/25",
} as const;

const tamanhos = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  icone: "size-9 justify-center",
  iconeSm: "size-8 justify-center",
} as const;

export function Button({
  variante = "suave", tamanho = "md", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof variantes;
  tamanho?: keyof typeof tamanhos;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center rounded-lg font-medium transition-all",
        "disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60",
        variantes[variante], tamanhos[tamanho], className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ Input */
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg bg-white/4 px-3 text-sm text-ink-100 placeholder:text-ink-500",
        "ring-1 ring-inset ring-white/10 transition",
        "focus:outline-none focus:ring-2 focus:ring-brand-400/60 focus:bg-white/6",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg bg-white/4 px-3 text-sm text-ink-100",
        "ring-1 ring-inset ring-white/10 transition appearance-none cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-brand-400/60",
        "[&>option]:bg-ink-850 [&>option]:text-ink-100",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ Table */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="rolagem-lateral w-full overflow-x-auto">
      <table className={cn("w-full text-sm border-separate border-spacing-0", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn(
      "sticky top-0 z-10 bg-ink-900/85 backdrop-blur px-4 py-2.5 text-left",
      "text-[11px] font-semibold uppercase tracking-wider text-ink-400",
      "border-b border-white/6 whitespace-nowrap", className,
    )} {...props} />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-2.5 border-b border-white/4 text-ink-200", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition hover:bg-white/3", className)} {...props} />;
}

/* ------------------------------------------------------------------ Vazio */
export function Vazio({
  titulo, descricao, icone: Icone, acao,
}: {
  titulo: string;
  descricao?: string;
  icone?: React.ComponentType<{ className?: string }>;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icone && (
        <span className="grid size-12 place-items-center rounded-2xl bg-white/4 text-ink-500">
          <Icone className="size-5" />
        </span>
      )}
      <div>
        <p className="text-sm font-medium text-ink-200">{titulo}</p>
        {descricao && <p className="mt-1 text-xs text-ink-500 max-w-xs">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

/* --------------------------------------------------------------- Progresso */
export function Barra({ valor, tom = "brand", className }: {
  valor: number; tom?: "brand" | "ok" | "warn" | "bad"; className?: string;
}) {
  const cores = {
    brand: "bg-brand-500", ok: "bg-ok-500", warn: "bg-warn-500", bad: "bg-bad-500",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/6", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", cores[tom])}
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}
