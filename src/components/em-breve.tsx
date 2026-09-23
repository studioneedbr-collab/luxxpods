import { Panel } from "@/components/ui";
import { CircleDashed, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Módulos previstos no escopo que entram no MVP 2.
 * A tela já existe e explica o que será entregue — nada de rota quebrada.
 */
export function EmBreve({
  titulo, descricao, icone: Icone, entrega, itens, pronto,
}: {
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  entrega: string;
  itens: string[];
  pronto?: string[];
}) {
  return (
    <Panel className="mx-auto max-w-2xl overflow-hidden">
      <div className="flex items-start gap-4 border-b border-[var(--linha)] px-6 py-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-500/20">
          <Icone className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">{titulo}</h2>
            <span className="rounded-full bg-warn-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn-400 ring-1 ring-inset ring-warn-500/25">
              {entrega}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">{descricao}</p>
        </div>
      </div>

      <div className="grid gap-px bg-ink-850 sm:grid-cols-2">
        <div className="bg-ink-900 p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Já pronto no banco
          </p>
          <ul className="space-y-2">
            {(pronto ?? ["Tabelas e relacionamentos", "Regras de integridade"]).map((i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-300">
                <Check className="mt-0.5 size-3 shrink-0 text-ok-400" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-ink-900 p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Falta a interface
          </p>
          <ul className="space-y-2">
            {itens.map((i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-400">
                <CircleDashed className="mt-0.5 size-3 shrink-0 text-ink-600" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
