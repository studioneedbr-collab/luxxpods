"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle, AtSign, GripVertical, Search, ArrowRightLeft } from "lucide-react";
import { moverLead } from "@/lib/actions";
import { Panel, Badge, Vazio } from "@/components/ui";
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
  const [movendo, setMovendo] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return leads;
    return leads.filter((l) =>
      (l.cliente?.nome ?? "").toLowerCase().includes(t) ||
      (l.cliente?.telefone ?? "").includes(t));
  }, [leads, busca]);

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

  const totalAberto = filtrados.filter((l) => l.status === "aberto");

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lead por nome ou telefone…"
            className="h-9 w-full rounded-lg bg-white/4 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>
        <Badge tom="brand">{totalAberto.length} leads abertos</Badge>
        <Badge tom="ok">
          {brl(totalAberto.reduce((a, l) => a + l.valor_estimado, 0))} em negociação
        </Badge>
        <span className="text-[11px] text-ink-500">
          <span className="hidden lg:inline">Arraste os cartões ou use </span>
          <span className="lg:hidden">Toque em </span>
          <ArrowRightLeft className="mx-0.5 inline size-3 align-[-2px]" />
          <span> para mover entre etapas</span>
        </span>
      </Panel>

      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
        {etapas.map((etapa) => {
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
                  : "border-white/6 bg-white/[0.02]",
              )}
            >
              <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: etapa.cor }} />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-200">{etapa.nome}</p>
                <span className="rounded-full bg-white/8 px-1.5 text-[10px] font-bold tabular-nums text-ink-300">
                  {doEstagio.length}
                </span>
              </div>

              {valor > 0 && (
                <p className="border-b border-white/4 px-3 py-1 text-[10px] tabular-nums text-ink-500">
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
                      "group cursor-grab rounded-lg border border-white/6 bg-ink-850/80 p-2.5 transition active:cursor-grabbing",
                      "hover:border-brand-500/30 hover:bg-ink-800",
                      arrastando === lead.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/8 text-[10px] font-bold text-ink-300">
                        {iniciais(lead.cliente?.nome)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink-100">
                          {lead.cliente?.nome ?? "Sem nome"}
                        </p>
                        <p className="truncate text-[10px] text-ink-500">{lead.origem ?? "—"}</p>
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

                    <div className="mt-2 flex gap-1">
                      {lead.conversation_id && (
                        <Link
                          href={`/chats?c=${lead.conversation_id}`}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/5 py-1 text-[10px] font-medium text-ink-400 transition hover:bg-brand-500/15 hover:text-brand-200"
                        >
                          <MessageCircle className="size-2.5" /> conversa
                        </Link>
                      )}
                      <button
                        onClick={() => setMovendo(movendo === lead.id ? null : lead.id)}
                        title="Mover para outra etapa"
                        aria-label="Mover para outra etapa"
                        className="flex items-center justify-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-ink-400 transition hover:bg-brand-500/15 hover:text-brand-200"
                      >
                        <ArrowRightLeft className="size-2.5" />
                        <span className="lg:hidden">mover</span>
                      </button>
                    </div>

                    {movendo === lead.id && (
                      <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md bg-ink-950/80 p-1 ring-1 ring-inset ring-white/10">
                        {etapas
                          .filter((destino) => destino.stage_id !== lead.stage_id)
                          .map((destino) => (
                            <button
                              key={destino.stage_id}
                              onClick={() => { mover(lead.id, destino.stage_id); setMovendo(null); }}
                              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-ink-300 transition hover:bg-white/8 hover:text-ink-100"
                            >
                              <span className="size-1.5 shrink-0 rounded-full"
                                style={{ background: destino.cor }} />
                              <span className="truncate">{destino.nome}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {leads.length === 0 && (
        <Panel><Vazio icone={Search} titulo="Nenhum lead" descricao="Os leads são criados automaticamente na primeira mensagem do cliente." /></Panel>
      )}
    </div>
  );
}
