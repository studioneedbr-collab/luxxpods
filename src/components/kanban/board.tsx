"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle, AtSign, GripVertical, Search } from "lucide-react";
import { moverLead } from "@/lib/actions";
import { Panel, Badge, Vazio, Seletor } from "@/components/ui";
import { brl, cn, iniciais, tempoRelativo } from "@/lib/utils";
import type { EtapaFunil, Lead } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

export function KanbanBoard({
  etapas, leads: leadsIniciais,
}: { etapas: EtapaFunil[]; leads: Lead[] }) {
  const [leads, setLeads] = useState(leadsIniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [, iniciar] = useTransition();
  const toast = useToast();

  // O Kanban é a fila de trabalho: só atendimento vivo entra. Fechado sai
  // daqui e passa a viver no histórico do cliente.
  const abertos = useMemo(() => leads.filter((l) => l.status === "aberto"), [leads]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return abertos;
    return abertos.filter((l) =>
      (l.cliente?.nome ?? "").toLowerCase().includes(t) ||
      (l.cliente?.telefone ?? "").includes(t));
  }, [abertos, busca]);

  const fechadosHoje = leads.filter(
    (l) => l.status === "ganho" &&
      new Date(l.created_at).toDateString() === new Date().toDateString(),
  ).length;

  function mover(id: string, stageId: string) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage_id === stageId) return;

    const etapa = etapas.find((e) => e.stage_id === stageId);
    const status = etapa?.tipo === "ganho" ? "ganho" : etapa?.tipo === "perdido" ? "perdido" : "aberto";
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, stage_id: stageId, status } : x)));
    iniciar(async () => {
      const r = await moverLead(id, stageId);
      if (r.ok) {
        toast.ok(
          `${lead.cliente?.nome ?? "Lead"} → ${etapa?.nome ?? "nova etapa"}`,
          status === "ganho" ? "Lead marcado como ganho" : undefined,
        );
      } else {
        setLeads(leadsIniciais);
        toast.erro("Não consegui mover o lead", r.erro);
      }
    });
  }

  function soltar(stageId: string) {
    const id = arrastando;
    setArrastando(null);
    setSobre(null);
    if (id) mover(id, stageId);
  }

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lead por nome ou telefone…"
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Badge tom="brand">{filtrados.length} em atendimento</Badge>
        <Badge tom="ok">
          {brl(filtrados.reduce((a, l) => a + l.valor_estimado, 0))} em negociação
        </Badge>
        {fechadosHoje > 0 && (
          <Badge tom="gold">{fechadosHoje} fechado{fechadosHoje > 1 ? "s" : ""} hoje</Badge>
        )}
        <span className="text-[11px] text-ink-500">
          Ao marcar como fechado, o atendimento sai do funil
        </span>
      </Panel>

      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
        {etapas.filter((e) => e.tipo === "aberto").map((etapa) => {
          const doEstagio = filtrados.filter((l) => l.stage_id === etapa.stage_id);
          const valor = doEstagio.reduce((a, l) => a + l.valor_estimado, 0);
          const alvo = sobre === etapa.stage_id;

          return (
            <div
              key={etapa.stage_id}
              onDragOver={(e) => { e.preventDefault(); setSobre(etapa.stage_id); }}
              onDragLeave={() => setSobre((s) => (s === etapa.stage_id ? null : s))}
              onDrop={() => soltar(etapa.stage_id)}
              className={cn(
                "flex w-[272px] shrink-0 flex-col rounded-xl border transition",
                alvo
                  ? "border-brand-400/50 bg-brand-500/8"
                  : "border-[var(--linha)] bg-ink-950/50",
              )}
            >
              <div className="flex items-center gap-2 border-b border-[var(--linha)] px-3 py-2.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: etapa.cor }} />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-200">{etapa.nome}</p>
                <span className="rounded-full bg-ink-800 px-1.5 text-[10px] font-bold tabular-nums text-ink-300">
                  {doEstagio.length}
                </span>
              </div>

              {valor > 0 && (
                <p className="border-b border-[var(--linha)] px-3 py-1 text-[10px] tabular-nums text-ink-500">
                  {brl(valor)}
                </p>
              )}

              <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
                {doEstagio.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-ink-600">vazio</p>
                )}
                {doEstagio.map((lead) => (
                  <article
                    key={lead.id}
                    draggable
                    onDragStart={() => setArrastando(lead.id)}
                    onDragEnd={() => { setArrastando(null); setSobre(null); }}
                    className={cn(
                      "group cursor-grab rounded-lg border border-[var(--linha)] bg-ink-850 p-2.5 transition active:cursor-grabbing",
                      "hover:border-brand-500/30 hover:bg-ink-800",
                      arrastando === lead.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">
                        {iniciais(lead.cliente?.nome)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink-100">
                          {lead.cliente?.nome ?? "Sem nome"}
                        </p>
                        <p className="truncate text-[10px] text-ink-500">
                          {(lead.numero_atendimento ?? 1) > 1
                            ? `${lead.numero_atendimento}º atendimento`
                            : lead.origem ?? "primeiro contato"}
                        </p>
                      </div>
                      <GripVertical className="size-3 shrink-0 text-ink-600 opacity-0 transition group-hover:opacity-100" />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-[10px] text-ink-500">
                        {lead.canal === "instagram"
                          ? <AtSign className="size-2.5" style={{ color: "#E1306C" }} />
                          : <MessageCircle className="size-2.5" style={{ color: "#25D366" }} />}
                        {tempoRelativo(lead.created_at)}
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums text-ok-400">
                        {brl(lead.valor_estimado)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1">
                      <Seletor
                        valor={lead.stage_id}
                        opcoes={etapas.map((e) => ({
                          valor: e.stage_id,
                          rotulo: e.tipo === "ganho" ? `${e.nome} (fecha)` : e.nome,
                          cor: e.cor,
                          detalhe: e.tipo === "ganho"
                            ? "sai do funil"
                            : e.tipo === "perdido" ? "encerra sem venda" : undefined,
                        }))}
                        aoMudar={(destino) => mover(lead.id, destino)}
                        className="h-7 min-w-0 flex-1 !bg-ink-900 text-[11px]"
                        buscavel={false}
                      />
                      {lead.conversation_id && (
                        <Link
                          href={`/chats?c=${lead.conversation_id}`}
                          title="Abrir conversa"
                          aria-label="Abrir conversa"
                          className="grid size-7 shrink-0 place-items-center rounded-md bg-ink-900 text-ink-500 ring-1 ring-inset ring-[var(--linha)] transition-colors hover:bg-brand-500/15 hover:text-brand-200"
                        >
                          <MessageCircle className="size-3.5" />
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {abertos.length === 0 && (
        <Panel>
          <Vazio
            icone={Search}
            titulo="Nenhum atendimento em aberto"
            descricao="Cada conversa nova abre um atendimento aqui. Quando a venda fecha, ele sai do funil e passa para o histórico do cliente."
          />
        </Panel>
      )}
    </div>
  );
}
