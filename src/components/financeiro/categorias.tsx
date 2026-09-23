"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { excluirCategoria, salvarCategoria } from "@/lib/actions-mvp2";
import { Badge, Button, Input, Panel, PanelHeader, Select, Vazio } from "@/components/ui";
import { Campo, Confirmar, Modal, Switch } from "@/components/ui/modal";
import { brl, cn, num } from "@/lib/utils";
import type { CategoriaFinanceira } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const CORES = ["#9563ff", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#f5c451", "#22d3ee", "#c084fc", "#9a9ab5"];

export function TelaCategorias({ categorias: iniciais }: { categorias: CategoriaFinanceira[] }) {
  const [categorias, setCategorias] = useState(iniciais);
  const [editando, setEditando] = useState<Partial<CategoriaFinanceira> | null>(null);
  const [excluindo, setExcluindo] = useState<CategoriaFinanceira | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  function salvar(dados: Partial<CategoriaFinanceira>) {
    if (!dados.nome?.trim()) return;
    setCategorias((l) => dados.id
      ? l.map((c) => (c.id === dados.id ? { ...c, ...dados } as CategoriaFinanceira : c))
      : [...l, {
          ...dados, id: `tmp-${Date.now()}`, lancamentos: 0, total: 0,
          status: dados.status ?? "ativo",
        } as CategoriaFinanceira]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarCategoria(dados);
      if (r.ok) toast.ok(dados.id ? "Categoria atualizada" : "Categoria criada", dados.nome);
      else toast.erro("Não consegui salvar a categoria", r.erro);
    });
  }

  function remover(c: CategoriaFinanceira) {
    setCategorias((l) => l.filter((x) => x.id !== c.id));
    setExcluindo(null);
    iniciar(async () => {
      const r = await excluirCategoria(c.id);
      if (r.ok) toast.ok("Categoria excluída", c.nome);
      else toast.erro("Não consegui excluir", r.erro);
    });
  }

  const receitas = categorias.filter((c) => c.tipo === "receita");
  const despesas = categorias.filter((c) => c.tipo === "despesa");

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="text-xs text-ink-400">
          Usadas para classificar entradas e saídas nos relatórios financeiros.
        </p>
        <Button variante="primario" onClick={() => setEditando({
          nome: "", tipo: "despesa", cor: CORES[0], status: "ativo",
        })}>
          <Plus className="size-3.5" /> Nova categoria
        </Button>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        {[
          { titulo: "Receitas", lista: receitas, tom: "ok" as const },
          { titulo: "Despesas", lista: despesas, tom: "bad" as const },
        ].map((grupo) => (
          <Panel key={grupo.titulo}>
            <PanelHeader titulo={grupo.titulo} icone={Tags}
              descricao={`${grupo.lista.length} categorias`}
              acao={
                <Badge tom={grupo.tom}>
                  {brl(grupo.lista.reduce((a, c) => a + c.total, 0))}
                </Badge>
              } />
            {grupo.lista.length === 0 ? (
              <Vazio icone={Tags} titulo="Nenhuma categoria" />
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {grupo.lista.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-ink-850/50">
                    <span className="size-2.5 shrink-0 rounded-full"
                      style={{ background: c.cor ?? "#9563ff" }} />
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "truncate text-sm",
                        c.status === "ativo" ? "text-ink-100" : "text-ink-500 line-through",
                      )}>
                        {c.nome}
                      </p>
                      {c.lancamentos > 0 && (
                        <p className="text-[11px] tabular-nums text-ink-500">
                          {num(c.lancamentos)} lançamentos · {brl(c.total)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(c)}
                          aria-label={`Editar ${c.nome}`} title="Editar categoria">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button tamanho="iconeSm" variante="fantasma"
                        disabled={c.lancamentos > 0}
                        title={c.lancamentos > 0 ? "Categoria em uso" : "Excluir"}
                        onClick={() => setExcluindo(c)}>
                        <Trash2 className="size-3.5 text-bad-400" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))}
      </div>

      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? "Editar categoria" : "Nova categoria"}
          largura="sm"
          rodape={
            <>
              <Button variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variante="primario" disabled={!editando.nome?.trim()}
                onClick={() => salvar(editando)}>
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Campo rotulo="Nome">
              <Input value={editando.nome ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p!, nome: e.target.value }))}
                placeholder="Motoboy" />
            </Campo>
            <Campo rotulo="Tipo">
              <Select value={editando.tipo ?? "despesa"} className="w-full"
                onChange={(e) => setEditando((p) => ({
                  ...p!, tipo: e.target.value as CategoriaFinanceira["tipo"],
                }))}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </Select>
            </Campo>
            <Campo rotulo="Cor">
              <div className="flex flex-wrap gap-2">
                {CORES.map((cor) => (
                  <button
                    key={cor}
                    onClick={() => setEditando((p) => ({ ...p!, cor }))}
                    className={cn(
                      "size-7 rounded-lg transition",
                      editando.cor === cor
                        ? "ring-2 ring-ink-100 ring-offset-2 ring-offset-ink-850"
                        : "hover:scale-110",
                    )}
                    style={{ background: cor }}
                  />
                ))}
              </div>
            </Campo>
            <Switch
              ligado={editando.status === "ativo"}
              onChange={(v) => setEditando((p) => ({ ...p!, status: v ? "ativo" : "inativo" }))}
              rotulo="Categoria ativa"
            />
          </div>
        </Modal>
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Excluir "${excluindo?.nome}"?`}
        mensagem="A categoria será removida. Lançamentos existentes ficam sem categoria."
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}
