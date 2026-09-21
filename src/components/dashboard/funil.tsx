import { ChevronDown } from "lucide-react";
import { brl, num } from "@/lib/utils";
import type { EtapaFunil } from "@/lib/types";

export function FunilPedidos({ etapas }: { etapas: EtapaFunil[] }) {
  const abertas = etapas.filter((e) => e.tipo === "aberto");
  const topo = Math.max(...abertas.map((e) => e.leads), 1);

  return (
    <div className="space-y-1 px-5 py-4">
      {abertas.map((etapa, i) => {
        const anterior = i > 0 ? abertas[i - 1].leads : etapa.leads;
        const perda = anterior > 0 ? ((anterior - etapa.leads) / anterior) * 100 : 0;
        const largura = Math.max(8, (etapa.leads / topo) * 100);

        return (
          <div key={etapa.stage_id}>
            {i > 0 && (
              <div className="flex items-center gap-1.5 py-0.5 pl-2 text-[10px] text-ink-500">
                <ChevronDown className="size-3" />
                {perda > 0 ? (
                  <span className="text-bad-400/80">−{perda.toFixed(0)}% de perda</span>
                ) : (
                  <span className="text-ok-400/80">sem perda</span>
                )}
              </div>
            )}
            <div className="group relative flex items-center gap-3 overflow-hidden rounded-lg bg-white/3 px-3 py-2 transition hover:bg-white/6">
              <div
                className="absolute inset-y-0 left-0 opacity-20 transition-all duration-500 group-hover:opacity-30"
                style={{ width: `${largura}%`, background: etapa.cor }}
              />
              <span className="relative size-2 shrink-0 rounded-full" style={{ background: etapa.cor }} />
              <span className="relative flex-1 truncate text-xs font-medium text-ink-200">{etapa.nome}</span>
              <span className="relative text-[11px] tabular-nums text-ink-500">{brl(etapa.valor)}</span>
              <span className="relative w-8 text-right text-sm font-bold tabular-nums text-ink-100">
                {num(etapa.leads)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
