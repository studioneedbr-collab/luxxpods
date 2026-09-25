"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote, MessageCircle, AtSign, Search, ShoppingBag, QrCode, Filter, Plus, Receipt,
} from "lucide-react";
import { Badge, Button, Panel, Select, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { STATUS_PAGAMENTO, STATUS_PEDIDO, METODO_PAGAMENTO } from "@/lib/labels";
import { brl, cn, dataHora, num } from "@/lib/utils";
import type { Pedido, PedidoStatus } from "@/lib/types";
import { BotaoExportar } from "@/components/ui/botao-exportar";
import { dataExport } from "@/lib/exportar";

export function ListaPedidos({
  pedidos, buscaInicial = "", statusInicial = "todos", agora,
}: {
  pedidos: Pedido[];
  /** vem da URL, para links como "pedidos deste cliente" já chegarem filtrados */
  buscaInicial?: string;
  statusInicial?: string;
  /** hora do servidor, para o filtro de período não depender do relógio local */
  agora: number;
}) {
  const [busca, setBusca] = useState(buscaInicial);
  const [status, setStatus] = useState<string>(statusInicial);
  const [pagamento, setPagamento] = useState<string>("todos");
  const [periodo, setPeriodo] = useState<string>("todos");

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (status === "abertos" &&
          ["entregue", "cancelado"].includes(p.status_pedido)) return false;
      if (status !== "todos" && status !== "abertos" && p.status_pedido !== status) return false;
      if (pagamento !== "todos" && p.forma_pagamento !== pagamento) return false;

      if (periodo !== "todos") {
        const quando = new Date(p.created_at).getTime();
        const limite = periodo === "hoje"
          ? new Date(new Date(agora).setHours(0, 0, 0, 0)).getTime()
          : agora - Number(periodo) * 864e5;
        if (quando < limite) return false;
      }

      if (!t) return true;
      return [p.numero_pedido, p.cliente_nome, p.cliente_telefone]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [pedidos, busca, status, pagamento, periodo, agora]);

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 25);

  const totais = {
    qtd: filtrados.filter((p) => p.status_pedido !== "cancelado").length,
    valor: filtrados.filter((p) => p.status_pedido !== "cancelado").reduce((a, p) => a + p.total, 0),
    receber: filtrados
      .filter((p) => p.status_pagamento !== "aprovado" && p.status_pedido !== "cancelado")
      .reduce((a, p) => a + p.total, 0),
  };

  const preFiltrado = Boolean(buscaInicial) && busca === buscaInicial;

  return (
    <div className="space-y-3">
      {preFiltrado && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/8 px-4 py-2.5">
          <Filter className="size-3.5 shrink-0 text-brand-300" />
          <p className="min-w-0 flex-1 text-[11px] text-brand-200">
            Mostrando apenas os pedidos de <strong>{buscaInicial}</strong>
          </p>
          <button
            onClick={() => setBusca("")}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-300 transition hover:bg-ink-800 hover:text-brand-100"
          >
            ver todos
          </button>
        </div>
      )}

      {/* os números primeiro: é o que se olha antes de filtrar */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Cartao rotulo="Pedidos" valor={num(totais.qtd)} icone={ShoppingBag} />
        <Cartao rotulo="Faturamento" valor={brl(totais.valor)} icone={Banknote} tom="ok" />
        <Cartao rotulo="A receber" valor={brl(totais.receber)} icone={QrCode}
          tom={totais.receber > 0 ? "warn" : "neutro"} />
        <Cartao rotulo="Ticket médio" valor={brl(totais.qtd ? totais.valor / totais.qtd : 0)}
          icone={Receipt} />
      </div>

      {/* filtros numa faixa só, sem disputar espaço com os números */}
      <Panel className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número, cliente ou telefone…"
            className="h-8 w-full rounded-md bg-ink-950 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>

        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todos">Todos os status</option>
          <option value="abertos">Em aberto</option>
          {Object.entries(STATUS_PEDIDO).map(([k, v]) => (
            <option key={k} value={k}>{v.rotulo}</option>
          ))}
        </Select>

        <Select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
          <option value="todos">Todo pagamento</option>
          <option value="pix">PIX</option>
          <option value="dinheiro">Dinheiro</option>
        </Select>

        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <option value="todos">Qualquer data</option>
          <option value="hoje">Hoje</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
        </Select>

        <div className="ml-auto flex gap-2">
          <BotaoExportar
            itens={filtrados}
            nomeArquivo="pedidos"
            colunas={[
              { cabecalho: "Pedido", valor: (p) => p.numero_pedido },
              { cabecalho: "Data", valor: (p) => dataExport(p.created_at) },
              { cabecalho: "Cliente", valor: (p) => p.cliente_nome },
              { cabecalho: "Telefone", valor: (p) => p.cliente_telefone },
              { cabecalho: "Bairro", valor: (p) => p.endereco_snapshot?.bairro },
              { cabecalho: "Canal", valor: (p) => p.canal },
              { cabecalho: "Origem", valor: (p) => p.origem },
              { cabecalho: "Forma de pagamento", valor: (p) => METODO_PAGAMENTO[p.forma_pagamento] },
              { cabecalho: "Status do pagamento", valor: (p) => STATUS_PAGAMENTO[p.status_pagamento].rotulo },
              { cabecalho: "Status do pedido", valor: (p) => STATUS_PEDIDO[p.status_pedido].rotulo },
              { cabecalho: "Produtos", valor: (p) => p.subtotal },
              { cabecalho: "Desconto", valor: (p) => p.desconto },
              { cabecalho: "Entrega", valor: (p) => p.taxa_entrega },
              { cabecalho: "Total", valor: (p) => p.total },
              { cabecalho: "Custo", valor: (p) => p.custo_total },
              { cabecalho: "Lucro estimado", valor: (p) => p.total - p.custo_total - p.desconto - p.taxa_entrega },
              { cabecalho: "Entregue em", valor: (p) => dataExport(p.entregue_em) },
            ]}
          />
          <Link href="/pedidos/novo">
            <Button variante="primario" tamanho="sm">
              <Plus className="size-3.5" /> Novo pedido
            </Button>
          </Link>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        {filtrados.length === 0 ? (
          <Vazio icone={ShoppingBag} titulo="Nenhum pedido"
            descricao="Ajuste os filtros ou registre uma venda de balcão."
            acao={
              <Link href="/pedidos/novo">
                <Button variante="primario" tamanho="sm">
                  <Plus className="size-3.5" /> Novo pedido
                </Button>
              </Link>
            } />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Cliente</Th>
                <Th className="text-center">Canal</Th>
                <Th>Data</Th>
                <Th className="text-center">Pagamento</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const st = STATUS_PEDIDO[p.status_pedido as PedidoStatus];
                const pg = STATUS_PAGAMENTO[p.status_pagamento];
                return (
                  <Tr key={p.id} className="cursor-pointer">
                    <Td>
                      <Link href={`/pedidos/${p.id}`} className="font-semibold tabular-nums text-brand-300 hover:text-brand-200">
                        {p.numero_pedido}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/pedidos/${p.id}`} className="block">
                        <p className="truncate font-medium text-ink-100">{p.cliente_nome ?? "—"}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {p.endereco_snapshot?.bairro ?? "—"}
                        </p>
                      </Link>
                    </Td>
                    <Td className="text-center">
                      {p.canal === "instagram"
                        ? <AtSign className="mx-auto size-3.5" style={{ color: "#E1306C" }} />
                        : <MessageCircle className="mx-auto size-3.5" style={{ color: "#25D366" }} />}
                    </Td>
                    <Td className="whitespace-nowrap text-[11px] tabular-nums text-ink-400">
                      {dataHora(p.created_at)}
                    </Td>
                    <Td className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {p.forma_pagamento === "pix"
                          ? <QrCode className="size-3 text-ink-400" />
                          : <Banknote className="size-3 text-ink-400" />}
                        <span className="text-[11px] text-ink-300">{METODO_PAGAMENTO[p.forma_pagamento]}</span>
                        <Badge tom={pg.tom}>{pg.rotulo}</Badge>
                      </div>
                    </Td>
                    <Td className="text-center"><Badge tom={st.tom}>{st.rotulo}</Badge></Td>
                    <Td className={cn(
                      "text-right font-semibold tabular-nums",
                      p.status_pedido === "cancelado" ? "text-ink-600 line-through" : "text-ink-100",
                    )}>
                      {brl(p.total)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="pedidos" />
      </Panel>
    </div>
  );
}

function Cartao({
  rotulo, valor, icone: Icone, tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  icone: React.ComponentType<{ className?: string }>;
  tom?: "neutro" | "ok" | "warn";
}) {
  const cores = { neutro: "text-ink-100", ok: "text-ok-400", warn: "text-warn-400" };
  return (
    <div className="chapa flex items-center gap-3 px-4 py-3">
      <Icone className="size-4 shrink-0 text-ink-600" />
      <div className="min-w-0">
        <p className="rotulo truncate">{rotulo}</p>
        <p className={cn("numero mt-0.5 truncate text-[15px]", cores[tom])}>{valor}</p>
      </div>
    </div>
  );
}
