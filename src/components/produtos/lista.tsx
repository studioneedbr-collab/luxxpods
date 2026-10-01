"use client";

import { useMemo, useState, useTransition } from "react";
import { Package, Pencil, Plus, Search, Star, Trash2, X, Check } from "lucide-react";
import { alternarProduto, salvarProduto } from "@/lib/actions";
import { criarProduto, excluirProduto } from "@/lib/actions-cadastro";
import { Badge, Button, Input, Panel, Select, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, num, pct } from "@/lib/utils";
import type { Produto } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { CampoMoeda } from "@/components/ui";
import { Campo, Confirmar, Modal, Textarea } from "@/components/ui/modal";
import { useListaServidor } from "@/lib/usar-lista-servidor";

export function ListaProdutos({ produtos: iniciais }: { produtos: Produto[] }) {
  const [produtos, setProdutos] = useListaServidor(iniciais);
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("todas");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState<Produto | null>(null);
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

  function criar(dados: {
    nome: string; marca: string | null; brand_id: string | null;
    modelo: string; puffs: number | null; preco: number; custo: number;
    descricao: string;
  }) {
    const provisorio: Produto = {
      id: `tmp-${Date.now()}`, nome: dados.nome, modelo: dados.modelo || null,
      marca: dados.marca, brand_id: dados.brand_id, puffs: dados.puffs,
      sku: null, preco: dados.preco, custo: dados.custo, status: "ativo",
      destaque: false, imagem_url: null, descricao: dados.descricao || null,
      sabores: 0, sabores_disponiveis: 0, estoque: 0,
      margem: dados.preco > 0 ? ((dados.preco - dados.custo) / dados.preco) * 100 : 0,
    };
    setProdutos((l) => [...l, provisorio]);
    setCriando(false);

    iniciar(async () => {
      const r = await criarProduto({
        nome: dados.nome, modelo: dados.modelo || null, brand_id: dados.brand_id,
        puffs: dados.puffs, preco: dados.preco, custo: dados.custo,
        descricao: dados.descricao || null,
      });
      if (r.ok) {
        toast.ok("Produto criado", "Agora adicione os sabores no catálogo");
      } else {
        setProdutos(iniciais);
        toast.erro("Não consegui criar o produto", r.erro);
      }
    });
  }

  function remover(p: Produto) {
    setExcluindo(null);
    setProdutos((l) => l.filter((x) => x.id !== p.id));
    iniciar(async () => {
      const r = await excluirProduto(p.id);
      if (r.ok) toast.ok("Produto excluído", p.nome);
      else {
        setProdutos(iniciais);
        toast.erro("Não consegui excluir", r.erro);
      }
    });
  }

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
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Select value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="todas">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Badge tom="ok">{totais.ativos} ativos</Badge>
        <Badge tom="brand">{num(totais.estoque)} peças</Badge>
        <Badge tom="gold">{brl(totais.valorVenda)} em venda potencial</Badge>
        <Button variante="primario" tamanho="sm" onClick={() => setCriando(true)}>
          <Plus className="size-3.5" /> Novo produto
        </Button>
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
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(p)}
                        aria-label={`Editar ${p.nome}`} title="Editar produto">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setExcluindo(p)}
                        aria-label={`Excluir ${p.nome}`} title="Excluir produto">
                        <Trash2 className="size-3.5 text-bad-400" />
                      </Button>
                    </div>
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

      {criando && (
        <ModalNovo marcas={marcas} produtos={produtos}
          onFechar={() => setCriando(false)} onSalvar={criar} />
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Excluir ${excluindo?.nome}?`}
        mensagem={
          excluindo && excluindo.estoque > 0
            ? `Este produto ainda tem ${excluindo.estoque} unidade(s) em estoque. Zere o estoque antes, ou apenas desative para tirá-lo do catálogo do bot.`
            : "O produto sai do catálogo. Os pedidos antigos continuam mostrando o que foi vendido, pelo preço praticado na época."
        }
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}

/** Cadastro de um modelo novo. Os sabores entram depois, pelo catálogo. */
function ModalNovo({
  marcas, produtos, onFechar, onSalvar,
}: {
  marcas: string[];
  produtos: Produto[];
  onFechar: () => void;
  onSalvar: (d: {
    nome: string; marca: string | null; brand_id: string | null;
    modelo: string; puffs: number | null; preco: number; custo: number;
    descricao: string;
  }) => void;
}) {
  const [nome, setNome] = useState("");
  const [marca, setMarca] = useState(marcas[0] ?? "");
  const [modelo, setModelo] = useState("");
  const [puffs, setPuffs] = useState("");
  const [preco, setPreco] = useState(0);
  const [custo, setCusto] = useState(0);
  const [descricao, setDescricao] = useState("");

  const margem = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
  const prejuizo = custo > 0 && preco > 0 && custo >= preco;

  // o id da marca vem de um produto que já a usa
  const brandId = produtos.find((p) => p.marca === marca)?.brand_id ?? null;

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Novo produto"
      descricao="Depois de criar, adicione os sabores pela tela de catálogo"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={!nome.trim() || preco <= 0 || prejuizo}
            onClick={() => onSalvar({
              nome, marca: marca || null, brand_id: brandId, modelo,
              puffs: puffs ? Number(puffs) : null, preco, custo, descricao,
            })}
          >
            <Check className="size-3.5" /> Criar produto
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Nome do produto" dica="como o cliente vê na conversa">
          <Input value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Ignite V300" autoFocus />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Marca">
            <Select value={marca} onChange={(e) => setMarca(e.target.value)} className="w-full">
              {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Modelo">
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="V300" />
          </Campo>
          <Campo rotulo="Puffs">
            <Input type="number" value={puffs} onChange={(e) => setPuffs(e.target.value)}
              placeholder="3000" />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Custo">
            <CampoMoeda valor={custo} aoMudar={setCusto} />
          </Campo>
          <Campo rotulo="Preço de venda">
            <CampoMoeda valor={preco} aoMudar={setPreco} />
          </Campo>
        </div>

        <div className={cn(
          "flex items-center justify-between rounded-md px-3 py-2.5",
          prejuizo ? "bg-bad-500/10" : "bg-ink-850",
        )}>
          <span className="text-[11px] text-ink-400">
            {prejuizo ? "O custo está acima do preço" : "Margem"}
          </span>
          <span className={cn(
            "numero text-[13px]",
            prejuizo ? "text-bad-400" : margem >= 45 ? "text-ok-400"
              : margem >= 30 ? "text-warn-400" : "text-ink-300",
          )}>
            {prejuizo ? "venda daria prejuízo" : `${pct(margem, 0)} · ${brl(preco - custo)} por peça`}
          </span>
        </div>

        <Campo rotulo="Descrição">
          <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ignite V300 — 3.000 puffs" />
        </Campo>
      </div>
    </Modal>
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
        <div className="flex items-center justify-between border-b border-[var(--linha)] px-5 py-3.5">
          <div>
            <h3 className="text-[13px] font-semibold text-ink-100">Editar produto</h3>
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
              <CampoMoeda valor={Number(custo) || 0} aoMudar={(v) => setCusto(String(v))} />
            </Campo>
            <Campo rotulo="Preço de venda (R$)">
              <CampoMoeda valor={Number(preco) || 0} aoMudar={(v) => setPreco(String(v))} />
            </Campo>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2.5">
            <span className="text-[11px] text-ink-400">Margem estimada</span>
            <span className={cn(
              "text-[13px] font-bold tabular-nums",
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
              className="w-full rounded-lg bg-ink-850 px-3 py-2 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
            />
          </Campo>

          <p className="rounded-lg bg-brand-500/8 px-3 py-2 text-[11px] leading-relaxed text-brand-200 ring-1 ring-inset ring-brand-500/15">
            O chatbot lê estes valores direto do cadastro. Qualquer alteração aqui já vale
            na próxima mensagem enviada ao cliente.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--linha)] px-5 py-3">
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
