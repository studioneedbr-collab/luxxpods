import * as React from "react";
import { cn } from "@/lib/utils";

export { Select } from "./select";
export { Seletor, type Opcao } from "./seletor";
export { CampoMoeda, ValorMoeda } from "./campo-moeda";
export { CampoData } from "./campo-data";
export { CampoMascara } from "./campo-mascara";

/* ---------------------------------------------------------------- Superfície
   Uma chapa de trabalho: um degrau de luz e uma hairline. Sem sombra e sem
   gradiente — o relevo fica para o que precisa flutuar de verdade.
   -------------------------------------------------------------------------- */
export function Panel({
  className, children, ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("chapa", className)} {...props}>
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
    <div className={cn(
      "flex items-start justify-between gap-4 border-b border-[var(--linha)] px-4 py-3",
      className,
    )}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icone && <Icone className="mt-0.5 size-4 shrink-0 text-ink-500" />}
        <div className="min-w-0">
          <h2 className="display truncate text-[13px] font-semibold tracking-tight text-ink-100">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{descricao}</p>}
        </div>
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------- Badge
   Estado, não enfeite: fundo discreto e texto colorido. Sem anel duplo.
   -------------------------------------------------------------------------- */
const tonsBadge = {
  neutro: "bg-ink-800 text-ink-300",
  brand:  "bg-brand-500/14 text-brand-300",
  ok:     "bg-ok-500/12 text-ok-400",
  warn:   "bg-warn-500/12 text-warn-400",
  bad:    "bg-bad-500/12 text-bad-400",
  info:   "bg-info-500/12 text-info-400",
  gold:   "bg-gold-500/12 text-gold-400",
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
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
      tonsBadge[tom], className,
    )}>
      {ponto && <span className="size-1 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Button */
const variantes = {
  primario: "bg-brand-500 text-white hover:bg-brand-400",
  suave:    "bg-ink-800 text-ink-200 hover:bg-ink-700 ring-1 ring-inset ring-[var(--linha)]",
  fantasma: "text-ink-400 hover:bg-ink-800 hover:text-ink-100",
  perigo:   "bg-bad-500/12 text-bad-400 hover:bg-bad-500/20",
  ok:       "bg-ok-500/12 text-ok-400 hover:bg-ok-500/20",
} as const;

const tamanhos = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-[13px] gap-1.5",
  icone: "size-8 justify-center",
  iconeSm: "size-7 justify-center",
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
        "inline-flex items-center rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        variantes[variante], tamanhos[tamanho], className,
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------------- Input */
const campoBase =
  "rounded-md bg-ink-950 text-ink-100 placeholder:text-ink-600 ring-1 ring-inset " +
  "ring-[var(--linha)] transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/60";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-8 w-full px-2.5 text-[13px]", campoBase, className)} {...props} />;
}

/* --------------------------------------------------------------------- Table */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="rolagem-lateral w-full overflow-x-auto">
      <table className={cn("w-full border-separate border-spacing-0 text-[13px]", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn(
      "sticky top-0 z-10 whitespace-nowrap border-b border-[var(--linha)] bg-ink-900 px-4 py-2",
      "text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500",
      className,
    )} {...props} />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-b border-[var(--linha)] px-4 py-2 text-ink-300", className)} {...props} />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-ink-850/60", className)} {...props} />;
}

/* --------------------------------------------------------------------- Vazio */
export function Vazio({
  titulo, descricao, icone: Icone, acao,
}: {
  titulo: string;
  descricao?: string;
  icone?: React.ComponentType<{ className?: string }>;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-14 text-center">
      {Icone && <Icone className="size-5 text-ink-600" />}
      <div>
        <p className="text-[13px] font-medium text-ink-300">{titulo}</p>
        {descricao && <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-ink-500">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

/* ------------------------------------------------------------------ Progresso */
export function Barra({ valor, tom = "brand", className }: {
  valor: number; tom?: "brand" | "ok" | "warn" | "bad"; className?: string;
}) {
  const cores = { brand: "bg-brand-500", ok: "bg-ok-500", warn: "bg-warn-500", bad: "bg-bad-500" };
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-ink-800", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", cores[tom])}
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/* ------------------------------------------------------------------- Seções
   Agrupa conteúdo sem transformar tudo num cartão.
   -------------------------------------------------------------------------- */
export function Secao({
  titulo, descricao, acao, children, className,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-4 border-b border-[var(--linha)] pb-2">
        <div className="min-w-0">
          <h2 className="rotulo text-ink-400">{titulo}</h2>
          {descricao && (
            <p className="mt-1 text-[11px] leading-snug text-ink-500">{descricao}</p>
          )}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
