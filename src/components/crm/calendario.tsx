"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Trash2,
} from "lucide-react";
import { excluirEvento, salvarEvento } from "@/lib/actions-mvp2";
import { Badge, Button, Input, Panel, PanelHeader, Select, Vazio } from "@/components/ui";
import { Campo, Confirmar, Modal, Textarea } from "@/components/ui/modal";
import { cn, hora } from "@/lib/utils";
import type { EventoCalendario } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CORES = ["#9563ff", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#f5c451"];

const RECORRENCIAS: Array<[string, string]> = [
  ["none", "Não repete"],
  ["diaria", "Diária"],
  ["semanal", "Semanal"],
  ["quinzenal", "Quinzenal"],
  ["mensal", "Mensal"],
];

/** Um evento recorrente "acontece" em determinado dia? */
function ocorreEm(evento: EventoCalendario, data: Date) {
  const inicio = new Date(evento.inicio);
  const mesmoDia = inicio.toDateString() === data.toDateString();

  switch (evento.recorrencia) {
    case "diaria": return data >= new Date(inicio.toDateString());
    case "semanal": return data.getDay() === inicio.getDay() && data >= new Date(inicio.toDateString());
    case "quinzenal": return (data.getDate() === 1 || data.getDate() === 15);
    case "mensal": return data.getDate() === inicio.getDate();
    default: return mesmoDia;
  }
}

export function TelaCalendario({ eventos: iniciais }: { eventos: EventoCalendario[] }) {
  const [eventos, setEventos] = useState(iniciais);
  const [offset, setOffset] = useState(0);
  const [editando, setEditando] = useState<Partial<EventoCalendario> | null>(null);
  const [excluindo, setExcluindo] = useState<EventoCalendario | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
  const totalDias = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const primeiroDiaSemana = base.getDay();

  const ativos = useMemo(() => eventos.filter((e) => e.status === "ativo"), [eventos]);

  function salvar(dados: Partial<EventoCalendario>) {
    if (!dados.titulo?.trim() || !dados.inicio) return;
    setEventos((l) => dados.id
      ? l.map((e) => (e.id === dados.id ? { ...e, ...dados } as EventoCalendario : e))
      : [...l, {
          ...dados, id: `tmp-${Date.now()}`, status: "ativo",
          tipo: dados.tipo ?? "rotina", cor: dados.cor ?? CORES[0],
        } as EventoCalendario]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarEvento(dados);
      if (r.ok) toast.ok(dados.id ? "Rotina atualizada" : "Rotina criada", dados.titulo);
      else toast.erro("Não consegui salvar a rotina", r.erro);
    });
  }

  function remover(e: EventoCalendario) {
    setEventos((l) => l.filter((x) => x.id !== e.id));
    setExcluindo(null);
    iniciar(async () => {
      const r = await excluirEvento(e.id);
      if (r.ok) toast.ok("Rotina excluída", e.titulo);
      else toast.erro("Não consegui excluir", r.erro);
    });
  }

  const doDia = diaSelecionado
    ? ativos.filter((e) => ocorreEm(e, diaSelecionado))
    : [];

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_330px]">
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-500/12 text-brand-300">
              <CalendarDays className="size-4" />
            </span>
            <h2 className="text-sm font-semibold capitalize text-ink-100">
              {base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button tamanho="iconeSm" variante="fantasma" onClick={() => setOffset((o) => o - 1)}
              aria-label="Mês anterior" title="Mês anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <Button tamanho="sm" variante="fantasma" onClick={() => setOffset(0)}>Hoje</Button>
            <Button tamanho="iconeSm" variante="fantasma" onClick={() => setOffset((o) => o + 1)}
              aria-label="Próximo mês" title="Próximo mês">
              <ChevronRight className="size-4" />
            </Button>
            <Button variante="primario" tamanho="sm" className="ml-2"
              onClick={() => setEditando({
                titulo: "", tipo: "rotina", recorrencia: "semanal", cor: CORES[0],
                inicio: new Date().toISOString().slice(0, 16),
              })}>
              <Plus className="size-3.5" /> Nova rotina
            </Button>
          </div>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1">
            {DIAS.map((d) => (
              <div key={d} className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                {d}
              </div>
            ))}

            {Array.from({ length: primeiroDiaSemana }).map((_, i) => <div key={`v-${i}`} />)}

            {Array.from({ length: totalDias }).map((_, i) => {
              const dia = i + 1;
              const data = new Date(base.getFullYear(), base.getMonth(), dia);
              const ehHoje = data.toDateString() === hoje.toDateString();
              const selecionado = diaSelecionado?.toDateString() === data.toDateString();
              const doDiaAtual = ativos.filter((e) => ocorreEm(e, data));

              return (
                <button
                  key={dia}
                  onClick={() => setDiaSelecionado(data)}
                  className={cn(
                    "min-h-[84px] rounded-lg border p-1.5 text-left transition",
                    selecionado
                      ? "border-brand-400/60 bg-brand-500/14"
                      : ehHoje
                        ? "border-brand-400/40 bg-brand-500/8"
                        : "border-white/5 bg-white/[0.015] hover:border-white/12 hover:bg-white/4",
                  )}
                >
                  <span className={cn(
                    "text-[11px] font-semibold tabular-nums",
                    ehHoje ? "text-brand-200" : "text-ink-400",
                  )}>
                    {dia}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {doDiaAtual.slice(0, 3).map((e) => (
                      <p key={e.id}
                        className="truncate rounded px-1 py-px text-[9px] font-medium"
                        style={{ background: `${e.cor}22`, color: e.cor }}>
                        {hora(e.inicio)} {e.titulo}
                      </p>
                    ))}
                    {doDiaAtual.length > 3 && (
                      <p className="px-1 text-[9px] text-ink-500">+{doDiaAtual.length - 3}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="space-y-3">
        {diaSelecionado && (
          <Panel>
            <PanelHeader
              titulo={diaSelecionado.toLocaleDateString("pt-BR", {
                weekday: "long", day: "2-digit", month: "long",
              })}
              icone={CalendarDays}
              descricao={`${doDia.length} atividade${doDia.length === 1 ? "" : "s"}`}
              acao={
                <Button tamanho="iconeSm" variante="fantasma" onClick={() => setDiaSelecionado(null)}
                  aria-label="Fechar detalhe do dia" title="Fechar">
                  <ChevronRight className="size-3.5" />
                </Button>
              }
            />
            {doDia.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-ink-500">Nada agendado</p>
            ) : (
              <ul className="divide-y divide-white/4">
                {doDia.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: e.cor }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink-200">{e.titulo}</p>
                      <p className="text-[11px] tabular-nums text-ink-500">
                        {hora(e.inicio)}{e.fim ? ` – ${hora(e.fim)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel>
          <PanelHeader titulo="Rotinas cadastradas" icone={Repeat}
            descricao="Atividades recorrentes da operação" />
          {ativos.length === 0 ? (
            <Vazio icone={Repeat} titulo="Nenhuma rotina"
              descricao="Cadastre conferência de estoque, fechamento de caixa e compras." />
          ) : (
            <ul className="divide-y divide-white/4">
              {ativos.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.cor }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink-200">{e.titulo}</p>
                    <p className="text-[11px] tabular-nums text-ink-500">
                      {hora(e.inicio)}
                      {e.responsavel ? ` · ${e.responsavel}` : ""}
                    </p>
                  </div>
                  <Badge tom="neutro">
                    {RECORRENCIAS.find(([k]) => k === e.recorrencia)?.[1] ?? "único"}
                  </Badge>
                  <div className="flex shrink-0 gap-1">
                    <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(e)}
                      aria-label={`Editar ${e.titulo}`} title="Editar rotina">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button tamanho="iconeSm" variante="fantasma" onClick={() => setExcluindo(e)}
                      aria-label={`Excluir ${e.titulo}`} title="Excluir rotina">
                      <Trash2 className="size-3.5 text-bad-400" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? "Editar rotina" : "Nova rotina"}
          rodape={
            <>
              <Button variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variante="primario" disabled={!editando.titulo?.trim()}
                onClick={() => salvar(editando)}>
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Campo rotulo="Título">
              <Input value={editando.titulo ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p!, titulo: e.target.value }))}
                placeholder="Conferência de estoque" />
            </Campo>
            <Campo rotulo="Descrição">
              <Textarea rows={2} value={editando.descricao ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p!, descricao: e.target.value }))} />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início">
                <Input type="datetime-local" value={(editando.inicio ?? "").slice(0, 16)}
                  onChange={(e) => setEditando((p) => ({ ...p!, inicio: e.target.value }))} />
              </Campo>
              <Campo rotulo="Fim">
                <Input type="datetime-local" value={(editando.fim ?? "").slice(0, 16)}
                  onChange={(e) => setEditando((p) => ({ ...p!, fim: e.target.value || null }))} />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Repetição">
                <Select value={editando.recorrencia ?? "none"} className="w-full"
                  onChange={(e) => setEditando((p) => ({ ...p!, recorrencia: e.target.value }))}>
                  {RECORRENCIAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Campo>
              <Campo rotulo="Responsável">
                <Input value={editando.responsavel ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p!, responsavel: e.target.value }))}
                  placeholder="Operacional" />
              </Campo>
            </div>
            <Campo rotulo="Cor">
              <div className="flex flex-wrap gap-2">
                {CORES.map((cor) => (
                  <button key={cor}
                    onClick={() => setEditando((p) => ({ ...p!, cor }))}
                    className={cn(
                      "size-7 rounded-lg transition",
                      editando.cor === cor
                        ? "ring-2 ring-white/70 ring-offset-2 ring-offset-ink-900"
                        : "hover:scale-110",
                    )}
                    style={{ background: cor }} />
                ))}
              </div>
            </Campo>
          </div>
        </Modal>
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Excluir "${excluindo?.titulo}"?`}
        mensagem="A rotina deixa de aparecer no calendário."
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}
