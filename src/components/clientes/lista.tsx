"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  MessageCircle, AtSign, Search, Users, ShieldCheck, Plus, Pencil, Trash2, Check,
} from "lucide-react";
import {
  Badge, Button, CampoMascara, Input, Panel, Select, Table, Td, Th, Tr, Vazio,
} from "@/components/ui";
import { Campo, Confirmar, Modal, Switch, Textarea } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { excluirCliente, salvarCliente } from "@/lib/actions-cadastro";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, iniciais, num, telefone, tempoRelativo } from "@/lib/utils";
import type { Cliente } from "@/lib/types";
import { BotaoExportar } from "@/components/ui/botao-exportar";
import { dataExport } from "@/lib/exportar";
import { useListaServidor } from "@/lib/usar-lista-servidor";

export function ListaClientes({ clientes: doServidor }: { clientes: Cliente[] }) {
  const [clientes, setClientes] = useListaServidor(doServidor);
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null);
  const [excluindo, setExcluindo] = useState<Cliente | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("recentes");
  const [segmento, setSegmento] = useState("todos");

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let lista = clientes.filter((c) => {
      if (segmento === "recorrentes" && c.total_pedidos <= 1) return false;
      if (segmento === "novos" && c.total_pedidos > 0) return false;
      if (segmento === "vip" && !(c.tags ?? []).includes("vip")) return false;
      if (!t) return true;
      return [c.nome, c.telefone, c.instagram_username]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });

    lista = [...lista].sort((a, b) => {
      if (ordem === "valor") return b.total_comprado - a.total_comprado;
      if (ordem === "pedidos") return b.total_pedidos - a.total_pedidos;
      if (ordem === "ticket") return b.ticket_medio - a.ticket_medio;
      return +new Date(b.ultima_interacao ?? 0) - +new Date(a.ultima_interacao ?? 0);
    });
    return lista;
  }, [clientes, busca, ordem, segmento]);

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 25);

  function salvar(dados: Partial<Cliente>) {
    if (!dados.nome?.trim()) return;
    const ehEdicao = Boolean(dados.id);

    setClientes((l) => ehEdicao
      ? l.map((c) => (c.id === dados.id ? { ...c, ...dados } as Cliente : c))
      : [{
          ...dados, id: `tmp-${Date.now()}`, canal_origem: "manual",
          origem: "Cadastro manual", total_pedidos: 0, total_comprado: 0,
          ticket_medio: 0, ultima_compra: null,
          ultima_interacao: new Date().toISOString(),
          created_at: new Date().toISOString(),
        } as Cliente, ...l]);
    setEditando(null);

    iniciar(async () => {
      const r = await salvarCliente({
        id: dados.id,
        nome: dados.nome!,
        telefone: dados.telefone,
        instagram_username: dados.instagram_username,
        maioridade_validada: dados.maioridade_validada,
        tags: dados.tags,
        observacoes: dados.observacoes,
      });
      if (r.ok) toast.ok(ehEdicao ? "Cliente atualizado" : "Cliente cadastrado", dados.nome);
      else {
        setClientes(doServidor);
        toast.erro("Não consegui salvar", r.erro);
      }
    });
  }

  function remover(c: Cliente) {
    setExcluindo(null);
    setClientes((l) => l.filter((x) => x.id !== c.id));
    iniciar(async () => {
      const r = await excluirCliente(c.id);
      if (r.ok) toast.ok("Cliente excluído", c.nome);
      else {
        setClientes(doServidor);
        toast.erro("Não consegui excluir", r.erro);
      }
    });
  }

  const totais = {
    base: filtrados.length,
    faturamento: filtrados.reduce((a, c) => a + c.total_comprado, 0),
    recorrentes: filtrados.filter((c) => c.total_pedidos > 1).length,
  };

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou @instagram…"
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
          <option value="todos">Toda a base</option>
          <option value="recorrentes">Recorrentes</option>
          <option value="novos">Sem compra</option>
          <option value="vip">VIP</option>
        </Select>
        <Select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
          <option value="recentes">Mais recentes</option>
          <option value="valor">Maior valor</option>
          <option value="pedidos">Mais pedidos</option>
          <option value="ticket">Maior ticket</option>
        </Select>
        <Badge tom="brand">{num(totais.base)} clientes</Badge>
        <Badge tom="ok">{brl(totais.faturamento)} no total</Badge>
        <Badge tom="gold">{num(totais.recorrentes)} recorrentes</Badge>
        <Button variante="primario" tamanho="sm" onClick={() => setEditando({
          nome: "", telefone: "", tags: [], maioridade_validada: false,
        })}>
          <Plus className="size-3.5" /> Novo cliente
        </Button>
        <BotaoExportar
          itens={filtrados}
          nomeArquivo="clientes"
          colunas={[
            { cabecalho: "Nome", valor: (c) => c.nome },
            { cabecalho: "Telefone", valor: (c) => c.telefone },
            { cabecalho: "Instagram", valor: (c) => c.instagram_username },
            { cabecalho: "Canal de origem", valor: (c) => c.canal_origem },
            { cabecalho: "Origem", valor: (c) => c.origem },
            { cabecalho: "Maioridade validada", valor: (c) => c.maioridade_validada },
            { cabecalho: "Tags", valor: (c) => (c.tags ?? []).join(", ") },
            { cabecalho: "Pedidos", valor: (c) => c.total_pedidos },
            { cabecalho: "Total comprado", valor: (c) => c.total_comprado },
            { cabecalho: "Ticket médio", valor: (c) => c.ticket_medio },
            { cabecalho: "Última compra", valor: (c) => dataExport(c.ultima_compra) },
            { cabecalho: "Última interação", valor: (c) => dataExport(c.ultima_interacao) },
            { cabecalho: "Cadastrado em", valor: (c) => dataExport(c.created_at) },
          ]}
        />
      </Panel>

      <Panel className="overflow-hidden">
        {filtrados.length === 0 ? (
          <Vazio icone={Users} titulo="Nenhum cliente"
            descricao="Os clientes nascem sozinhos na primeira conversa — ou cadastre um agora."
            acao={
              <Button variante="primario" tamanho="sm" onClick={() => setEditando({ nome: "", tags: [] })}>
                <Plus className="size-3.5" /> Novo cliente
              </Button>
            } />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="text-center">Canal</Th>
                <Th>Telefone</Th>
                <Th className="text-right">Pedidos</Th>
                <Th className="text-right">Total comprado</Th>
                <Th className="text-right">Ticket médio</Th>
                <Th>Última interação</Th>
                <Th>Tags</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">
                        {iniciais(c.nome)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/clientes/${c.id}`}
                          className="flex items-center gap-1.5 truncate font-medium text-ink-100 transition hover:text-brand-300"
                        >
                          {c.nome || "Sem nome"}
                          {c.maioridade_validada && <ShieldCheck className="size-3 shrink-0 text-ok-400" />}
                        </Link>
                        <p className="truncate text-[11px] text-ink-500">{c.origem ?? "—"}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-center">
                    {c.canal_origem === "instagram"
                      ? <AtSign className="mx-auto size-3.5" style={{ color: "#E1306C" }} />
                      : <MessageCircle className="mx-auto size-3.5" style={{ color: "#25D366" }} />}
                  </Td>
                  <Td className="tabular-nums text-ink-300">{telefone(c.telefone)}</Td>
                  <Td className="text-right tabular-nums">{num(c.total_pedidos)}</Td>
                  <Td className={cn(
                    "text-right font-semibold tabular-nums",
                    c.total_comprado > 0 ? "text-ok-400" : "text-ink-600",
                  )}>
                    {brl(c.total_comprado)}
                  </Td>
                  <Td className="text-right tabular-nums text-ink-300">{brl(c.ticket_medio)}</Td>
                  <Td className="whitespace-nowrap text-[11px] text-ink-400">
                    {tempoRelativo(c.ultima_interacao)}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t) => <Badge key={t} tom="brand">{t}</Badge>)}
                      {c.total_pedidos > 1 && <Badge tom="gold">recorrente</Badge>}
                      {c.total_pedidos === 0 && <Badge tom="neutro">sem compra</Badge>}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(c)}
                        aria-label={`Editar ${c.nome}`} title="Editar cliente">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setExcluindo(c)}
                        aria-label={`Excluir ${c.nome}`} title="Excluir cliente">
                        <Trash2 className="size-3.5 text-bad-400" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="clientes" />
      </Panel>

      {editando && (
        <FormCliente
          cliente={editando}
          onFechar={() => setEditando(null)}
          onSalvar={salvar}
        />
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Excluir ${excluindo?.nome}?`}
        mensagem={
          excluindo && excluindo.total_pedidos > 0
            ? `Este cliente tem ${excluindo.total_pedidos} pedido(s). O histórico de venda não pode ser apagado — desative em vez de excluir.`
            : "O cliente sai da base junto com as conversas dele."
        }
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}

const TAGS = ["vip", "recorrente", "atacado", "inadimplente", "indicação"];

function FormCliente({
  cliente, onFechar, onSalvar,
}: {
  cliente: Partial<Cliente>;
  onFechar: () => void;
  onSalvar: (d: Partial<Cliente>) => void;
}) {
  const [f, setF] = useState<Partial<Cliente>>(cliente);
  const set = <K extends keyof Cliente>(k: K, v: Cliente[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const alternarTag = (tag: string) => {
    const atuais = f.tags ?? [];
    set("tags", atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag]);
  };

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={cliente.id ? `Editar ${cliente.nome}` : "Novo cliente"}
      descricao="O telefone é o que identifica a pessoa entre uma compra e outra"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" disabled={!f.nome?.trim()} onClick={() => onSalvar(f)}>
            <Check className="size-3.5" /> Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Nome">
          <Input value={f.nome ?? ""} onChange={(e) => set("nome", e.target.value)}
            placeholder="Nome do cliente" autoFocus />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Telefone" dica="é por ele que o bot reconhece quem voltou">
            <CampoMascara tipo="telefone" valor={f.telefone ?? ""}
              aoMudar={(v) => set("telefone", v)} />
          </Campo>
          <Campo rotulo="Instagram">
            <Input value={f.instagram_username ?? ""}
              onChange={(e) => set("instagram_username", e.target.value)}
              placeholder="@usuario" />
          </Campo>
        </div>

        <Campo rotulo="Etiquetas">
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((tag) => {
              const ativa = (f.tags ?? []).includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => alternarTag(tag)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    ativa
                      ? "bg-brand-500/16 text-brand-200"
                      : "bg-ink-850 text-ink-500 hover:bg-ink-800 hover:text-ink-300",
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </Campo>

        <Switch
          ligado={f.maioridade_validada ?? false}
          onChange={(v) => set("maioridade_validada", v)}
          rotulo="Maioridade validada"
          descricao="Com isso marcado, o bot não pergunta a idade de novo"
        />

        <Campo rotulo="Observações">
          <Textarea rows={2} value={f.observacoes ?? ""}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Prefere entrega depois das 19h" />
        </Campo>
      </div>
    </Modal>
  );
}
