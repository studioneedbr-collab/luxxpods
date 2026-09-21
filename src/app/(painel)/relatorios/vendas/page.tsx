import { LineChart, Package, TrendingDown, TrendingUp } from "lucide-react";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { GraficoBarras } from "@/components/dashboard/charts";
import { Badge, Panel, PanelHeader, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { resolverPeriodo } from "@/lib/periodo";
import { brl, num } from "@/lib/utils";
import { getPedido, getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RelatorioVendasPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));
  const pedidos = await getPedidos(300);

  const noPeriodo = pedidos.filter(
    (p) => +new Date(p.created_at) >= +periodo.inicio &&
           +new Date(p.created_at) <= +periodo.fim &&
           p.status_pedido !== "cancelado",
  );

  // agrega itens de todos os pedidos do período
  const detalhes = await Promise.all(noPeriodo.slice(0, 120).map((p) => getPedido(p.id)));

  const porProduto = new Map<string, { nome: string; qtd: number; receita: number; lucro: number }>();
  detalhes.forEach((p) => {
    p?.itens?.forEach((i) => {
      const chave = `${i.produto_nome} · ${i.sabor_nome}`;
      const atual = porProduto.get(chave) ?? { nome: chave, qtd: 0, receita: 0, lucro: 0 };
      atual.qtd += i.quantidade;
      atual.receita += i.subtotal;
      atual.lucro += i.subtotal - i.custo_unitario * i.quantidade;
      porProduto.set(chave, atual);
    });
  });

  const ranking = [...porProduto.values()].sort((a, b) => b.receita - a.receita);
  const top = ranking.slice(0, 10).map((r) => ({ item: r.nome.slice(0, 26), qtd: r.qtd }));
  const receita = noPeriodo.reduce((a, p) => a + p.total, 0);

  return (
    <div className="space-y-4">
      <FiltroPeriodo rotulo={periodo.rotulo} />

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Produtos mais vendidos" icone={TrendingUp}
            descricao={`${periodo.rotulo} · ${num(noPeriodo.length)} pedidos · ${brl(receita)}`} />
          {top.length === 0 ? (
            <Vazio icone={Package} titulo="Sem vendas no período" />
          ) : (
            <div className="p-3"><GraficoBarras dados={top} chaveX="item" chaveY="qtd" altura={290} /></div>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader titulo="Ranking por receita" icone={LineChart}
            descricao="Quanto cada combinação produto + sabor gerou" />
          {ranking.length === 0 ? (
            <Vazio icone={Package} titulo="Sem dados" />
          ) : (
            <div className="max-h-[330px] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th><Th>Produto · Sabor</Th>
                    <Th className="text-right">Un</Th>
                    <Th className="text-right">Receita</Th>
                    <Th className="text-right">Lucro</Th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <Tr key={r.nome}>
                      <Td className="tabular-nums text-ink-500">{i + 1}</Td>
                      <Td className="truncate font-medium text-ink-100">{r.nome}</Td>
                      <Td className="text-right tabular-nums text-ink-300">{r.qtd}</Td>
                      <Td className="text-right font-semibold tabular-nums text-ink-100">{brl(r.receita)}</Td>
                      <Td className="text-right tabular-nums text-ok-400">{brl(r.lucro)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Panel>
      </div>

      {ranking.length > 0 && (
        <Panel>
          <PanelHeader titulo="Menos vendidos" icone={TrendingDown}
            descricao="Candidatos a promoção ou descontinuação" />
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {[...ranking].reverse().slice(0, 12).map((r) => (
              <Badge key={r.nome} tom="neutro">
                {r.nome} · {r.qtd} un
              </Badge>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
