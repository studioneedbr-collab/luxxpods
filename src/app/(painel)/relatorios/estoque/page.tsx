import { AlertTriangle, DollarSign, Package, PieChart } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { GraficoBarras, GraficoRosca } from "@/components/dashboard/charts";
import { Badge, Panel, PanelHeader, Table, Td, Th, Tr } from "@/components/ui";
import { brl, num } from "@/lib/utils";
import { getCatalogo, getResumoEstoque } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RelatorioEstoquePage() {
  const [catalogo, resumo] = await Promise.all([getCatalogo(), getResumoEstoque()]);

  const porMarca = new Map<string, { pecas: number; custo: number; venda: number; skus: number }>();
  catalogo.forEach((c) => {
    const k = c.marca ?? "Sem marca";
    const a = porMarca.get(k) ?? { pecas: 0, custo: 0, venda: 0, skus: 0 };
    a.pecas += c.estoque_total;
    a.custo += c.estoque_total * c.custo_medio;
    a.venda += c.estoque_total * c.preco;
    a.skus += 1;
    porMarca.set(k, a);
  });

  const marcas = [...porMarca.entries()].sort((a, b) => b[1].venda - a[1].venda);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Peças" valor={num(resumo.pecas)} icone={Package} tom="brand"
          sub={`${num(resumo.skus)} SKUs`} />
        <StatCard rotulo="Custo do estoque" valor={brl(resumo.custo_estoque)} icone={DollarSign} tom="info" />
        <StatCard rotulo="Venda potencial" valor={brl(resumo.valor_venda_potencial)} icone={PieChart} tom="ok"
          sub={`lucro potencial ${brl(resumo.valor_venda_potencial - resumo.custo_estoque)}`} />
        <StatCard rotulo="Alertas" valor={num(resumo.sem_estoque + resumo.estoque_baixo)} icone={AlertTriangle}
          tom={resumo.sem_estoque > 0 ? "bad" : "warn"}
          sub={`${num(resumo.sem_estoque)} esgotados · ${num(resumo.estoque_baixo)} baixos`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Peças por marca" icone={Package} />
          <div className="p-3">
            <GraficoBarras
              dados={marcas.map(([nome, v]) => ({ marca: nome, qtd: v.pecas }))}
              chaveX="marca" chaveY="qtd" altura={260}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader titulo="Valor de venda por marca" icone={DollarSign} />
          <div className="p-3">
            <GraficoRosca
              dados={marcas.map(([nome, v]) => ({ nome, valor: Math.round(v.venda) }))}
              altura={260}
            />
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Detalhamento por marca" icone={PieChart} />
        <Table>
          <thead>
            <tr>
              <Th>Marca</Th>
              <Th className="text-right">SKUs</Th>
              <Th className="text-right">Peças</Th>
              <Th className="text-right">Custo</Th>
              <Th className="text-right">Venda potencial</Th>
              <Th className="text-right">Lucro potencial</Th>
            </tr>
          </thead>
          <tbody>
            {marcas.map(([nome, v]) => (
              <Tr key={nome}>
                <Td className="font-medium text-ink-100">{nome}</Td>
                <Td className="text-right tabular-nums text-ink-400">{v.skus}</Td>
                <Td className="text-right tabular-nums text-ink-200">{num(v.pecas)}</Td>
                <Td className="text-right tabular-nums text-ink-400">{brl(v.custo)}</Td>
                <Td className="text-right tabular-nums text-ink-100">{brl(v.venda)}</Td>
                <Td className="text-right font-semibold tabular-nums text-ok-400">{brl(v.venda - v.custo)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader titulo="Produtos sem estoque" icone={AlertTriangle}
          descricao="Não são oferecidos pelo chatbot" />
        <div className="flex flex-wrap gap-1.5 px-5 py-4">
          {catalogo.filter((c) => c.estoque_disponivel <= 0).map((c) => (
            <Badge key={c.product_flavor_id} tom="bad">{c.produto} · {c.sabor}</Badge>
          ))}
          {catalogo.every((c) => c.estoque_disponivel > 0) && (
            <p className="text-[11px] text-ok-400">Nenhum item esgotado ✅</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
