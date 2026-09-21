"use client";

import { useMemo, useState, useTransition } from "react";
import { Package, Pencil, Search, Star, X, Check } from "lucide-react";
import { alternarProduto, salvarProduto } from "@/lib/actions";
import { Badge, Button, Input, Panel, Select, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, num, pct } from "@/lib/utils";
import type { Produto } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

export function ListaProdutos({ produtos: iniciais }: { produtos: Produto[] }) {
  const [produtos, setProdutos] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("todas");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const marcas = useMemo(
    () => [...new Set(produtos.map((p) => p.marca).filter(Boolean))].sort() as string[],
    [produtos],
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (marca !== "todas" && p.marca !== marca) return false;
      if (!t) return true;
      return [p.nome, p.modelo, p.marca, p.sku].some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [produtos, busca, marca]);

  function alternar(p: Produto) {
    const ativo = p.status !== "ativo";
    setProdutos((l) => l.map((x) => (x.id === p.id ? { ...x, status: ativo ? "ativo" : "inativo" } : x)));
    iniciar(async () => {
      const r = await alternarProduto(p.id, ativo);
      if (r.ok) {
        toast.ok(
          ativo ? `${p.nome} ativado` : `${p.nome} desativado`,
          ativo ? undefined : "Produtos inativos não são oferecidos pelo chatbot",
        );
      } else {
        setProdutos(iniciais);
        toast.erro("Não consegui alterar o produto", r.erro);
      }
    });
  }

  function salvar(dados: { nome: string; preco: number; custo: number; descricao: string }) {
    if (!editando) return;
    const id = editando.id;
    setProdutos((l) => l.map((x) => (x.id === id
      ? { ...x, ...dados, margem: dados.preco > 0 ? ((dados.preco - dados.custo) / dados.preco) * 100 : 0 }
      : x)));
    setEditando(null);
    iniciar(async () => {
      const r = await salvarProduto(id, dados);
      if (r.ok) toast.ok("Produto salvo", `${dados.nome} · ${brl(dados.preco)}`);
      else {
        setProdutos(iniciais);
        toast.erro("Não consegui salvar o produto", r.erro);
      }
    });
  }

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 25);

  const totais = {
    ativos: filtrados.filter((p) => p.status === "ativo").length,
    estoque: filtrados.reduce((a, p) => a + p.estoque, 0),
    valorCusto: filtrados.reduce((a, p) => a + p.estoque * p.custo, 0),
    valorVenda: filtrados.reduce((a, p) => a + p.estoque * p.preco, 0),
  };

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, modelo ou SKU…"
            className="h-9 w-full rounded-lg bg-white/4 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>
        <Select value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="todas">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Badge tom="ok">{totais.ativos} ativos</Badge>
        <Badge tom="brand">{num(totais.estoque)} peças</Badge>
        <Badge tom="gold">{brl(totais.valorVenda)} em venda potencial</Badge>
      </Panel>

      <Panel className="overflow-hidden">
        {filtrados.length === 0 ? (
          <Vazio icone={Package} titulo="Nenhum produto" descricao="Ajuste os filtros ou cadastre um novo modelo." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th className="text-right">Puffs</Th>
                <Th className="text-right">Custo</Th>
                <Th className="text-right">Preço</Th>
                <Th className="text-right">Margem</Th>
                <Th className="text-center">Sabores</Th>
                <Th className="text-right">Estoque</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {p.destaque && <Star className="size-3 shrink-0 fill-gold-400 text-gold-400" />}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-100">{p.nome}</p>
                        <p className="truncate text-[11px] text-ink-500">{p.sku}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-ink-400">{p.marca ?? "—"}</Td>
                  <Td className="text-right tabular-nums text-ink-400">{p.puffs ? num(p.puffs) : "—"}</Td>
                  <Td className="text-right tabular-nums text-ink-400">{brl(p.custo)}</Td>
                  <Td className="text-right font-semibold tabular-nums text-ink-100">{brl(p.preco)}</Td>
                  <Td className="text-right">
                    <span className={cn(
                      "tabular-nums font-medium",
                      p.margem >= 45 ? "text-ok-400" : p.margem >= 30 ? "text-warn-400" : "text-bad-400",
                    )}>
                      {pct(p.margem, 0)}
                    </span>
                  </Td>
                  <Td className="text-center">
                    <span className="tabular-nums text-ink-300">
                      {p.sabores_disponiveis}
                      <span className="text-ink-600">/{p.sabores}</span>
                    </span>
                  </Td>
                  <Td className="text-right">
                    <span className={cn(
                      "tabular-nums font-semibold",
                      p.estoque === 0 ? "text-bad-400" : "text-ink-100",
                    )}>
                      {num(p.estoque)}
                    </span>
                  </Td>
                  <Td className="text-center">
                    <button onClick={() => alternar(p)}>
                      <Badge tom={p.status === "ativo" ? "ok" : "neutro"} ponto>
                        {p.status === "ativo" ? "ativo" : "inativo"}
                      </Badge>
                    </button>
                  </Td>
                  <Td className="text-right">
                    <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(p)}
                      aria-label={`Editar ${p.nome}`} title="Editar produto">
                      <Pencil className="size-3.5" />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="produtos" />
      </Panel>

      {editando && (
        <ModalEdicao produto={editando} onFechar={() => setEditando(null)} onSalvar={salvar} />
      )}
    </div>
  );
}

function ModalEdicao({
  produto, onFechar, onSalvar,
}: {
  produto: Produto;
  onFechar: () => void;
  onSalvar: (d: { nome: string; preco: number; custo: number; descricao: string }) => void;
}) {
  const [nome, setNome] = useState(produto.nome);
  const [preco, setPreco] = useState(String(produto.preco));
  const [custo, setCusto] = useState(String(produto.custo));
  const [descricao, setDescricao] = useState(produto.descricao ?? "");

  const p = Number(preco) || 0;
  const c = Number(custo) || 0;
  const margem = p > 0 ? ((p - c) / p) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div
        className="panel w-full max-w-md animate-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-ink-100">Editar produto</h3>
            <p className="text-[11px] text-ink-500">{produto.marca} · {produto.sku}</p>
          </div>
          <Button tamanho="iconeSm" variante="fantasma" onClick={onFechar} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-3 p-5">
          <Campo rotulo="Nome do produto">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Custo (R$)">
              <Input type="number" step="0.01" value={custo} onChange={(e) => setCusto(e.target.value)} />
            </Campo>
            <Campo rotulo="Preço de venda (R$)">
              <Input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </Campo>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2.5">
            <span className="text-xs text-ink-400">Margem estimada</span>
            <span className={cn(
              "text-sm font-bold tabular-nums",
              margem >= 45 ? "text-ok-400" : margem >= 30 ? "text-warn-400" : "text-bad-400",
            )}>
              {pct(margem)} · {brl(p - c)} por unidade
            </span>
          </div>

          <Campo rotulo="Descrição">
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className="w-full rounded-lg bg-white/4 px-3 py-2 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
            />
          </Campo>

          <p className="rounded-lg bg-brand-500/8 px-3 py-2 text-[11px] leading-relaxed text-brand-200 ring-1 ring-inset ring-brand-500/15">
            O chatbot lê estes valores direto do cadastro. Qualquer alteração aqui já vale
            na próxima mensagem enviada ao cliente.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/6 px-5 py-3">
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primario"
            onClick={() => onSalvar({ nome, preco: p, custo: c, descricao })}
          >
            <Check className="size-3.5" /> Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">{rotulo}</span>
      {children}
    </label>
  );
}
