import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tons = {
  brand: "from-brand-500/18 text-brand-300 ring-brand-500/25",
  ok: "from-ok-500/18 text-ok-400 ring-ok-500/25",
  warn: "from-warn-500/18 text-warn-400 ring-warn-500/25",
  bad: "from-bad-500/18 text-bad-400 ring-bad-500/25",
  info: "from-info-500/18 text-info-400 ring-info-500/25",
  gold: "from-gold-500/18 text-gold-400 ring-gold-500/25",
} as const;

export function StatCard({
  rotulo, valor, sub, icone: Icone, tom = "brand", variacao, destaque,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  icone: LucideIcon;
  tom?: keyof typeof tons;
  variacao?: number | null;
  destaque?: boolean;
}) {
  return (
    <div className={cn(
      "panel animate-in-up relative overflow-hidden p-4",
      destaque && "ring-1 ring-brand-500/25",
    )}>
      <div className={cn(
        "pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-gradient-to-br to-transparent blur-2xl",
        tons[tom].split(" ")[0],
      )} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{rotulo}</p>
          <p className="mt-1.5 truncate text-[22px] font-bold leading-none tracking-tight text-ink-100 tabular-nums">
            {valor}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {typeof variacao === "number" && (
              <span className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
                variacao >= 0 ? "text-ok-400" : "text-bad-400",
              )}>
                {variacao >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(variacao).toFixed(1).replace(".", ",")}%
              </span>
            )}
            {sub && <span className="truncate text-[11px] text-ink-500">{sub}</span>}
          </div>
        </div>
        <span className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl bg-white/5 ring-1 ring-inset",
          tons[tom].split(" ").slice(1).join(" "),
        )}>
          <Icone className="size-4" />
        </span>
      </div>
    </div>
  );
}
