import {
  BarChart3, Banknote, PiggyBank, ShoppingBag, Target, Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { GraficoBarras, GraficoFaturamento } from "@/components/dashboard/charts";
import { FunilPedidos } from "@/components/dashboard/funil";
import { Panel, PanelHeader, Table, Td, Tr } from "@/components/ui";
import { resolverPeriodo } from "@/lib/periodo";
import { brl, num, pct } from "@/lib/utils";
import { getCatalogo, getFunil, getMetricas, getPedidos, getResumoEstoque, getSerie } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));

  const [m, serie, funil, estoque, pedidos, catalogo] = await Promise.all([
    getMetricas(periodo.inicio, periodo.fim),
    getSerie(periodo.inicio, periodo.fim),
    getFunil(),
    getResumoEstoque(),
    getPedidos(300),
    getCatalogo(),
  ]);

  const noPeriodo = pedidos.filter(
    (p) => +new Date(p.created_at) >= +periodo.inicio &&
           +new Date(p.created_at) <= +periodo.fim &&
           p.status_pedido !== "cancelado",
  );

  const porDiaSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia, i) => ({
    dia,
    valor: noPeriodo
      .filter((p) => new Date(p.created_at).getDay() === i)
      .reduce((a, p) => a + p.total, 0),
  }));

  const margem = m.faturamento > 0 ? (m.lucro_bruto / m.faturamento) * 100 : 0;

  return (
    <div className="space-y-4">
      <FiltroPeriodo rotulo={periodo.rotulo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Faturamento" valor={brl(m.faturamento)} icone={Banknote} tom="ok" destaque />
        <StatCard rotulo="Pedidos" valor={num(m.pedidos)} icone={ShoppingBag} tom="brand" />
        <StatCard rotulo="Ticket médio" valor={brl(m.ticket_medio)} icone={Target} tom="info" />
        <StatCard rotulo="Lucro bruto" valor={brl(m.lucro_bruto)} icone={PiggyBank} tom="gold"
          sub={`margem ${pct(margem)}`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader titulo="Evolução do faturamento" icone={BarChart3} descricao={periodo.rotulo} />
          <div className="p-2 pr-4"><GraficoFaturamento dados={serie} /></div>
        </Panel>
        <Panel>
          <PanelHeader titulo="Funil" icone={Target} />
          <FunilPedidos etapas={funil} />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Faturamento por dia da semana" icone={BarChart3}
            descricao="Onde a operação vende mais" />
          <div className="p-3">
            <GraficoBarras dados={porDiaSemana} chaveX="dia" chaveY="valor" moeda altura={230} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Indicadores consolidados" icone={Users} />
          <Table>
            <tbody>
              {[
                ["Faturamento", brl(m.faturamento)],
                ["CMV (custo da mercadoria)", brl(m.cmv)],
                ["Lucro bruto estimado", brl(m.lucro_bruto)],
                ["Margem estimada", pct(margem)],
                ["Pedidos válidos", num(m.pedidos)],
                ["Pedidos cancelados", num(m.pedidos_cancelados)],
                ["Taxa de cancelamento", pct(m.taxa_cancelamento)],
                ["Pedidos entregues", num(m.pedidos_entregues)],
                ["Leads gerados", num(m.leads)],
                ["Leads ganhos", num(m.leads_ganhos)],
                ["Taxa de conversão", pct(m.taxa_conversao)],
                ["Clientes novos", num(m.clientes_novos)],
                ["Clientes recorrentes", num(m.clientes_recorrentes)],
                ["Base total de clientes", num(m.clientes_total)],
                ["Valor do estoque (custo)", brl(estoque.custo_estoque)],
                ["Venda potencial do estoque", brl(estoque.valor_venda_potencial)],
                ["SKUs sem estoque", num(estoque.sem_estoque)],
                ["SKUs com estoque baixo", num(estoque.estoque_baixo)],
                ["Peças em estoque", num(estoque.pecas)],
                ["Combinações produto+sabor", num(catalogo.length)],
              ].map(([rotulo, valor]) => (
                <Tr key={rotulo}>
                  <Td className="text-ink-400">{rotulo}</Td>
                  <Td className="text-right font-semibold tabular-nums text-ink-100">{valor}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
