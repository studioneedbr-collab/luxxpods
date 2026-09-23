import Link from "next/link";
import {
  AlertTriangle, Banknote, Bike, Bot, Package, PiggyBank, Receipt,
  ShoppingBag, Target, TrendingUp, UserPlus,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { FunilPedidos } from "@/components/dashboard/funil";
import { GraficoFaturamento, GraficoPedidosLeads } from "@/components/dashboard/charts";
import { Badge, Barra, Panel, PanelHeader, Secao } from "@/components/ui";
import { Realtime, PulsoAoVivo } from "@/components/realtime";
import { resolverPeriodo } from "@/lib/periodo";
import { brl, cn, num, pct } from "@/lib/utils";
import { STATUS_PEDIDO } from "@/lib/labels";
import { getCatalogo, getFunil, getMetricas, getPedidos, getResumoEstoque, getSerie } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));

  const duracao = periodo.fim.getTime() - periodo.inicio.getTime();
  const antInicio = new Date(periodo.inicio.getTime() - duracao - 1);
  const antFim = new Date(periodo.inicio.getTime() - 1);

  const [m, anterior, serie, funil, estoque, pedidos, catalogo] = await Promise.all([
    getMetricas(periodo.inicio, periodo.fim),
    getMetricas(antInicio, antFim),
    getSerie(periodo.inicio, periodo.fim),
    getFunil(),
    getResumoEstoque(),
    getPedidos(60),
    getCatalogo(),
  ]);

  const variacao = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
  const margem = m.faturamento > 0 ? (m.lucro_bruto / m.faturamento) * 100 : 0;
  const participacaoBot = m.faturamento > 0 ? (m.faturamento_bot / m.faturamento) * 100 : 0;

  const emAndamento = pedidos
    .filter((p) => ["aguardando_pagamento", "confirmado", "em_separacao", "saiu_para_entrega"]
      .includes(p.status_pedido))
    .slice(0, 6);

  const criticos = catalogo
    .filter((c) => c.estoque_disponivel <= c.estoque_minimo && c.sabor_ativo)
    .sort((a, b) => a.estoque_disponivel - b.estoque_disponivel)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <Realtime tabelas={["orders", "leads", "conversations", "messages", "inventory"]} />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo rotulo={periodo.rotulo} />
        <PulsoAoVivo />
      </div>

      {/* ------------------------- o resultado do período ------------------------ */}
      <Secao titulo="Resultado" descricao={periodo.rotulo}>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard rotulo="Faturamento" valor={brl(m.faturamento)} icone={Banknote} tom="ok" destaque
            variacao={variacao(m.faturamento, anterior.faturamento)}
            sub={`${num(m.pedidos)} pedidos`} />
          <StatCard rotulo="Lucro bruto" valor={brl(m.lucro_bruto)} icone={PiggyBank} tom="brand"
            variacao={variacao(m.lucro_bruto, anterior.lucro_bruto)}
            sub={`margem de ${pct(margem, 0)}`} />
          <StatCard rotulo="Ticket médio" valor={brl(m.ticket_medio)} icone={Receipt}
            variacao={variacao(m.ticket_medio, anterior.ticket_medio)}
            sub={`CMV ${brl(m.cmv)}`} />
          <StatCard rotulo="Conversão" valor={pct(m.taxa_conversao, 0)} icone={Target} tom="gold"
            sub={`${num(m.leads_ganhos)} de ${num(m.leads)} leads`} />
        </div>
      </Secao>

      {/* ------------------------------ os gráficos ----------------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="overflow-hidden xl:col-span-2">
          <PanelHeader titulo="Faturamento por dia" icone={TrendingUp}
            descricao={`${brl(m.faturamento)} no período`}
            acao={<Badge tom={margem >= 40 ? "ok" : "warn"}>{pct(margem, 0)} de margem</Badge>} />
          <div className="p-2 pr-4"><GraficoFaturamento dados={serie} /></div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader titulo="Funil" icone={Target} descricao="Leads abertos por etapa" />
          <FunilPedidos etapas={funil} />
        </Panel>
      </div>

      {/* --------------------------- o que pede ação --------------------------- */}
      <Secao
        titulo="Precisa de ação"
        descricao="O que está parado esperando alguém da operação"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="overflow-hidden">
            <PanelHeader titulo="Pedidos em andamento" icone={ShoppingBag}
              descricao={`${num(emAndamento.length)} aguardando`}
              acao={
                <Link href="/pedidos" className="text-[11px] font-medium text-brand-300 hover:text-brand-200">
                  todos
                </Link>
              } />
            {emAndamento.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-500">Nenhum pedido em aberto</p>
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {emAndamento.map((p) => {
                  const st = STATUS_PEDIDO[p.status_pedido];
                  return (
                    <li key={p.id}>
                      <Link href={`/pedidos/${p.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-850/60">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink-100">{p.cliente_nome}</span>
                          <span className="block font-mono text-[10px] text-ink-500">{p.numero_pedido}</span>
                        </span>
                        <Badge tom={st.tom}>{st.rotulo}</Badge>
                        <span className="numero w-16 text-right text-[13px] text-ink-100">
                          {brl(p.total)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader titulo="Estoque no limite" icone={AlertTriangle}
              descricao={`${num(estoque.sem_estoque)} esgotados · ${num(estoque.estoque_baixo)} no mínimo`}
              acao={
                <Link href="/estoque" className="text-[11px] font-medium text-brand-300 hover:text-brand-200">
                  estoque
                </Link>
              } />
            {criticos.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-500">Estoque saudável</p>
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {criticos.map((c) => (
                  <li key={c.product_flavor_id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink-100">{c.produto}</span>
                      <span className="block truncate text-[11px] text-ink-500">{c.sabor}</span>
                    </span>
                    <span className={cn(
                      "numero text-[13px]",
                      c.estoque_disponivel === 0 ? "text-bad-400" : "text-warn-400",
                    )}>
                      {c.estoque_disponivel === 0 ? "esgotado" : `${c.estoque_disponivel} un`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Secao>

      {/* --------------------------- aquisição e bot --------------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="overflow-hidden xl:col-span-2">
          <PanelHeader titulo="Leads e pedidos" icone={UserPlus}
            descricao="Quantos chegaram e quantos fecharam, por dia" />
          <div className="p-2 pr-4"><GraficoPedidosLeads dados={serie} /></div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader titulo="O bot" icone={Bot} descricao="Atendimento automático" />
          <div className="space-y-4 px-4 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-ink-500">
                Faturamento originado
              </p>
              <p className="numero mt-1 text-xl text-ok-400">{brl(m.faturamento_bot)}</p>
              <Barra valor={participacaoBot} tom="ok" className="mt-2" />
              <p className="mt-1 text-[11px] text-ink-500">{pct(participacaoBot, 0)} do total</p>
            </div>

            <dl className="space-y-2 border-t border-[var(--linha)] pt-3">
              {[
                ["Mensagens recebidas", num(m.mensagens_recebidas), false],
                ["Conversas abertas", num(m.conversas_abertas), false],
                ["Sem resposta", num(m.conversas_nao_respondidas), m.conversas_nao_respondidas > 0],
                ["1ª resposta", `${num(m.tempo_primeira_resposta)} min`, false],
              ].map(([rotulo, valor, alerta]) => (
                <div key={String(rotulo)} className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-ink-400">{rotulo}</dt>
                  <dd className={cn(
                    "numero text-[13px]",
                    alerta ? "text-warn-400" : "text-ink-200",
                  )}>
                    {valor}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      </div>

      {/* ------------------------------ o inventário ---------------------------- */}
      <Secao titulo="Inventário" descricao="Quanto está parado em prateleira">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard rotulo="Peças em estoque" valor={num(estoque.pecas)} icone={Package}
            sub={`${num(estoque.skus)} SKUs`} />
          <StatCard rotulo="Custo do estoque" valor={brl(estoque.custo_estoque)} icone={Banknote} />
          <StatCard rotulo="Venda potencial" valor={brl(estoque.valor_venda_potencial)} tom="ok"
            icone={TrendingUp}
            sub={`${brl(estoque.valor_venda_potencial - estoque.custo_estoque)} de lucro`} />
          <StatCard rotulo="Em rota agora" valor={num(m.pedidos_despachados)} icone={Bike} tom="info"
            sub={`${num(m.pedidos_entregues)} entregues no período`} />
        </div>
      </Secao>
    </div>
  );
}
