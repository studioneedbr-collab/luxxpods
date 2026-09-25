import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Um número e o que ele quer dizer.
 * O peso visual vem do próprio número, não de caixa colorida em volta —
 * quando tudo tem destaque, nada tem.
 */
export function StatCard({
  rotulo, valor, sub, icone: Icone, tom = "neutro", variacao, destaque,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  icone?: LucideIcon;
  tom?: "neutro" | "brand" | "ok" | "warn" | "bad" | "info" | "gold";
  variacao?: number | null;
  destaque?: boolean;
}) {
  const cores = {
    neutro: "text-ink-100", brand: "text-brand-200", ok: "text-ok-400",
    warn: "text-warn-400", bad: "text-bad-400", info: "text-info-400",
    gold: "text-gold-400",
  };

  const subiu = typeof variacao === "number" && variacao > 0.5;
  const caiu = typeof variacao === "number" && variacao < -0.5;

  return (
    <div className={cn(
      "chapa realce overflow-hidden px-4 py-4",
      destaque && "bg-ink-850 ring-1 ring-brand-500/20",
    )}>
      {destaque && <span className="realce-barra" />}

      <div className="flex items-center justify-between gap-2">
        <p className="rotulo truncate">{rotulo}</p>
        {Icone && <Icone className="size-3.5 shrink-0 text-ink-600" />}
      </div>

      <p className={cn(
        "mt-2 truncate",
        destaque ? "numero-destaque" : "numero text-[19px] font-semibold leading-none",
        cores[tom],
      )}>
        {valor}
      </p>

      {(typeof variacao === "number" || sub) && (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          {typeof variacao === "number" && (
            <span className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums",
              subiu ? "text-ok-400" : caiu ? "text-bad-400" : "text-ink-500",
            )}>
              {subiu ? <ArrowUp className="size-3" />
                : caiu ? <ArrowDown className="size-3" />
                : <Minus className="size-3" />}
              {Math.abs(variacao).toFixed(0)}%
            </span>
          )}
          {sub && <span className="truncate text-ink-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}
