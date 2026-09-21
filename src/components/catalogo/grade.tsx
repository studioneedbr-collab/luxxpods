"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle, Boxes, Check, Minus, Package, Plus, Search, Ban, CircleCheck,
} from "lucide-react";
import { ajustarEstoque, alternarSabor } from "@/lib/actions";
import { Badge, Panel, Select, Table, Td, Th, Tr, Vazio, Barra } from "@/components/ui";
import { brl, cn, num, pct } from "@/lib/utils";
import type { ItemCatalogo } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { BotaoExportar } from "@/components/ui/botao-exportar";

type Visao = "grade" | "lista";
type Filtro = "todos" | "disponiveis" | "baixo" | "esgotados" | "inativos";

export function GradeCatalogo({ itens }: { itens: ItemCatalogo[] }) {
  const [dados, setDados] = useState(itens);
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("todas");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [visao, setVisao] = useState<Visao>("grade");
  const [salvando, iniciar] = useTransition();
  const toast = useToast();

  const marcas = useMemo(
    () => [...new Set(dados.map((d) => d.marca).filter(Boolean))].sort() as string[],
    [dados],
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.filter((d) => {
      if (marca !== "todas" && d.marca !== marca) return false;
      if (filtro === "disponiveis" && d.estoque_disponivel <= 0) return false;
      if (filtro === "baixo" && !(d.estoque_disponivel > 0 && d.estoque_disponivel <= d.estoque_minimo)) return false;
      if (filtro === "esgotados" && d.estoque_disponivel > 0) return false;
      if (filtro === "inativos" && d.sabor_ativo && d.produto_status === "ativo") return false;
      if (!t) return true;
      return [d.produto, d.sabor, d.marca, d.sku].some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [dados, busca, marca, filtro]);

  const porProduto = useMemo(() => {
    const mapa = new Map<string, ItemCatalogo[]>();
    filtrados.forEach((d) => {
      const lista = mapa.get(d.product_id) ?? [];
      lista.push(d);
      mapa.set(d.product_id, lista);
    });
    return [...mapa.values()].sort((a, b) =>
      (a[0].marca ?? "").localeCompare(b[0].marca ?? "") || a[0].produto.localeCompare(b[0].produto));
  }, [filtrados]);

  function mudarEstoque(item: ItemCatalogo, delta: number) {
    const novo = Math.max(0, item.estoque_total + delta);
    setDados((l) => l.map((d) =>
      d.product_flavor_id === item.product_flavor_id
        ? { ...d, estoque_total: novo,
            estoque_disponivel: Math.max(0, novo - d.estoque_reservado),
            vendavel: novo - d.estoque_reservado > 0 && d.sabor_ativo && d.produto_status === "ativo" }
        : d));
    iniciar(async () => {
      const r = await ajustarEstoque(item.product_flavor_id, novo);
      if (!r.ok) {
        setDados(itens);
        toast.erro("Não consegui ajustar o estoque", r.erro);
      }
    });
  }

  function mudarAtivo(item: ItemCatalogo) {
    const ativo = !item.sabor_ativo;
    setDados((l) => l.map((d) =>
      d.product_flavor_id === item.product_flavor_id
        ? { ...d, sabor_ativo: ativo, vendavel: ativo && d.estoque_disponivel > 0 && d.produto_status === "ativo" }
        : d));
    iniciar(async () => {
      const r = await alternarSabor(item.product_flavor_id, ativo);
      if (r.ok) {
        toast.ok(
          ativo ? `${item.sabor} ativado` : `${item.sabor} desativado`,
          ativo ? "Volta a ser oferecido pelo bot" : "O bot deixa de oferecer este sabor",
        );
      } else {
        setDados(itens);
        toast.erro("Não consegui alterar o sabor", r.erro);
      }
    });
  }

  const resumo = {
    skus: filtrados.length,
    pecas: filtrados.reduce((a, d) => a + d.estoque_total, 0),
    vendaveis: filtrados.filter((d) => d.vendavel).length,
    esgotados: filtrados.filter((d) => d.estoque_disponivel <= 0).length,
  };

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, sabor ou SKU…"
            className="h-9 w-full rounded-lg bg-white/4 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>

        <Select value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="todas">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>

        <Select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          <option value="todos">Todos os itens</option>
          <option value="disponiveis">Com estoque</option>
          <option value="baixo">Estoque baixo</option>
          <option value="esgotados">Esgotados</option>
          <option value="inativos">Inativos</option>
        </Select>

        <BotaoExportar
          itens={filtrados}
          nomeArquivo="catalogo-estoque"
          colunas={[
            { cabecalho: "Marca", valor: (c) => c.marca },
            { cabecalho: "Produto", valor: (c) => c.produto },
            { cabecalho: "Modelo", valor: (c) => c.modelo },
            { cabecalho: "Sabor", valor: (c) => c.sabor },
            { cabecalho: "SKU", valor: (c) => c.sku },
            { cabecalho: "Puffs", valor: (c) => c.puffs },
            { cabecalho: "Preço", valor: (c) => c.preco },
            { cabecalho: "Custo médio", valor: (c) => c.custo_medio },
            { cabecalho: "Margem %", valor: (c) => (c.preco > 0 ? ((c.preco - c.custo) / c.preco) * 100 : 0) },
            { cabecalho: "Estoque total", valor: (c) => c.estoque_total },
            { cabecalho: "Reservado", valor: (c) => c.estoque_reservado },
            { cabecalho: "Disponível", valor: (c) => c.estoque_disponivel },
            { cabecalho: "Estoque mínimo", valor: (c) => c.estoque_minimo },
            { cabecalho: "Vendável pelo bot", valor: (c) => c.vendavel },
          ]}
        />

        <div className="flex rounded-lg bg-white/4 p-0.5 ring-1 ring-inset ring-white/10">
          {(["grade", "lista"] as Visao[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition",
                visao === v ? "bg-brand-500 text-white" : "text-ink-400 hover:text-ink-200",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini rotulo="SKUs listados" valor={num(resumo.skus)} icone={Boxes} />
        <Mini rotulo="Peças em estoque" valor={num(resumo.pecas)} icone={Package} tom="ok" />
        <Mini rotulo="Vendáveis pelo bot" valor={num(resumo.vendaveis)} icone={CircleCheck} tom="brand" />
        <Mini rotulo="Esgotados" valor={num(resumo.esgotados)} icone={AlertTriangle}
          tom={resumo.esgotados > 0 ? "bad" : "ok"} />
      </div>

      {filtrados.length === 0 && (
        <Panel>
          <Vazio icone={Package} titulo="Nada encontrado" descricao="Ajuste a busca ou os filtros acima." />
        </Panel>
      )}

      {visao === "grade" && porProduto.map((grupo) => {
        const p = grupo[0];
        const total = grupo.reduce((a, g) => a + g.estoque_total, 0);
        const disponiveis = grupo.filter((g) => g.estoque_disponivel > 0).length;
        return (
          <Panel key={p.product_id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/6 px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-700/10 text-xs font-bold text-brand-200 ring-1 ring-inset ring-brand-500/20">
                {(p.marca ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-100">{p.produto}</p>
                <p className="text-[11px] text-ink-500">
                  {p.marca} · {p.puffs ? `${num(p.puffs)} puffs` : "—"} · {grupo.length} sabores
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums text-ink-100">{brl(p.preco)}</p>
                <p className="text-[11px] tabular-nums text-ink-500">
                  custo {brl(p.custo)} · margem {pct(p.preco > 0 ? ((p.preco - p.custo) / p.preco) * 100 : 0, 0)}
                </p>
              </div>
              <Badge tom={disponiveis > 0 ? "ok" : "bad"}>
                {disponiveis > 0 ? `${disponiveis} disponíveis` : "sem sabores"}
              </Badge>
              <Badge tom="neutro">{num(total)} un</Badge>
            </div>

            <div className="grid gap-px bg-white/4 sm:grid-cols-2 xl:grid-cols-3">
              {grupo.map((item) => {
                const critico = item.estoque_disponivel <= item.estoque_minimo;
                const zerado = item.estoque_disponivel <= 0;
                return (
                  <div key={item.product_flavor_id} className="bg-ink-900/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn(
                          "truncate text-xs font-medium",
                          item.sabor_ativo ? "text-ink-200" : "text-ink-500 line-through",
                        )}>
                          {item.sabor}
                        </p>
                        <p className="truncate text-[10px] tabular-nums text-ink-500">{item.sku}</p>
                      </div>
                      <button
                        onClick={() => mudarAtivo(item)}
                        disabled={salvando}
                        title={item.sabor_ativo ? "Desativar sabor" : "Ativar sabor"}
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-md transition",
                          item.sabor_ativo
                            ? "bg-ok-500/15 text-ok-400 hover:bg-ok-500/25"
                            : "bg-white/6 text-ink-500 hover:bg-white/10",
                        )}
                      >
                        {item.sabor_ativo ? <Check className="size-3" /> : <Ban className="size-3" />}
                      </button>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => mudarEstoque(item, -1)}
                        disabled={salvando || item.estoque_total <= 0}
                        className="grid size-6 place-items-center rounded-md bg-white/6 text-ink-300 transition hover:bg-white/12 disabled:opacity-30"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className={cn(
                        "min-w-[46px] rounded-md px-2 py-1 text-center text-xs font-bold tabular-nums",
                        zerado ? "bg-bad-500/12 text-bad-400"
                          : critico ? "bg-warn-500/12 text-warn-400"
                            : "bg-white/6 text-ink-100",
                      )}>
                        {item.estoque_disponivel}
                      </span>
                      <button
                        onClick={() => mudarEstoque(item, +1)}
                        disabled={salvando}
                        className="grid size-6 place-items-center rounded-md bg-white/6 text-ink-300 transition hover:bg-white/12"
                      >
                        <Plus className="size-3" />
                      </button>
                      {item.estoque_reservado > 0 && (
                        <span className="ml-auto text-[10px] tabular-nums text-warn-400">
                          {item.estoque_reservado} reservada{item.estoque_reservado > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <Barra
                      valor={Math.min(100, (item.estoque_disponivel / Math.max(item.estoque_minimo * 4, 1)) * 100)}
                      tom={zerado ? "bad" : critico ? "warn" : "ok"}
                      className="mt-2"
                    />
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}

      {visao === "lista" && filtrados.length > 0 && (
        <Panel className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Marca</Th><Th>Produto</Th><Th>Sabor</Th><Th>SKU</Th>
                <Th className="text-right">Preço</Th>
                <Th className="text-right">Custo</Th>
                <Th className="text-right">Margem</Th>
                <Th className="text-center">Disp.</Th>
                <Th className="text-center">Res.</Th>
                <Th className="text-center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d) => (
                <Tr key={d.product_flavor_id}>
                  <Td className="text-ink-400">{d.marca}</Td>
                  <Td className="font-medium text-ink-100">{d.produto}</Td>
                  <Td>{d.sabor}</Td>
                  <Td className="text-[11px] tabular-nums text-ink-500">{d.sku}</Td>
                  <Td className="text-right tabular-nums">{brl(d.preco)}</Td>
                  <Td className="text-right tabular-nums text-ink-400">{brl(d.custo)}</Td>
                  <Td className="text-right tabular-nums text-ok-400">
                    {pct(d.preco > 0 ? ((d.preco - d.custo) / d.preco) * 100 : 0, 0)}
                  </Td>
                  <Td className="text-center">
                    <span className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                      d.estoque_disponivel <= 0 ? "bg-bad-500/12 text-bad-400"
                        : d.estoque_disponivel <= d.estoque_minimo ? "bg-warn-500/12 text-warn-400"
                          : "text-ink-100",
                    )}>
                      {d.estoque_disponivel}
                    </span>
                  </Td>
                  <Td className="text-center tabular-nums text-ink-500">{d.estoque_reservado || "—"}</Td>
                  <Td className="text-center">
                    <Badge tom={d.vendavel ? "ok" : "bad"}>
                      {d.vendavel ? "vendável" : d.sabor_ativo ? "esgotado" : "inativo"}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

function Mini({
  rotulo, valor, icone: Icone, tom = "neutro",
}: {
  rotulo: string; valor: string;
  icone: React.ComponentType<{ className?: string }>;
  tom?: "neutro" | "ok" | "bad" | "brand";
}) {
  const cores = {
    neutro: "text-ink-300", ok: "text-ok-400", bad: "text-bad-400", brand: "text-brand-300",
  };
  return (
    <Panel className="flex items-center gap-3 p-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-white/5", cores[tom])}>
        <Icone className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
        <p className="text-base font-bold tabular-nums text-ink-100">{valor}</p>
      </div>
    </Panel>
  );
}
