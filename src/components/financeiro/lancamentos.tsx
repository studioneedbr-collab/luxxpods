"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Check, Plus, RotateCcw,
  Search, Trash2, Pencil, CalendarClock,
} from "lucide-react";
import { baixarLancamento, excluirLancamento, salvarLancamento } from "@/lib/actions-mvp2";
import {
  Badge, Button, Input, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio,
} from "@/components/ui";
import { Campo, Confirmar, Modal, Textarea } from "@/components/ui/modal";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { METODO_PAGAMENTO } from "@/lib/labels";
import { brl, cn, num } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { BotaoExportar } from "@/components/ui/botao-exportar";
import { dataCurtaExport } from "@/lib/exportar";
import { CampoData, CampoMoeda } from "@/components/ui";
import { useListaServidor } from "@/lib/usar-lista-servidor";
import type {
  CategoriaFinanceira, ContaBancaria, Lancamento, PagamentoMetodo,
} from "@/lib/types";

const STATUS_TOM = {
  pago: "ok", pendente: "warn", atrasado: "bad", cancelado: "neutro",
} as const;

export function TelaLancamentos({
  tipo, lancamentos: iniciais, categorias, contas, hoje,
}: {
  tipo: "receber" | "pagar";
  lancamentos: Lancamento[];
  categorias: CategoriaFinanceira[];
  contas: ContaBancaria[];
  /** data de referência do servidor, para marcar vencidos sem divergir na hidratação */
  hoje: string;
}) {
  const [lancamentos, setLancamentos] = useListaServidor(iniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [editando, setEditando] = useState<Partial<Lancamento> | null>(null);
  const [excluindo, setExcluindo] = useState<Lancamento | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const receber = tipo === "receber";

  const comAtraso = useMemo(() => lancamentos.map((l) => ({
    ...l,
    status: l.status === "pendente" && l.vencimento && l.vencimento < hoje
      ? ("atrasado" as const) : l.status,
  })), [lancamentos, hoje]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return comAtraso.filter((l) => {
      if (filtro === "abertos" && l.status === "pago") return false;
      if (filtro !== "todos" && filtro !== "abertos" && l.status !== filtro) return false;
      if (!t) return true;
      return [l.descricao, l.contraparte, l.categoria_nome, l.numero_pedido]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    }).sort((a, b) => (b.vencimento ?? "").localeCompare(a.vencimento ?? ""));
  }, [comAtraso, busca, filtro]);

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 25);

  const totais = {
    total: filtrados.reduce((a, l) => a + l.valor, 0),
    pago: filtrados.filter((l) => l.status === "pago").reduce((a, l) => a + l.valor, 0),
    pendente: filtrados.filter((l) => l.status === "pendente").reduce((a, l) => a + l.valor, 0),
    atrasado: filtrados.filter((l) => l.status === "atrasado").reduce((a, l) => a + l.valor, 0),
  };

  function baixar(l: Lancamento, pago: boolean) {
    setLancamentos((lista) => lista.map((x) => (x.id === l.id
      ? { ...x, status: pago ? "pago" : "pendente", pagamento: pago ? hoje : null }
      : x)));
    iniciar(async () => {
      const r = await baixarLancamento(l.id, tipo, pago);
      if (r.ok) {
        toast.ok(
          pago ? (receber ? "Recebimento confirmado" : "Pagamento confirmado") : "Baixa estornada",
          `${l.descricao} · ${brl(l.valor)}`,
        );
      } else {
        toast.erro("Não consegui dar baixa", r.erro);
      }
    });
  }

  function salvar(dados: Partial<Lancamento>) {
    if (!dados.descricao?.trim()) return;
    const pronto = {
      ...dados,
      tipo,
      categoria_nome: categorias.find((c) => c.id === dados.categoria_id)?.nome ?? null,
      conta_nome: contas.find((c) => c.id === dados.bank_account_id)?.nome ?? null,
    };
    setLancamentos((l) => dados.id
      ? l.map((x) => (x.id === dados.id ? { ...x, ...pronto } as Lancamento : x))
      : [{
          ...pronto, id: `tmp-${Date.now()}`, status: pronto.status ?? "pendente",
          created_at: new Date().toISOString(),
        } as Lancamento, ...l]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarLancamento(pronto);
      if (r.ok) toast.ok(dados.id ? "Lançamento atualizado" : "Lançamento criado", dados.descricao);
      else toast.erro("Não consegui salvar", r.erro);
    });
  }

  function remover(l: Lancamento) {
    setLancamentos((lista) => lista.filter((x) => x.id !== l.id));
    setExcluindo(null);
    iniciar(async () => {
      const r = await excluirLancamento(l.id, tipo);
      if (r.ok) toast.ok("Lançamento excluído", l.descricao);
      else toast.erro("Não consegui excluir", r.erro);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo={receber ? "Total a receber" : "Total a pagar"} valor={brl(totais.total)} />
        <Cartao rotulo={receber ? "Recebido" : "Pago"} valor={brl(totais.pago)} tom="ok" />
        <Cartao rotulo="Em aberto" valor={brl(totais.pendente)} tom="warn" />
        <Cartao rotulo="Vencido" valor={brl(totais.atrasado)} tom={totais.atrasado > 0 ? "bad" : "neutro"} />
      </div>

      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={receber ? "Buscar por cliente, pedido ou descrição…" : "Buscar por fornecedor, categoria ou descrição…"}
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="abertos">Em aberto</option>
          <option value="pendente">Pendentes</option>
          <option value="atrasado">Vencidos</option>
          <option value="pago">{receber ? "Recebidos" : "Pagos"}</option>
        </Select>
        <BotaoExportar
          itens={filtrados}
          nomeArquivo={receber ? "contas-a-receber" : "contas-a-pagar"}
          colunas={[
            { cabecalho: "Descrição", valor: (l) => l.descricao },
            { cabecalho: receber ? "Cliente" : "Fornecedor", valor: (l) => l.contraparte },
            { cabecalho: "Categoria", valor: (l) => l.categoria_nome },
            { cabecalho: "Pedido", valor: (l) => l.numero_pedido },
            { cabecalho: "Valor", valor: (l) => l.valor },
            { cabecalho: "Vencimento", valor: (l) => dataCurtaExport(l.vencimento) },
            { cabecalho: "Pagamento", valor: (l) => dataCurtaExport(l.pagamento) },
            { cabecalho: "Conta", valor: (l) => l.conta_nome },
            { cabecalho: "Forma", valor: (l) => l.forma_pagamento },
            { cabecalho: "Status", valor: (l) => l.status },
          ]}
        />
        <Button variante="primario" onClick={() => setEditando({
          tipo, status: "pendente", vencimento: hoje,
          categoria_id: categorias.find((c) => c.tipo === (receber ? "receita" : "despesa"))?.id ?? null,
          bank_account_id: contas[0]?.id ?? null,
        })}>
          <Plus className="size-3.5" /> {receber ? "Novo recebimento" : "Nova despesa"}
        </Button>
      </Panel>

      {totais.atrasado > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-bad-500/25 bg-bad-500/8 px-4 py-2.5">
          <AlertTriangle className="size-4 shrink-0 text-bad-400" />
          <p className="text-[11px] text-bad-300">
            <strong>{brl(totais.atrasado)}</strong>{" "}
            {receber ? "vencidos e ainda não recebidos" : "vencidos e ainda não pagos"}
            {" — "}
            {num(filtrados.filter((l) => l.status === "atrasado").length)} lançamentos.
          </p>
        </div>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          titulo={receber ? "Contas a receber" : "Contas a pagar"}
          icone={receber ? ArrowDownCircle : ArrowUpCircle}
          descricao={receber
            ? "Toda venda confirmada gera o lançamento automaticamente"
            : "Fornecedores, motoboy, aluguel e custos fixos"}
        />
        {filtrados.length === 0 ? (
          <Vazio
            icone={receber ? ArrowDownCircle : ArrowUpCircle}
            titulo="Nenhum lançamento"
            descricao="Ajuste os filtros ou crie um novo lançamento."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Descrição</Th>
                <Th>{receber ? "Cliente" : "Fornecedor"}</Th>
                <Th>Categoria</Th>
                <Th>Vencimento</Th>
                <Th>Conta</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    {l.order_id ? (
                      <Link href={`/pedidos/${l.order_id}`} className="font-medium text-brand-300 hover:text-brand-200">
                        {l.descricao}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-100">{l.descricao}</span>
                    )}
                  </Td>
                  <Td className="truncate text-ink-300">{l.contraparte ?? "—"}</Td>
                  <Td>
                    {l.categoria_nome
                      ? <Badge tom="neutro">{l.categoria_nome}</Badge>
                      : <span className="text-ink-600">—</span>}
                  </Td>
                  <Td className={cn(
                    "whitespace-nowrap tabular-nums",
                    l.status === "atrasado" ? "font-medium text-bad-400" : "text-ink-400",
                  )}>
                    {l.vencimento
                      ? new Date(`${l.vencimento}T12:00:00`).toLocaleDateString("pt-BR")
                      : "—"}
                  </Td>
                  <Td className="text-[11px] text-ink-500">{l.conta_nome ?? "—"}</Td>
                  <Td className="text-center">
                    <Badge tom={STATUS_TOM[l.status]} ponto>
                      {l.status === "pago" ? (receber ? "recebido" : "pago") : l.status}
                    </Badge>
                  </Td>
                  <Td className={cn(
                    "text-right font-semibold tabular-nums",
                    l.status === "pago" ? "text-ok-400"
                      : l.status === "atrasado" ? "text-bad-400" : "text-ink-100",
                  )}>
                    {brl(l.valor)}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {l.status === "pago" ? (
                        <Button tamanho="iconeSm" variante="fantasma" title="Estornar baixa"
                          onClick={() => baixar(l, false)}>
                          <RotateCcw className="size-3.5" />
                        </Button>
                      ) : (
                        <Button tamanho="sm" variante="ok" onClick={() => baixar(l, true)}>
                          <Check className="size-3.5" /> {receber ? "Recebi" : "Paguei"}
                        </Button>
                      )}
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(l)}
                        aria-label={`Editar ${l.descricao}`} title="Editar lançamento">
                        <Pencil className="size-3.5" />
                      </Button>
                      {!l.order_id && (
                        <Button tamanho="iconeSm" variante="fantasma" onClick={() => setExcluindo(l)}
                          aria-label={`Excluir ${l.descricao}`} title="Excluir lançamento">
                          <Trash2 className="size-3.5 text-bad-400" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="lançamentos" />
      </Panel>

      {editando && (
        <FormLancamento
          lancamento={editando}
          tipo={tipo}
          categorias={categorias.filter(
            (c) => c.tipo === (receber ? "receita" : "despesa") && c.status === "ativo")}
          contas={contas.filter((c) => c.status === "ativo")}
          onFechar={() => setEditando(null)}
          onSalvar={salvar}
        />
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo="Excluir lançamento?"
        mensagem={`"${excluindo?.descricao}" será removido do financeiro. Esta ação não pode ser desfeita.`}
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}

function FormLancamento({
  lancamento, tipo, categorias, contas, onFechar, onSalvar,
}: {
  lancamento: Partial<Lancamento>;
  tipo: "receber" | "pagar";
  categorias: CategoriaFinanceira[];
  contas: ContaBancaria[];
  onFechar: () => void;
  onSalvar: (d: Partial<Lancamento>) => void;
}) {
  const [f, setF] = useState<Partial<Lancamento>>(lancamento);
  const set = <K extends keyof Lancamento>(k: K, v: Lancamento[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const receber = tipo === "receber";

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={lancamento.id
        ? "Editar lançamento"
        : receber ? "Novo recebimento" : "Nova despesa"}
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" disabled={!f.descricao?.trim()} onClick={() => onSalvar(f)}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Descrição">
          <Input value={f.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)}
            placeholder={receber ? "Venda avulsa" : "Aluguel da loja"} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={receber ? "Cliente" : "Fornecedor"}>
            <Input value={f.contraparte ?? ""} onChange={(e) => set("contraparte", e.target.value)} />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <CampoMoeda valor={f.valor ?? 0} aoMudar={(v) => set("valor", v)} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Categoria">
            <Select value={f.categoria_id ?? ""} className="w-full"
              onChange={(e) => set("categoria_id", e.target.value || null)}>
              <option value="">Sem categoria</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Conta bancária">
            <Select value={f.bank_account_id ?? ""} className="w-full"
              onChange={(e) => set("bank_account_id", e.target.value || null)}>
              <option value="">Sem conta</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Vencimento">
            <CampoData valor={(f.vencimento ?? "").slice(0, 10) || null}
              aoMudar={(v) => set("vencimento", v)} />
          </Campo>
          <Campo rotulo="Forma de pagamento">
            <Select value={f.forma_pagamento ?? ""} className="w-full"
              onChange={(e) => set("forma_pagamento", (e.target.value || null) as PagamentoMetodo | null)}>
              <option value="">Não definida</option>
              {Object.entries(METODO_PAGAMENTO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Campo>
        </div>

        {!receber && (
          <Campo rotulo="Documento">
            <Input value={f.documento ?? ""} onChange={(e) => set("documento", e.target.value)}
              placeholder="NF 10482" />
          </Campo>
        )}

        <Campo rotulo="Observação">
          <Textarea rows={2} value={f.observacao ?? ""}
            onChange={(e) => set("observacao", e.target.value)} />
        </Campo>

        {f.vencimento && (
          <p className="flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-2 text-[11px] text-ink-400">
            <CalendarClock className="size-3.5 shrink-0 text-ink-500" />
            Vence em {new Date(`${f.vencimento}T12:00:00`).toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Cartao({ rotulo, valor, tom = "neutro" }: {
  rotulo: string; valor: string; tom?: "neutro" | "ok" | "warn" | "bad";
}) {
  const cores = {
    neutro: "text-ink-100", ok: "text-ok-400", warn: "text-warn-400", bad: "text-bad-400",
  };
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
      <p className={cn("mt-1 truncate text-[19px] font-bold tabular-nums", cores[tom])}>{valor}</p>
    </Panel>
  );
}
