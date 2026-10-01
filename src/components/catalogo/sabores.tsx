"use client";

import { useMemo, useState } from "react";
import { Droplets, Search } from "lucide-react";
import { Badge, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { ExportarCatalogo } from "@/components/catalogo/botoes-exportar";
import { cn, num } from "@/lib/utils";
import type { ItemCatalogo } from "@/lib/types";

interface LinhaSabor {
  sabor: string;
  produtos: number;
  estoque: number;
  disponiveis: number;
  marcas: string[];
}

/**
 * Sabores vistos de cima: um sabor pode estar em vários modelos, e o que
 * interessa aqui é onde ele ainda tem estoque — o estoque em si é por
 * produto + sabor, e se ajusta no catálogo.
 */
export function TelaSabores({ catalogo }: { catalogo: ItemCatalogo[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [marca, setMarca] = useState("todas");

  const marcas = useMemo(
    () => [...new Set(catalogo.map((c) => c.marca).filter(Boolean))].sort() as string[],
    [catalogo],
  );

  const linhas = useMemo(() => {
    const porSabor = new Map<string, LinhaSabor>();

    catalogo
      .filter((c) => marca === "todas" || c.marca === marca)
      .forEach((c) => {
        const atual = porSabor.get(c.sabor) ?? {
          sabor: c.sabor, produtos: 0, estoque: 0, disponiveis: 0, marcas: [],
        };
        atual.produtos += 1;
        atual.estoque += c.estoque_total;
        if (c.estoque_disponivel > 0) atual.disponiveis += 1;
        if (c.marca && !atual.marcas.includes(c.marca)) atual.marcas.push(c.marca);
        porSabor.set(c.sabor, atual);
      });

    const t = busca.trim().toLowerCase();
    return [...porSabor.values()]
      .filter((s) => {
        if (filtro === "disponiveis" && s.disponiveis === 0) return false;
        if (filtro === "esgotados" && s.disponiveis > 0) return false;
        if (!t) return true;
        return s.sabor.toLowerCase().includes(t);
      })
      .sort((a, b) => b.estoque - a.estoque);
  }, [catalogo, busca, filtro, marca]);

  const { visiveis, props: paginacao } = usePaginacao(linhas, 25);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Cartao rotulo="Sabores" valor={num(linhas.length)} />
        <Cartao rotulo="Combinações" valor={num(catalogo.length)} />
        <Cartao rotulo="Com estoque"
          valor={num(catalogo.filter((c) => c.estoque_disponivel > 0).length)} tom="ok" />
        <Cartao rotulo="Esgotadas"
          valor={num(catalogo.filter((c) => c.estoque_disponivel <= 0).length)} tom="bad" />
      </div>

      <Panel className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar sabor…"
            className="h-8 w-full rounded-md bg-ink-950 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Select value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="todas">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="disponiveis">Com estoque</option>
          <option value="esgotados">Esgotados</option>
        </Select>
        <ExportarCatalogo
          itens={linhas}
          nomeArquivo="sabores"
          colunas={[
            { cabecalho: "Sabor", valor: (s) => s.sabor },
            { cabecalho: "Marcas", valor: (s) => s.marcas.join(", ") },
            { cabecalho: "Modelos", valor: (s) => s.produtos },
            { cabecalho: "Com estoque", valor: (s) => s.disponiveis },
            { cabecalho: "Peças", valor: (s) => s.estoque },
          ]}
        />
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Sabores" icone={Droplets}
          descricao="O estoque é por produto + sabor — ajuste no catálogo" />
        {linhas.length === 0 ? (
          <Vazio icone={Droplets} titulo="Nenhum sabor" descricao="Ajuste a busca ou os filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sabor</Th><Th>Marcas</Th>
                <Th className="text-center">Modelos</Th>
                <Th className="text-center">Com estoque</Th>
                <Th className="text-right">Peças</Th>
                <Th className="text-center">Situação</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((s) => (
                <Tr key={s.sabor}>
                  <Td className="font-medium text-ink-100">{s.sabor}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.marcas.map((m) => <Badge key={m} tom="neutro">{m}</Badge>)}
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
                  <Td className="numero text-right text-ink-100">{num(s.estoque)}</Td>
                  <Td className="text-center">
                    <Badge tom={s.disponiveis > 0 ? "ok" : "bad"}>
                      {s.disponiveis > 0 ? "o bot oferece" : "fora do catálogo"}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="sabores" />
      </Panel>
    </div>
  );
}

function Cartao({ rotulo, valor, tom = "neutro" }: {
  rotulo: string; valor: string; tom?: "neutro" | "ok" | "bad";
}) {
  const cores = { neutro: "text-ink-100", ok: "text-ok-400", bad: "text-bad-400" };
  return (
    <div className="chapa px-4 py-3">
      <p className="rotulo">{rotulo}</p>
      <p className={cn("numero mt-0.5 text-[15px]", cores[tom])}>{valor}</p>
    </div>
  );
}
