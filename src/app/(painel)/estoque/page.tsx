import {
  AlertTriangle, Boxes, DollarSign, Package, TrendingUp, XCircle,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { GraficoBarras } from "@/components/dashboard/charts";
import { Badge, Panel, PanelHeader, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { TabelaMovimentos } from "@/components/estoque/movimentos";
import { Realtime } from "@/components/realtime";
import { brl, num } from "@/lib/utils";
import { getCatalogo, getMovimentos, getResumoEstoque } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const [catalogo, movimentos, resumo] = await Promise.all([
    getCatalogo(), getMovimentos(500), getResumoEstoque(),
  ]);

  const criticos = catalogo
    .filter((c) => c.estoque_disponivel <= c.estoque_minimo)
    .sort((a, b) => a.estoque_disponivel - b.estoque_disponivel);

  const maiores = [...catalogo]
    .sort((a, b) => b.estoque_total - a.estoque_total)
    .slice(0, 10)
    .map((c) => ({ item: `${c.marca} ${c.sabor}`.slice(0, 22), qtd: c.estoque_total }));

  const porMarca = new Map<string, { custo: number; venda: number }>();
  catalogo.forEach((c) => {
    if (!c.marca) return;
    const atual = porMarca.get(c.marca) ?? { custo: 0, venda: 0 };
    atual.custo += c.estoque_total * c.custo_medio;
    atual.venda += c.estoque_total * c.preco;
    porMarca.set(c.marca, atual);
  });

  const lucroPotencial = resumo.valor_venda_potencial - resumo.custo_estoque;

  return (
    <div className="space-y-4">
      <Realtime tabelas={["inventory", "inventory_movements"]} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Peças em estoque" valor={num(resumo.pecas)} icone={Package} tom="brand"
          sub={`${num(resumo.skus)} SKUs cadastrados`} />
        <StatCard rotulo="Custo do estoque" valor={brl(resumo.custo_estoque)} icone={DollarSign} tom="info"
          sub="quantidade × custo médio" />
        <StatCard rotulo="Venda potencial" valor={brl(resumo.valor_venda_potencial)} icone={TrendingUp} tom="ok"
          sub={`${brl(lucroPotencial)} de lucro potencial`} />
        <StatCard rotulo="Itens críticos" valor={num(criticos.length)} icone={AlertTriangle}
          tom={criticos.length > 0 ? "warn" : "ok"}
          sub={`${num(resumo.sem_estoque)} esgotados`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader titulo="Precisa repor agora" icone={XCircle}
            descricao="Itens no mínimo ou abaixo dele" />
          {criticos.length === 0 ? (
            <Vazio icone={Boxes} titulo="Estoque saudável" descricao="Nenhum item abaixo do mínimo configurado." />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Produto</Th><Th>Sabor</Th>
                    <Th className="text-center">Disp.</Th>
                    <Th className="text-center">Mín.</Th>
                    <Th className="text-right">Repor</Th>
                  </tr>
                </thead>
                <tbody>
                  {criticos.map((c) => {
                    const repor = Math.max(0, c.estoque_minimo * 4 - c.estoque_disponivel);
                    return (
                      <Tr key={c.product_flavor_id}>
                        <Td>
                          <p className="truncate font-medium text-ink-100">{c.produto}</p>
                          <p className="truncate text-[11px] text-ink-500">{c.marca}</p>
                        </Td>
                        <Td className="text-ink-300">{c.sabor}</Td>
                        <Td className="text-center">
                          <Badge tom={c.estoque_disponivel === 0 ? "bad" : "warn"}>
                            {c.estoque_disponivel}
                          </Badge>
                        </Td>
                        <Td className="text-center tabular-nums text-ink-500">{c.estoque_minimo}</Td>
                        <Td className="text-right tabular-nums font-semibold text-brand-300">
                          +{repor}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Panel>

        <div className="space-y-3">
          <Panel>
            <PanelHeader titulo="Maiores quantidades" icone={Boxes} descricao="Top 10 SKUs do inventário" />
            <div className="p-3">
              <GraficoBarras dados={maiores} chaveX="item" chaveY="qtd" altura={260} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader titulo="Valor por marca" icone={DollarSign} />
            <Table>
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th className="text-right">Custo</Th>
                  <Th className="text-right">Venda potencial</Th>
                  <Th className="text-right">Lucro</Th>
                </tr>
              </thead>
              <tbody>
                {[...porMarca.entries()]
                  .sort((a, b) => b[1].venda - a[1].venda)
                  .map(([marca, v]) => (
                    <Tr key={marca}>
                      <Td className="font-medium text-ink-100">{marca}</Td>
                      <Td className="text-right tabular-nums text-ink-400">{brl(v.custo)}</Td>
                      <Td className="text-right tabular-nums text-ink-200">{brl(v.venda)}</Td>
                      <Td className="text-right tabular-nums font-semibold text-ok-400">
                        {brl(v.venda - v.custo)}
                      </Td>
                    </Tr>
                  ))}
              </tbody>
            </Table>
          </Panel>
        </div>
      </div>

      <TabelaMovimentos movimentos={movimentos} />

    </div>
  );
}
