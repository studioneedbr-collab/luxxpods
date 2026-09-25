"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Boxes, Check, Minus, Package, Plus, Search, Ban, CircleCheck,
  Trash2, Droplets,
} from "lucide-react";
import { ajustarEstoque, alternarSabor } from "@/lib/actions";
import { criarSabor, excluirSabor } from "@/lib/actions-cadastro";
import {
  Badge, Button, Input, Panel, Select, Table, Td, Th, Tr, Vazio, Barra,
} from "@/components/ui";
import { Campo, Confirmar, Modal } from "@/components/ui/modal";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, dataHora, num, pct } from "@/lib/utils";
import type { ItemCatalogo, Movimento } from "@/lib/types";
import { MOVIMENTO } from "@/lib/labels";
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
  const [novoSabor, setNovoSabor] = useState<{ produtoId: string; produto: string } | null>(null);
  const [excluindo, setExcluindo] = useState<ItemCatalogo | null>(null);
  const [vendoHistorico, setVendoHistorico] = useState<ItemCatalogo | null>(null);
  const router = useRouter();
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

  function adicionarSabor(produtoId: string, nome: string) {
    setNovoSabor(null);
    iniciar(async () => {
      const r = await criarSabor(produtoId, nome);
      if (r.ok) {
        toast.ok(`Sabor "${nome}" adicionado`, "Dê entrada no estoque para o bot começar a oferecer");
        router.refresh();
      } else {
        toast.erro("Não consegui adicionar o sabor", r.erro);
      }
    });
  }

  function removerSabor(item: ItemCatalogo) {
    setExcluindo(null);
    setDados((l) => l.filter((d) => d.product_flavor_id !== item.product_flavor_id));
    iniciar(async () => {
      const r = await excluirSabor(item.product_flavor_id);
      if (r.ok) toast.ok("Sabor removido", `${item.produto} · ${item.sabor}`);
      else {
        setDados(itens);
        toast.erro("Não consegui remover", r.erro);
      }
    });
  }

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 50);

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
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
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

        <div className="flex rounded-lg bg-ink-850 p-0.5 ring-1 ring-inset ring-[var(--linha)]">
          {(["grade", "lista"] as Visao[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition",
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
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--linha)] px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/25 to-brand-700/10 text-[11px] font-bold text-brand-200 ring-1 ring-inset ring-brand-500/20">
                {(p.marca ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink-100">{p.produto}</p>
                <p className="text-[11px] text-ink-500">
                  {p.marca} · {p.puffs ? `${num(p.puffs)} puffs` : "—"} · {grupo.length} sabores
                </p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-bold tabular-nums text-ink-100">{brl(p.preco)}</p>
                <p className="text-[11px] tabular-nums text-ink-500">
                  custo {brl(p.custo)} · margem {pct(p.preco > 0 ? ((p.preco - p.custo) / p.preco) * 100 : 0, 0)}
                </p>
              </div>
              <Badge tom={disponiveis > 0 ? "ok" : "bad"}>
                {disponiveis > 0 ? `${disponiveis} disponíveis` : "sem sabores"}
              </Badge>
              <Badge tom="neutro">{num(total)} un</Badge>
              <Button
                tamanho="sm"
                variante="fantasma"
                onClick={() => setNovoSabor({ produtoId: p.product_id, produto: p.produto })}
                title={`Adicionar sabor a ${p.produto}`}
              >
                <Plus className="size-3.5" /> sabor
              </Button>
            </div>

            <div className="grid gap-px bg-ink-850 sm:grid-cols-2 xl:grid-cols-3">
              {grupo.map((item) => {
                const critico = item.estoque_disponivel <= item.estoque_minimo;
                const zerado = item.estoque_disponivel <= 0;
                return (
                  <div key={item.product_flavor_id} className="bg-ink-900 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn(
                          "truncate text-[11px] font-medium",
                          item.sabor_ativo ? "text-ink-200" : "text-ink-500 line-through",
                        )}>
                          {item.sabor}
                        </p>
                        <p className="truncate text-[10px] tabular-nums text-ink-500">{item.sku}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => mudarAtivo(item)}
                          disabled={salvando}
                          title={item.sabor_ativo ? "Desativar sabor" : "Ativar sabor"}
                          aria-label={item.sabor_ativo ? `Desativar ${item.sabor}` : `Ativar ${item.sabor}`}
                          className={cn(
                            "grid size-6 place-items-center rounded-md transition-colors",
                            item.sabor_ativo
                              ? "bg-ok-500/15 text-ok-400 hover:bg-ok-500/25"
                              : "bg-ink-800 text-ink-500 hover:bg-ink-700",
                          )}
                        >
                          {item.sabor_ativo ? <Check className="size-3" /> : <Ban className="size-3" />}
                        </button>
                        <button
                          onClick={() => setExcluindo(item)}
                          disabled={salvando}
                          title="Remover sabor deste produto"
                          aria-label={`Remover ${item.sabor}`}
                          className="grid size-6 place-items-center rounded-md text-ink-600 transition-colors hover:bg-bad-500/15 hover:text-bad-400"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => mudarEstoque(item, -1)}
                        disabled={salvando || item.estoque_total <= 0}
                        className="grid size-6 place-items-center rounded-md bg-ink-800 text-ink-300 transition hover:bg-ink-700 disabled:opacity-30"
                      >
                        <Minus className="size-3" />
                      </button>
                      <button
                        onClick={() => setVendoHistorico(item)}
                        title="Ver as movimentações deste sabor"
                        className={cn(
                          "min-w-[46px] rounded-md px-2 py-1 text-center text-[11px] font-bold tabular-nums transition-colors",
                          zerado ? "bg-bad-500/12 text-bad-400 hover:bg-bad-500/20"
                            : critico ? "bg-warn-500/12 text-warn-400 hover:bg-warn-500/20"
                              : "bg-ink-800 text-ink-100 hover:bg-ink-700",
                        )}
                      >
                        {item.estoque_disponivel}
                      </button>
                      <button
                        onClick={() => mudarEstoque(item, +1)}
                        disabled={salvando}
                        className="grid size-6 place-items-center rounded-md bg-ink-800 text-ink-300 transition hover:bg-ink-700"
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

      {vendoHistorico && (
        <HistoricoSabor
          item={vendoHistorico}
          onFechar={() => setVendoHistorico(null)}
        />
      )}

      {novoSabor && (
        <FormSabor
          produto={novoSabor.produto}
          onFechar={() => setNovoSabor(null)}
          onSalvar={(nome) => adicionarSabor(novoSabor.produtoId, nome)}
        />
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Remover ${excluindo?.sabor}?`}
        mensagem={
          excluindo && excluindo.estoque_total > 0
            ? `Ainda há ${excluindo.estoque_total} unidade(s) deste sabor em estoque. Zere o estoque antes, ou apenas desative para o bot parar de oferecer.`
            : `O sabor sai de ${excluindo?.produto}. Os pedidos antigos continuam mostrando o que foi vendido.`
        }
        textoConfirmar="Remover"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && removerSabor(excluindo)}
      />

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
              {visiveis.map((d) => (
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
                      "rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums",
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
          <Paginacao {...paginacao} rotulo="itens" />
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
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-ink-850", cores[tom])}>
        <Icone className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
        <p className="text-[15px] font-bold tabular-nums text-ink-100">{valor}</p>
      </div>
    </Panel>
  );
}

/** Sabor novo para um modelo. Entra zerado — o estoque vem pela nota. */
function FormSabor({
  produto, onFechar, onSalvar,
}: { produto: string; onFechar: () => void; onSalvar: (nome: string) => void }) {
  const [nome, setNome] = useState("");

  return (
    <Modal
      aberto
      onFechar={onFechar}
      largura="sm"
      titulo="Adicionar sabor"
      descricao={produto}
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" disabled={!nome.trim()} onClick={() => onSalvar(nome.trim())}>
            <Check className="size-3.5" /> Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Nome do sabor" dica="como o cliente vai ver na conversa">
          <Input value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Watermelon Ice" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && nome.trim()) onSalvar(nome.trim()); }} />
        </Campo>

        <p className="flex items-start gap-2 rounded-md bg-ink-850 px-3 py-2.5 text-[11px] leading-relaxed text-ink-400">
          <Droplets className="mt-px size-3.5 shrink-0 text-ink-500" />
          O sabor nasce com estoque zero, então o bot ainda não oferece.
          Dê entrada pela nota de mercadoria ou ajuste aqui no catálogo.
        </p>
      </div>
    </Modal>
  );
}

/**
 * O histórico daquele SKU, aberto pelo próprio número do estoque.
 * Ver o saldo sem ver como ele chegou ali é o que faz ninguém confiar no
 * número — aqui cada entrada e saída aparece com o antes e o depois.
 */
function HistoricoSabor({
  item, onFechar,
}: { item: ItemCatalogo; onFechar: () => void }) {
  const [movimentos, setMovimentos] = useState<Movimento[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/movimentos?pf=${item.product_flavor_id}`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setMovimentos(d.movimentos ?? []); })
      .catch(() => { if (vivo) setMovimentos([]); });
    return () => { vivo = false; };
  }, [item.product_flavor_id]);

  return (
    <Modal
      aberto
      onFechar={onFechar}
      largura="lg"
      titulo={`${item.produto} · ${item.sabor}`}
      descricao="Toda entrada e saída, com o saldo antes e depois"
      rodape={<Button variante="fantasma" onClick={onFechar}>Fechar</Button>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Em estoque", num(item.estoque_total), "text-ink-100"],
            ["Reservado", num(item.estoque_reservado), "text-warn-400"],
            ["Disponível", num(item.estoque_disponivel), "text-ok-400"],
            ["Mínimo", num(item.estoque_minimo), "text-ink-400"],
          ].map(([rotulo, valor, cor]) => (
            <div key={rotulo} className="rounded-md bg-ink-950 px-3 py-2.5">
              <p className="rotulo truncate">{rotulo}</p>
              <p className={cn("numero mt-0.5 text-[15px]", cor)}>{valor}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-ink-950 px-3 py-2.5">
            <p className="rotulo">Custo médio</p>
            <p className="numero mt-0.5 text-[15px] text-ink-200">{brl(item.custo_medio)}</p>
          </div>
          <div className="rounded-md bg-ink-950 px-3 py-2.5">
            <p className="rotulo">Preço de venda</p>
            <p className="numero mt-0.5 text-[15px] text-ink-100">{brl(item.preco)}</p>
          </div>
        </div>

        {movimentos === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 rounded-md" />)}
          </div>
        ) : movimentos.length === 0 ? (
          <Vazio icone={Package} titulo="Sem movimentações"
            descricao="Este sabor ainda não teve entrada nem saída registrada." />
        ) : (
          <div className="overflow-hidden rounded-md ring-1 ring-inset ring-[var(--linha)]">
            <Table>
              <thead>
                <tr>
                  <Th>Quando</Th><Th>Tipo</Th>
                  <Th className="text-right">Qtd</Th>
                  <Th className="text-right">Antes</Th>
                  <Th className="text-right">Depois</Th>
                  <Th>Observação</Th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => {
                  const mv = MOVIMENTO[m.tipo];
                  return (
                    <Tr key={m.id}>
                      <Td className="whitespace-nowrap text-[11px] tabular-nums text-ink-400">
                        {dataHora(m.created_at)}
                      </Td>
                      <Td><Badge tom={mv.tom}>{mv.rotulo}</Badge></Td>
                      <Td className={cn(
                        "text-right font-semibold tabular-nums",
                        mv.sinal > 0 ? "text-ok-400" : mv.sinal < 0 ? "text-bad-400" : "text-ink-300",
                      )}>
                        {mv.sinal > 0 ? "+" : mv.sinal < 0 ? "−" : ""}{m.quantidade}
                      </Td>
                      <Td className="text-right tabular-nums text-ink-500">{m.saldo_anterior}</Td>
                      <Td className="text-right tabular-nums text-ink-200">{m.saldo_posterior}</Td>
                      <Td className="max-w-[200px] truncate text-[11px] text-ink-500">
                        {m.observacao ?? "—"}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </Modal>
  );
}
