import Link from "next/link";
import {
  ArrowDownCircle, ArrowUpCircle, Banknote, PiggyBank, QrCode, Wallet, Clock,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { GraficoFaturamento, GraficoRosca } from "@/components/dashboard/charts";
import { Badge, Panel, PanelHeader, Table, Td, Th, Tr, Vazio, Barra } from "@/components/ui";
import { Realtime } from "@/components/realtime";
import { resolverPeriodo } from "@/lib/periodo";
import { METODO_PAGAMENTO, STATUS_PAGAMENTO } from "@/lib/labels";
import { brl, num, pct } from "@/lib/utils";
import { getMetricas, getPedidos, getSerie } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));

  const [m, serie, pedidos] = await Promise.all([
    getMetricas(periodo.inicio, periodo.fim),
    getSerie(periodo.inicio, periodo.fim),
    getPedidos(300),
  ]);

  const noPeriodo = pedidos.filter(
    (p) => +new Date(p.created_at) >= +periodo.inicio &&
           +new Date(p.created_at) <= +periodo.fim &&
           p.status_pedido !== "cancelado",
  );

  const recebido = noPeriodo.filter((p) => p.status_pagamento === "aprovado");
  const aReceber = noPeriodo.filter((p) => p.status_pagamento !== "aprovado");
  const totalRecebido = recebido.reduce((a, p) => a + p.total, 0);
  const totalAReceber = aReceber.reduce((a, p) => a + p.total, 0);
  const margem = m.faturamento > 0 ? (m.lucro_bruto / m.faturamento) * 100 : 0;

  const porMetodo = [
    { nome: "PIX", valor: noPeriodo.filter((p) => p.forma_pagamento === "pix").reduce((a, p) => a + p.total, 0) },
    { nome: "Dinheiro", valor: noPeriodo.filter((p) => p.forma_pagamento === "dinheiro").reduce((a, p) => a + p.total, 0) },
  ].filter((x) => x.valor > 0);

  return (
    <div className="space-y-4">
      <Realtime tabelas={["orders", "payments", "accounts_receivable"]} />
      <FiltroPeriodo rotulo={periodo.rotulo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Faturamento" valor={brl(m.faturamento)} icone={Wallet} tom="ok" destaque
          sub={`${num(m.pedidos)} vendas`} />
        <StatCard rotulo="Recebido" valor={brl(totalRecebido)} icone={ArrowDownCircle} tom="brand"
          sub={`${num(recebido.length)} pagamentos confirmados`} />
        <StatCard rotulo="A receber" valor={brl(totalAReceber)} icone={Clock}
          tom={totalAReceber > 0 ? "warn" : "ok"}
          sub={`${num(aReceber.length)} pedidos em aberto`} />
        <StatCard rotulo="Lucro bruto estimado" valor={brl(m.lucro_bruto)} icone={PiggyBank} tom="gold"
          sub={`margem ${pct(margem)} · CMV ${brl(m.cmv)}`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader titulo="Entradas no período" icone={Wallet}
            descricao={`${periodo.rotulo} · ${brl(m.faturamento)}`} />
          <div className="p-2 pr-4"><GraficoFaturamento dados={serie} /></div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Composição do resultado" icone={PiggyBank} />
          <div className="space-y-4 px-5 py-4">
            <Linha rotulo="Faturamento bruto" valor={brl(m.faturamento)} destaque />
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-ink-400">Custo da mercadoria (CMV)</span>
                <span className="font-semibold tabular-nums text-bad-400">− {brl(m.cmv)}</span>
              </div>
              <Barra valor={m.faturamento > 0 ? (m.cmv / m.faturamento) * 100 : 0} tom="bad" className="mt-1.5" />
            </div>
            <div className="border-t border-[var(--linha)] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-ink-400">Lucro bruto</span>
                <span className="text-[19px] font-bold tabular-nums text-ok-400">{brl(m.lucro_bruto)}</span>
              </div>
              <Barra valor={margem} tom="ok" className="mt-1.5" />
              <p className="mt-1 text-right text-[11px] text-ink-500">margem de {pct(margem)}</p>
            </div>

            <div className="border-t border-[var(--linha)] pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">Por forma de pagamento</p>
              {porMetodo.length > 0
                ? <GraficoRosca dados={porMetodo} altura={170} />
                : <p className="py-6 text-center text-[11px] text-ink-500">Sem movimento no período</p>}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Contas a receber" icone={ArrowDownCircle}
            descricao="Toda venda gera automaticamente o lançamento"
            acao={<Badge tom={totalAReceber > 0 ? "warn" : "ok"}>{brl(totalAReceber)}</Badge>} />
          {aReceber.length === 0 ? (
            <Vazio icone={ArrowDownCircle} titulo="Nada em aberto" descricao="Todos os pedidos do período estão quitados." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Pedido</Th><Th>Cliente</Th>
                  <Th className="text-center">Forma</Th>
                  <Th className="text-center">Status</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {aReceber.slice(0, 15).map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/pedidos/${p.id}`} className="tabular-nums font-medium text-brand-300 hover:text-brand-200">
                        {p.numero_pedido}
                      </Link>
                    </Td>
                    <Td className="truncate text-ink-200">{p.cliente_nome}</Td>
                    <Td className="text-center text-[11px] text-ink-400">
                      {METODO_PAGAMENTO[p.forma_pagamento]}
                    </Td>
                    <Td className="text-center">
                      <Badge tom={STATUS_PAGAMENTO[p.status_pagamento].tom}>
                        {STATUS_PAGAMENTO[p.status_pagamento].rotulo}
                      </Badge>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-warn-400">{brl(p.total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel>
          <PanelHeader titulo="Contas a pagar" icone={ArrowUpCircle}
            descricao="Fornecedores, motoboy, aluguel e despesas fixas" />
          <Vazio
            icone={ArrowUpCircle}
            titulo="Nenhum lançamento"
            descricao="As categorias financeiras já estão criadas. O cadastro de despesas entra no MVP 2."
          />
          <div className="border-t border-[var(--linha)] px-5 py-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">Categorias já cadastradas</p>
            <div className="flex flex-wrap gap-1.5">
              {["Mercadoria", "Aluguel", "Funcionários", "Marketing", "Motoboy", "Sistemas", "Energia", "Internet", "Outros"]
                .map((c) => <Badge key={c} tom="neutro">{c}</Badge>)}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo rotulo="Recebido em PIX" icone={QrCode}
          valor={brl(recebido.filter((p) => p.forma_pagamento === "pix").reduce((a, p) => a + p.total, 0))} />
        <Resumo rotulo="Recebido em dinheiro" icone={Banknote}
          valor={brl(recebido.filter((p) => p.forma_pagamento === "dinheiro").reduce((a, p) => a + p.total, 0))} />
        <Resumo rotulo="Ticket médio" icone={Wallet} valor={brl(m.ticket_medio)} />
        <Resumo rotulo="Taxa de entrega arrecadada" icone={Banknote}
          valor={brl(noPeriodo.reduce((a, p) => a + p.taxa_entrega, 0))} />
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-ink-400">{rotulo}</span>
      <span className={destaque
        ? "text-[15px] font-bold tabular-nums text-ink-100"
        : "text-[13px] font-semibold tabular-nums text-ink-200"}>
        {valor}
      </span>
    </div>
  );
}

function Resumo({ rotulo, valor, icone: Icone }: {
  rotulo: string; valor: string; icone: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Panel className="flex items-center gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-850 text-ink-400">
        <Icone className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
        <p className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-ink-100">{valor}</p>
      </div>
    </Panel>
  );
}
