import { Bot, Clock, MessageSquare, Target, TrendingUp, UserCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { GraficoPedidosLeads, GraficoRosca } from "@/components/dashboard/charts";
import { Panel, PanelHeader, Barra, Table, Td, Tr } from "@/components/ui";
import { resolverPeriodo } from "@/lib/periodo";
import { ESTADO_CONVERSA } from "@/lib/labels";
import { brl, num, pct } from "@/lib/utils";
import { getConversas, getMetricas, getSerie } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RelatorioChatbotPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));

  const [m, serie, conversas] = await Promise.all([
    getMetricas(periodo.inicio, periodo.fim),
    getSerie(periodo.inicio, periodo.fim),
    getConversas(),
  ]);

  const comBot = conversas.filter((c) => c.bot_ativo).length;
  const participacao = m.faturamento > 0 ? (m.faturamento_bot / m.faturamento) * 100 : 0;

  const porEstado = Object.entries(
    conversas.reduce<Record<string, number>>((acc, c) => {
      acc[c.estado] = (acc[c.estado] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([estado, qtd]) => ({
    nome: ESTADO_CONVERSA[estado as keyof typeof ESTADO_CONVERSA]?.rotulo ?? estado,
    valor: qtd,
  })).sort((a, b) => b.valor - a.valor);

  return (
    <div className="space-y-4">
      <FiltroPeriodo rotulo={periodo.rotulo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Mensagens recebidas" valor={num(m.mensagens_recebidas)} icone={MessageSquare} tom="brand" />
        <StatCard rotulo="Conversas conduzidas pelo bot" valor={num(comBot)} icone={Bot} tom="info"
          sub={`${num(conversas.length - comBot)} com atendente`} />
        <StatCard rotulo="Conversão do funil" valor={pct(m.taxa_conversao)} icone={Target} tom="ok" destaque />
        <StatCard rotulo="1ª resposta" valor={`${num(m.tempo_primeira_resposta)} min`} icone={Clock} tom="gold" />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader titulo="Leads x pedidos" icone={TrendingUp} descricao={periodo.rotulo} />
          <div className="p-2 pr-4"><GraficoPedidosLeads dados={serie} /></div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Resultado do bot" icone={Bot} />
          <div className="space-y-4 px-5 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-500">Faturamento originado</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ok-400">{brl(m.faturamento_bot)}</p>
              <Barra valor={participacao} tom="ok" className="mt-2" />
              <p className="mt-1 text-[11px] text-ink-500">{pct(participacao)} do faturamento total</p>
            </div>
            <div className="space-y-2 border-t border-[var(--linha)] pt-3">
              <Table>
                <tbody>
                  {[
                    ["Leads criados", num(m.leads)],
                    ["Leads ganhos", num(m.leads_ganhos)],
                    ["Leads perdidos", num(m.leads_perdidos)],
                    ["Conversas abertas", num(m.conversas_abertas)],
                    ["Aguardando cliente", num(m.conversas_aguardando)],
                    ["Não respondidas", num(m.conversas_nao_respondidas)],
                  ].map(([r, v]) => (
                    <Tr key={r}>
                      <Td className="px-0 text-xs text-ink-400">{r}</Td>
                      <Td className="px-0 text-right text-xs font-semibold tabular-nums text-ink-100">{v}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Onde as conversas param" icone={UserCheck}
            descricao="Estado atual da máquina de conversa" />
          <div className="p-3">
            {porEstado.length > 0
              ? <GraficoRosca dados={porEstado} altura={280} />
              : <p className="py-16 text-center text-xs text-ink-500">Sem conversas</p>}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Detalhamento por estado" icone={MessageSquare} />
          <div className="space-y-2.5 px-5 py-4">
            {porEstado.map((e) => (
              <div key={e.nome}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-300">{e.nome}</span>
                  <span className="font-semibold tabular-nums text-ink-100">
                    {e.valor} <span className="text-ink-500">
                      ({pct(conversas.length ? (e.valor / conversas.length) * 100 : 0, 0)})
                    </span>
                  </span>
                </div>
                <Barra valor={conversas.length ? (e.valor / conversas.length) * 100 : 0} tom="brand" className="mt-1" />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
