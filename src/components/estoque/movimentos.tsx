"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Search } from "lucide-react";
import { Badge, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { MOVIMENTO } from "@/lib/labels";
import { cn, dataHora } from "@/lib/utils";
import type { Movimento } from "@/lib/types";
import { BotaoExportar } from "@/components/ui/botao-exportar";
import { dataExport } from "@/lib/exportar";

export function TabelaMovimentos({
  movimentos, titulo = "Movimentações", descricao, mostrarReferencia = false,
}: {
  movimentos: Movimento[];
  titulo?: string;
  descricao?: string;
  mostrarReferencia?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return movimentos.filter((m) => {
      if (tipo !== "todos" && m.tipo !== tipo) return false;
      if (!t) return true;
      return [m.produto, m.sabor, m.observacao, m.referencia_tipo]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [movimentos, busca, tipo]);

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 25);

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        titulo={titulo}
        icone={ArrowDownUp}
        descricao={descricao ?? "Nenhuma alteração de estoque acontece sem histórico"}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--linha)] px-4 py-2.5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto, sabor ou observação…"
            className="h-8 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[11px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 text-[11px]">
          <option value="todos">Todos os tipos</option>
          {Object.entries(MOVIMENTO).map(([k, v]) => (
            <option key={k} value={k}>{v.rotulo}</option>
          ))}
        </Select>
        <BotaoExportar
          itens={filtrados}
          nomeArquivo="movimentacoes-estoque"
          colunas={[
            { cabecalho: "Data", valor: (m) => dataExport(m.created_at) },
            { cabecalho: "Tipo", valor: (m) => MOVIMENTO[m.tipo].rotulo },
            { cabecalho: "Produto", valor: (m) => m.produto },
            { cabecalho: "Sabor", valor: (m) => m.sabor },
            { cabecalho: "Quantidade", valor: (m) => m.quantidade * (MOVIMENTO[m.tipo].sinal || 1) },
            { cabecalho: "Saldo anterior", valor: (m) => m.saldo_anterior },
            { cabecalho: "Saldo posterior", valor: (m) => m.saldo_posterior },
            { cabecalho: "Referência", valor: (m) => m.referencia_tipo },
            { cabecalho: "Observação", valor: (m) => m.observacao },
          ]}
        />
      </div>

      {filtrados.length === 0 ? (
        <Vazio icone={ArrowDownUp} titulo="Sem movimentações"
          descricao="As entradas, vendas e ajustes aparecem aqui com saldo antes e depois." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Data</Th><Th>Tipo</Th><Th>Produto</Th><Th>Sabor</Th>
              <Th className="text-right">Qtd</Th>
              <Th className="text-right">Antes</Th>
              <Th className="text-right">Depois</Th>
              {mostrarReferencia && <Th>Referência</Th>}
              <Th>Observação</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((m) => {
              const mv = MOVIMENTO[m.tipo];
              return (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-[11px] tabular-nums text-ink-400">
                    {dataHora(m.created_at)}
                  </Td>
                  <Td><Badge tom={mv.tom}>{mv.rotulo}</Badge></Td>
                  <Td className="font-medium text-ink-100">{m.produto ?? "—"}</Td>
                  <Td className="text-ink-300">{m.sabor ?? "—"}</Td>
                  <Td className={cn(
                    "text-right font-semibold tabular-nums",
                    mv.sinal > 0 ? "text-ok-400" : mv.sinal < 0 ? "text-bad-400" : "text-ink-300",
                  )}>
                    {mv.sinal > 0 ? "+" : mv.sinal < 0 ? "−" : ""}{m.quantidade}
                  </Td>
                  <Td className="text-right tabular-nums text-ink-500">{m.saldo_anterior}</Td>
                  <Td className="text-right tabular-nums font-medium text-ink-200">{m.saldo_posterior}</Td>
                  {mostrarReferencia && (
                    <Td className="text-[11px] text-ink-500">{m.referencia_tipo ?? "—"}</Td>
                  )}
                  <Td className="max-w-[240px] truncate text-[11px] text-ink-500">
                    {m.observacao ?? "—"}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Paginacao {...paginacao} rotulo="movimentações" />
    </Panel>
  );
}
