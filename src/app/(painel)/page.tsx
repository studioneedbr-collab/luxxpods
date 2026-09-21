import {
  Banknote, Bike, Bot, MessagesSquare, Package, PiggyBank,
  Receipt, ShoppingBag, Target, TrendingUp, UserPlus, Users, XCircle,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { FunilPedidos } from "@/components/dashboard/funil";
import { GraficoFaturamento, GraficoPedidosLeads, GraficoBarras, GraficoRosca } from "@/components/dashboard/charts";
import { Panel, PanelHeader, Badge, Barra } from "@/components/ui";
import { Realtime, PulsoAoVivo } from "@/components/realtime";
import { resolverPeriodo } from "@/lib/periodo";
import { brl, num, pct, cn } from "@/lib/utils";
import { STATUS_PEDIDO } from "@/lib/labels";
import {
  getCatalogo, getFunil, getMetricas, getPedidos, getResumoEstoque, getSerie,
} from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));

  // período anterior de mesmo tamanho, para a variação
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

  const variacao = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : null);
  const margem = m.faturamento > 0 ? (m.lucro_bruto / m.faturamento) * 100 : 0;

  // ranking de produtos no período
  const noPeriodo = pedidos.filter(
    (p) => +new Date(p.created_at) >= +periodo.inicio &&
           +new Date(p.created_at) <= +periodo.fim &&
           p.status_pedido !== "cancelado",
  );

  const porMarca = new Map<string, number>();
  catalogo.forEach((c) => {
    if (!c.marca) return;
    porMarca.set(c.marca, (porMarca.get(c.marca) ?? 0) + c.estoque_total);
  });

  const porCanal = [
    { nome: "WhatsApp", valor: noPeriodo.filter((p) => p.canal === "whatsapp").length },
    { nome: "Instagram", valor: noPeriodo.filter((p) => p.canal === "instagram").length },
    { nome: "Manual", valor: noPeriodo.filter((p) => p.canal === "manual").length },
  ].filter((c) => c.valor > 0);

  const porPagamento = [
    { nome: "PIX", valor: noPeriodo.filter((p) => p.forma_pagamento === "pix").length },
    { nome: "Dinheiro", valor: noPeriodo.filter((p) => p.forma_pagamento === "dinheiro").length },
  ].filter((c) => c.valor > 0);

  const estoqueBaixo = catalogo
    .filter((c) => c.estoque_disponivel <= c.estoque_minimo)
    .sort((a, b) => a.estoque_disponivel - b.estoque_disponivel)
    .slice(0, 6);

  const emAndamento = pedidos.filter((p) =>
    ["confirmado", "em_separacao", "saiu_para_entrega", "aguardando_pagamento"].includes(p.status_pedido),
  ).slice(0, 7);

  return (
    <div className="space-y-4">
      <Realtime tabelas={["orders", "leads", "conversations", "messages", "inventory"]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo rotulo={periodo.rotulo} />
        <PulsoAoVivo />
      </div>

      {/* ---------------- indicadores principais ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Faturamento" valor={brl(m.faturamento)} icone={Banknote} tom="ok"
          variacao={variacao(m.faturamento, anterior.faturamento)}
          sub={`${num(m.pedidos)} pedidos`} destaque />
        <StatCard rotulo="Lucro bruto estimado" valor={brl(m.lucro_bruto)} icone={PiggyBank} tom="brand"
          variacao={variacao(m.lucro_bruto, anterior.lucro_bruto)}
          sub={`margem ${pct(margem)}`} />
        <StatCard rotulo="Ticket médio" valor={brl(m.ticket_medio)} icone={Receipt} tom="info"
          variacao={variacao(m.ticket_medio, anterior.ticket_medio)}
          sub={`CMV ${brl(m.cmv)}`} />
        <StatCard rotulo="Taxa de conversão" valor={pct(m.taxa_conversao)} icone={Target} tom="gold"
          sub={`${num(m.leads_ganhos)} de ${num(m.leads)} leads`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Pedidos" valor={num(m.pedidos)} icone={ShoppingBag} tom="brand"
          variacao={variacao(m.pedidos, anterior.pedidos)}
          sub={`${num(m.pedidos_entregues)} entregues`} />
        <StatCard rotulo="Em rota" valor={num(m.pedidos_despachados)} icone={Bike} tom="info"
          sub="saíram para entrega" />
        <StatCard rotulo="Clientes novos" valor={num(m.clientes_novos)} icone={UserPlus} tom="ok"
          variacao={variacao(m.clientes_novos, anterior.clientes_novos)}
          sub={`${num(m.clientes_total)} na base`} />
        <StatCard rotulo="Cancelamentos" valor={pct(m.taxa_cancelamento)} icone={XCircle} tom="bad"
          sub={`${num(m.pedidos_cancelados)} pedidos`} />
      </div>

      {/* ---------------- gráficos ---------------- */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            titulo="Faturamento no período"
            descricao={`${periodo.rotulo} · ${brl(m.faturamento)} acumulado`}
            icone={TrendingUp}
            acao={<Badge tom="ok">{pct(margem)} de margem</Badge>}
          />
          <div className="p-2 pr-4">
            <GraficoFaturamento dados={serie} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Funil de pedidos" descricao="Leads abertos por etapa" icone={Target} />
          <FunilPedidos etapas={funil} />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader titulo="Leads x Pedidos" descricao="Volume diário de aquisição e conversão" icone={Users} />
          <div className="p-2 pr-4">
            <GraficoPedidosLeads dados={serie} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Chatbot" descricao="Atendimento automático" icone={Bot} />
          <div className="space-y-3 px-5 py-4">
            <LinhaMetrica rotulo="Mensagens recebidas" valor={num(m.mensagens_recebidas)} />
            <LinhaMetrica rotulo="Conversas abertas" valor={num(m.conversas_abertas)} />
            <LinhaMetrica rotulo="Aguardando cliente" valor={num(m.conversas_aguardando)} />
            <LinhaMetrica rotulo="Não respondidas" valor={num(m.conversas_nao_respondidas)}
              alerta={m.conversas_nao_respondidas > 0} />
            <LinhaMetrica rotulo="1ª resposta (média)" valor={`${num(m.tempo_primeira_resposta)} min`} />
            <div className="border-t border-white/6 pt-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-500">Faturamento originado pelo bot</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ok-400">{brl(m.faturamento_bot)}</p>
              <Barra
                valor={m.faturamento > 0 ? (m.faturamento_bot / m.faturamento) * 100 : 0}
                tom="ok" className="mt-2"
              />
              <p className="mt-1.5 text-[11px] text-ink-500">
                {pct(m.faturamento > 0 ? (m.faturamento_bot / m.faturamento) * 100 : 0)} do total
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {/* ---------------- operação ---------------- */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel>
          <PanelHeader titulo="Pedidos em andamento" descricao="Precisam de ação agora" icone={ShoppingBag}
            acao={<Link href="/pedidos" className="text-[11px] font-medium text-brand-300 hover:text-brand-200">ver todos</Link>} />
          <ul className="divide-y divide-white/4">
            {emAndamento.length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-ink-500">Nenhum pedido em aberto 🎉</li>
            )}
            {emAndamento.map((p) => {
              const st = STATUS_PEDIDO[p.status_pedido];
              return (
                <li key={p.id}>
                  <Link href={`/pedidos/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-white/4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink-200">{p.cliente_nome}</p>
                      <p className="text-[11px] tabular-nums text-ink-500">{p.numero_pedido}</p>
                    </div>
                    <Badge tom={st.tom}>{st.rotulo}</Badge>
                    <span className="w-16 text-right text-xs font-semibold tabular-nums text-ink-100">
                      {brl(p.total)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader titulo="Estoque crítico" descricao="Abaixo do mínimo configurado" icone={Package}
            acao={<Link href="/estoque" className="text-[11px] font-medium text-brand-300 hover:text-brand-200">estoque</Link>} />
          <ul className="divide-y divide-white/4">
            {estoqueBaixo.length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-ink-500">Estoque saudável ✅</li>
            )}
            {estoqueBaixo.map((c) => (
              <li key={c.product_flavor_id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-200">{c.produto}</p>
                  <p className="truncate text-[11px] text-ink-500">{c.sabor}</p>
                </div>
                <Badge tom={c.estoque_disponivel === 0 ? "bad" : "warn"}>
                  {c.estoque_disponivel === 0 ? "esgotado" : `${c.estoque_disponivel} un`}
                </Badge>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-px border-t border-white/6 bg-white/4">
            <div className="bg-ink-900/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Custo do estoque</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-ink-100">{brl(estoque.custo_estoque)}</p>
            </div>
            <div className="bg-ink-900/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Venda potencial</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-ok-400">{brl(estoque.valor_venda_potencial)}</p>
            </div>
          </div>
        </Panel>

        <div className="grid gap-3">
          <Panel>
            <PanelHeader titulo="Origem dos pedidos" descricao="Canal de entrada" icone={MessagesSquare} />
            <div className="px-3 py-2">
              {porCanal.length ? <GraficoRosca dados={porCanal} altura={190} />
                : <p className="py-10 text-center text-xs text-ink-500">Sem pedidos no período</p>}
            </div>
          </Panel>
          <Panel>
            <PanelHeader titulo="Formas de pagamento" icone={Banknote} />
            <div className="px-3 py-2">
              {porPagamento.length ? <GraficoRosca dados={porPagamento} altura={190} />
                : <p className="py-10 text-center text-xs text-ink-500">Sem pedidos no período</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader titulo="Peças em estoque por marca" descricao="Distribuição atual do inventário" icone={Package} />
        <div className="p-3">
          <GraficoBarras
            dados={[...porMarca.entries()]
              .map(([nome, valor]) => ({ marca: nome, qtd: valor }))
              .sort((a, b) => b.qtd - a.qtd)}
            chaveX="marca" chaveY="qtd" altura={210}
          />
        </div>
      </Panel>
    </div>
  );
}

function LinhaMetrica({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-400">{rotulo}</span>
      <span className={cn(
        "text-sm font-semibold tabular-nums",
        alerta ? "text-warn-400" : "text-ink-100",
      )}>
        {valor}
      </span>
    </div>
  );
}
