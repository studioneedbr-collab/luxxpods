"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, AtSign, Search, Users, ShieldCheck } from "lucide-react";
import { Badge, Panel, Select, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, iniciais, num, telefone, tempoRelativo } from "@/lib/utils";
import type { Cliente } from "@/lib/types";
import { BotaoExportar } from "@/components/ui/botao-exportar";
import { dataExport } from "@/lib/exportar";

export function ListaClientes({ clientes }: { clientes: Cliente[] }) {
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
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
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
          <Vazio icone={Users} titulo="Nenhum cliente" descricao="Os clientes são criados automaticamente na primeira conversa." />
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
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="clientes" />
      </Panel>
    </div>
  );
}
