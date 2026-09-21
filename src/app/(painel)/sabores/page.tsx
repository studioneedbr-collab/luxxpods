import { Droplets } from "lucide-react";
import { Badge, Panel, PanelHeader, Table, Td, Th, Tr } from "@/components/ui";
import { Realtime } from "@/components/realtime";
import { getCatalogo } from "@/lib/data";
import { cn, num } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SaboresPage() {
  const catalogo = await getCatalogo();

  const porSabor = new Map<string, {
    sabor: string; produtos: number; estoque: number; disponiveis: number; marcas: Set<string>;
  }>();

  catalogo.forEach((c) => {
    const atual = porSabor.get(c.sabor) ?? {
      sabor: c.sabor, produtos: 0, estoque: 0, disponiveis: 0, marcas: new Set<string>(),
    };
    atual.produtos += 1;
    atual.estoque += c.estoque_total;
    if (c.estoque_disponivel > 0) atual.disponiveis += 1;
    if (c.marca) atual.marcas.add(c.marca);
    porSabor.set(c.sabor, atual);
  });

  const lista = [...porSabor.values()].sort((a, b) => b.estoque - a.estoque);

  return (
    <div className="space-y-3">
      <Realtime tabelas={["inventory", "product_flavors"]} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Sabores cadastrados" valor={num(lista.length)} />
        <Cartao rotulo="Combinações produto+sabor" valor={num(catalogo.length)} />
        <Cartao rotulo="Disponíveis agora" valor={num(catalogo.filter((c) => c.estoque_disponivel > 0).length)} tom="ok" />
        <Cartao rotulo="Esgotados" valor={num(catalogo.filter((c) => c.estoque_disponivel <= 0).length)} tom="bad" />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Sabores" icone={Droplets}
          descricao="Um sabor pode estar em vários modelos — o estoque é sempre por produto + sabor" />
        <Table>
          <thead>
            <tr>
              <Th>Sabor</Th>
              <Th>Marcas</Th>
              <Th className="text-center">Modelos</Th>
              <Th className="text-center">Com estoque</Th>
              <Th className="text-right">Peças</Th>
              <Th className="text-center">Situação</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => (
              <Tr key={s.sabor}>
                <Td className="font-medium text-ink-100">{s.sabor}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {[...s.marcas].map((m) => <Badge key={m} tom="neutro">{m}</Badge>)}
                  </div>
                </Td>
                <Td className="text-center tabular-nums text-ink-300">{s.produtos}</Td>
                <Td className="text-center">
                  <span className={cn(
                    "tabular-nums font-medium",
                    s.disponiveis === 0 ? "text-bad-400" : "text-ok-400",
                  )}>
                    {s.disponiveis}
                  </span>
                  <span className="text-ink-600">/{s.produtos}</span>
                </Td>
                <Td className="text-right font-semibold tabular-nums text-ink-100">{num(s.estoque)}</Td>
                <Td className="text-center">
                  <Badge tom={s.disponiveis > 0 ? "ok" : "bad"}>
                    {s.disponiveis > 0 ? "ofertado pelo bot" : "fora do catálogo"}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

function Cartao({ rotulo, valor, tom = "neutro" }: {
  rotulo: string; valor: string; tom?: "neutro" | "ok" | "bad";
}) {
  const cores = { neutro: "text-ink-100", ok: "text-ok-400", bad: "text-bad-400" };
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", cores[tom])}>{valor}</p>
    </Panel>
  );
}
