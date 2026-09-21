"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Bot, Check, Clock, ListChecks, Pencil, Plus, Settings2, User, Search, RotateCcw,
} from "lucide-react";
import { concluirTarefa, salvarTarefa } from "@/lib/actions-mvp2";
import { Badge, Button, Input, Panel, PanelHeader, Select, Vazio } from "@/components/ui";
import { Campo, Modal, Textarea } from "@/components/ui/modal";
import { PRIORIDADE } from "@/lib/labels";
import { cn, dataHora, tempoRelativo } from "@/lib/utils";
import type { Tarefa } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const ORIGEM = {
  bot: { rotulo: "Criada pelo bot", icone: Bot },
  sistema: { rotulo: "Automática", icone: Settings2 },
  usuario: { rotulo: "Manual", icone: User },
  operador: { rotulo: "Manual", icone: User },
  webhook: { rotulo: "Integração", icone: Settings2 },
  cliente: { rotulo: "Cliente", icone: User },
} as const;

export function TelaTarefas({
  tarefas: iniciais, agora,
}: { tarefas: Tarefa[]; agora: number }) {
  const [tarefas, setTarefas] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("abertas");
  const [editando, setEditando] = useState<Partial<Tarefa> | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return tarefas.filter((x) => {
      if (filtro === "abertas" && x.status === "concluida") return false;
      if (filtro === "concluidas" && x.status !== "concluida") return false;
      if (filtro === "urgentes" && x.prioridade !== "urgente" && x.prioridade !== "alta") return false;
      if (!t) return true;
      return [x.titulo, x.descricao].some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [tarefas, busca, filtro]);

  function alternar(t: Tarefa) {
    const concluida = t.status !== "concluida";
    setTarefas((l) => l.map((x) => (x.id === t.id
      ? { ...x, status: concluida ? "concluida" : "aberta" } : x)));
    iniciar(async () => {
      const r = await concluirTarefa(t.id, concluida);
      if (r.ok) toast.ok(concluida ? "Tarefa concluída" : "Tarefa reaberta", t.titulo);
      else {
        setTarefas(iniciais);
        toast.erro("Não consegui atualizar a tarefa", r.erro);
      }
    });
  }

  function salvar(dados: Partial<Tarefa>) {
    if (!dados.titulo?.trim()) return;
    setTarefas((l) => dados.id
      ? l.map((x) => (x.id === dados.id ? { ...x, ...dados } as Tarefa : x))
      : [{
          ...dados, id: `tmp-${Date.now()}`, status: "aberta",
          criada_por: "usuario", created_at: new Date().toISOString(),
        } as Tarefa, ...l]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarTarefa(dados);
      if (r.ok) toast.ok(dados.id ? "Tarefa atualizada" : "Tarefa criada", dados.titulo);
      else toast.erro("Não consegui salvar a tarefa", r.erro);
    });
  }

  const abertas = tarefas.filter((t) => t.status !== "concluida" && t.status !== "cancelada");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { r: "Abertas", v: abertas.length, t: "warn" as const },
          { r: "Urgentes", v: abertas.filter((t) => ["urgente", "alta"].includes(t.prioridade)).length, t: "bad" as const },
          { r: "Criadas pelo bot", v: tarefas.filter((t) => t.criada_por === "bot").length, t: "brand" as const },
          { r: "Concluídas", v: tarefas.filter((t) => t.status === "concluida").length, t: "ok" as const },
        ].map((c) => (
          <Panel key={c.r} className="p-4">
            <p className="text-[10px] uppercase tracking-wide text-ink-500">{c.r}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums", {
              warn: "text-warn-400", bad: "text-bad-400",
              brand: "text-brand-300", ok: "text-ok-400",
            }[c.t])}>{c.v}</p>
          </Panel>
        ))}
      </div>

      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tarefa…"
            className="h-9 w-full rounded-lg bg-white/4 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="abertas">Em aberto</option>
          <option value="urgentes">Urgentes</option>
          <option value="concluidas">Concluídas</option>
          <option value="todas">Todas</option>
        </Select>
        <Button variante="primario" onClick={() => setEditando({
          titulo: "", prioridade: "media",
          vencimento: new Date(Date.now() + 864e5).toISOString().slice(0, 16),
        })}>
          <Plus className="size-3.5" /> Nova tarefa
        </Button>
      </Panel>

      <Panel>
        <PanelHeader titulo="Tarefas" icone={ListChecks}
          descricao="O bot abre tarefa sempre que não consegue resolver sozinho" />
        {filtradas.length === 0 ? (
          <Vazio icone={ListChecks} titulo="Nenhuma tarefa"
            descricao="Tudo em dia por aqui."
            acao={<Button variante="primario" tamanho="sm" onClick={() => setEditando({
              titulo: "", prioridade: "media",
            })}>
              <Plus className="size-3.5" /> Criar tarefa
            </Button>} />
        ) : (
          <ul className="divide-y divide-white/4">
            {filtradas.map((t) => {
              const origem = ORIGEM[t.criada_por as keyof typeof ORIGEM] ?? ORIGEM.sistema;
              const concluida = t.status === "concluida";
              const atrasada = !concluida && t.vencimento && +new Date(t.vencimento) < agora;

              return (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-white/3">
                  <button
                    onClick={() => alternar(t)}
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ring-1 transition",
                      concluida
                        ? "bg-ok-500/20 text-ok-400 ring-ok-500/30"
                        : "bg-white/4 text-transparent ring-white/15 hover:ring-brand-400/50",
                    )}
                  >
                    <Check className="size-3" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-sm font-medium",
                      concluida ? "text-ink-500 line-through" : "text-ink-100",
                    )}>
                      {t.titulo}
                    </p>
                    {t.descricao && (
                      <p className="mt-0.5 truncate text-[11px] text-ink-500">{t.descricao}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tom={PRIORIDADE[t.prioridade]}>{t.prioridade}</Badge>
                      <Badge tom="neutro">
                        <origem.icone className="size-2.5" /> {origem.rotulo}
                      </Badge>
                      {t.vencimento && (
                        <span className={cn(
                          "flex items-center gap-1 text-[10px] tabular-nums",
                          atrasada ? "text-bad-400" : "text-ink-500",
                        )}>
                          <Clock className="size-2.5" />
                          {atrasada ? "atrasada · " : "vence "}{dataHora(t.vencimento)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[10px] text-ink-500">{tempoRelativo(t.created_at)}</span>
                    <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(t)}
                      aria-label={`Editar ${t.titulo}`} title="Editar tarefa">
                      <Pencil className="size-3.5" />
                    </Button>
                    {concluida && (
                      <Button tamanho="iconeSm" variante="fantasma" title="Reabrir"
                        onClick={() => alternar(t)}>
                        <RotateCcw className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? "Editar tarefa" : "Nova tarefa"}
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
                placeholder="Conferir reposição com o fornecedor" />
            </Campo>
            <Campo rotulo="Descrição">
              <Textarea rows={3} value={editando.descricao ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p!, descricao: e.target.value }))} />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Prioridade">
                <Select value={editando.prioridade ?? "media"} className="w-full"
                  onChange={(e) => setEditando((p) => ({
                    ...p!, prioridade: e.target.value as Tarefa["prioridade"],
                  }))}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </Select>
              </Campo>
              <Campo rotulo="Vencimento">
                <Input type="datetime-local"
                  value={(editando.vencimento ?? "").slice(0, 16)}
                  onChange={(e) => setEditando((p) => ({
                    ...p!, vencimento: e.target.value || null,
                  }))} />
              </Campo>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
