"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2, FileInput, Package, Plus, Search, Truck, X,
} from "lucide-react";
import { lancarEntrada, salvarFornecedor } from "@/lib/actions-mvp2";
import {
  Badge, Button, Input, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio,
} from "@/components/ui";
import { Campo, Modal, Textarea } from "@/components/ui/modal";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, num } from "@/lib/utils";
import type { Fornecedor, ItemCatalogo, NotaEntrada } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

interface ItemNota {
  product_flavor_id: string;
  rotulo: string;
  quantidade: number;
  custo_unitario: number;
}

export function TelaNotas({
  notas: iniciais, fornecedores: fornIniciais, catalogo,
}: {
  notas: NotaEntrada[];
  fornecedores: Fornecedor[];
  catalogo: ItemCatalogo[];
}) {
  const [notas, setNotas] = useState(iniciais);
  const [fornecedores, setFornecedores] = useState(fornIniciais);
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);
  const [novoForn, setNovoForn] = useState(false);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return notas;
    return notas.filter((n) =>
      (n.fornecedor_nome ?? "").toLowerCase().includes(t) ||
      (n.numero_documento ?? "").toLowerCase().includes(t));
  }, [notas, busca]);

  const { visiveis, props: paginacao } = usePaginacao(filtradas, 25);

  const totais = {
    finalizadas: notas.filter((n) => n.status === "finalizada").length,
    valor: notas.filter((n) => n.status === "finalizada").reduce((a, n) => a + n.valor_total, 0),
    pecas: notas.filter((n) => n.status === "finalizada").reduce((a, n) => a + n.pecas, 0),
  };

  function criarNota(dados: {
    supplier_id: string | null; numero_documento: string;
    data: string; observacao: string; itens: ItemNota[];
  }) {
    const valor = dados.itens.reduce((a, i) => a + i.quantidade * i.custo_unitario, 0);
    const pecas = dados.itens.reduce((a, i) => a + i.quantidade, 0);
    const fornecedor = fornecedores.find((f) => f.id === dados.supplier_id);

    setNotas((l) => [{
      id: `tmp-${Date.now()}`,
      supplier_id: dados.supplier_id, fornecedor_nome: fornecedor?.nome ?? null,
      numero_documento: dados.numero_documento || null, data: dados.data,
      valor_total: valor, observacao: dados.observacao || null,
      status: "finalizada", itens_count: dados.itens.length, pecas,
      created_at: new Date().toISOString(),
    }, ...l]);
    setNova(false);

    iniciar(async () => {
      const r = await lancarEntrada(
        {
          supplier_id: dados.supplier_id,
          numero_documento: dados.numero_documento || null,
          data: dados.data,
          observacao: dados.observacao || null,
        },
        dados.itens.map((i) => ({
          product_flavor_id: i.product_flavor_id,
          quantidade: i.quantidade,
          custo_unitario: i.custo_unitario,
        })),
      );
      if (r.ok) {
        toast.ok(
          `Entrada lançada · ${num(pecas)} peças`,
          `Estoque atualizado e custo médio recalculado · ${brl(valor)}`,
        );
      } else {
        setNotas(iniciais);
        toast.erro("Não consegui lançar a entrada", r.erro);
      }
    });
  }

  function criarFornecedor(dados: Partial<Fornecedor>) {
    const novo = {
      id: `tmp-${Date.now()}`, nome: dados.nome ?? "", documento: dados.documento ?? null,
      telefone: dados.telefone ?? null, email: dados.email ?? null, status: "ativo" as const,
    };
    setFornecedores((l) => [...l, novo]);
    setNovoForn(false);
    iniciar(async () => {
      const r = await salvarFornecedor(dados);
      if (r.ok) toast.ok("Fornecedor cadastrado", dados.nome);
      else toast.erro("Não consegui salvar o fornecedor", r.erro);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Notas finalizadas" valor={num(totais.finalizadas)} />
        <Cartao rotulo="Peças recebidas" valor={num(totais.pecas)} tom="ok" />
        <Cartao rotulo="Investido em mercadoria" valor={brl(totais.valor)} tom="brand" />
        <Cartao rotulo="Fornecedores" valor={num(fornecedores.length)} />
      </div>

      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor ou número da nota…"
            className="h-9 w-full rounded-lg bg-white/4 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>
        <Button onClick={() => setNovoForn(true)}>
          <Truck className="size-3.5" /> Novo fornecedor
        </Button>
        <Button variante="primario" onClick={() => setNova(true)}>
          <Plus className="size-3.5" /> Lançar entrada
        </Button>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Notas de entrada" icone={FileInput}
          descricao="Ao finalizar, o estoque sobe e o custo médio é recalculado automaticamente" />
        {filtradas.length === 0 ? (
          <Vazio icone={FileInput} titulo="Nenhuma nota lançada"
            descricao="Lance a entrada da mercadoria para o estoque subir com histórico."
            acao={<Button variante="primario" tamanho="sm" onClick={() => setNova(true)}>
              <Plus className="size-3.5" /> Lançar entrada
            </Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th><Th>Fornecedor</Th><Th>Documento</Th>
                <Th className="text-center">Itens</Th>
                <Th className="text-right">Peças</Th>
                <Th className="text-right">Valor total</Th>
                <Th className="text-center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((n) => (
                <Tr key={n.id}>
                  <Td className="whitespace-nowrap tabular-nums text-ink-300">
                    {new Date(`${n.data}T12:00:00`).toLocaleDateString("pt-BR")}
                  </Td>
                  <Td className="font-medium text-ink-100">{n.fornecedor_nome ?? "—"}</Td>
                  <Td className="tabular-nums text-ink-400">{n.numero_documento ?? "—"}</Td>
                  <Td className="text-center tabular-nums text-ink-300">{n.itens_count}</Td>
                  <Td className="text-right tabular-nums text-ink-200">{num(n.pecas)}</Td>
                  <Td className="text-right font-semibold tabular-nums text-ink-100">
                    {brl(n.valor_total)}
                  </Td>
                  <Td className="text-center">
                    <Badge tom={n.status === "finalizada" ? "ok" : n.status === "cancelada" ? "bad" : "warn"}>
                      {n.status}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="notas" />
      </Panel>

      {nova && (
        <FormNota
          fornecedores={fornecedores}
          catalogo={catalogo}
          onFechar={() => setNova(false)}
          onSalvar={criarNota}
        />
      )}

      {novoForn && (
        <FormFornecedor onFechar={() => setNovoForn(false)} onSalvar={criarFornecedor} />
      )}
    </div>
  );
}

function FormNota({
  fornecedores, catalogo, onFechar, onSalvar,
}: {
  fornecedores: Fornecedor[];
  catalogo: ItemCatalogo[];
  onFechar: () => void;
  onSalvar: (d: {
    supplier_id: string | null; numero_documento: string;
    data: string; observacao: string; itens: ItemNota[];
  }) => void;
}) {
  const [supplier, setSupplier] = useState<string>(fornecedores[0]?.id ?? "");
  const [documento, setDocumento] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ItemNota[]>([]);
  const [busca, setBusca] = useState("");

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return catalogo
      .filter((c) => !itens.some((i) => i.product_flavor_id === c.product_flavor_id))
      .filter((c) => [c.produto, c.sabor, c.marca, c.sku]
        .some((v) => (v ?? "").toLowerCase().includes(t)))
      .slice(0, 6);
  }, [busca, catalogo, itens]);

  function adicionar(c: ItemCatalogo) {
    setItens((l) => [...l, {
      product_flavor_id: c.product_flavor_id,
      rotulo: `${c.produto} · ${c.sabor}`,
      quantidade: 10,
      custo_unitario: c.custo_medio || c.custo,
    }]);
    setBusca("");
  }

  const total = itens.reduce((a, i) => a + i.quantidade * i.custo_unitario, 0);
  const pecas = itens.reduce((a, i) => a + i.quantidade, 0);

  return (
    <Modal
      aberto
      onFechar={onFechar}
      largura="lg"
      titulo="Lançar entrada de mercadoria"
      descricao="Ao salvar, cada item entra no estoque com movimentação registrada"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={itens.length === 0}
            onClick={() => onSalvar({
              supplier_id: supplier || null, numero_documento: documento, data, observacao, itens,
            })}
          >
            <CheckCircle2 className="size-3.5" />
            Finalizar e dar entrada ({num(pecas)} peças)
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Fornecedor">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full">
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Número da nota">
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF 10482" />
          </Campo>
          <Campo rotulo="Data">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>

        <div>
          <Campo rotulo="Adicionar produto + sabor" dica="Busque pelo nome do modelo, sabor ou SKU">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Ignite V300 Watermelon…" />
          </Campo>
          {sugestoes.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-lg ring-1 ring-inset ring-white/10">
              {sugestoes.map((c) => (
                <li key={c.product_flavor_id}>
                  <button
                    onClick={() => adicionar(c)}
                    className="flex w-full items-center gap-2 bg-ink-850 px-3 py-2 text-left transition hover:bg-brand-500/15"
                  >
                    <Package className="size-3.5 shrink-0 text-ink-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-ink-100">{c.produto}</span>
                      <span className="block truncate text-[11px] text-ink-500">
                        {c.marca} · {c.sabor} · estoque atual {c.estoque_total}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                      {brl(c.custo_medio || c.custo)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {itens.length > 0 && (
          <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-white/8">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="w-24 text-center">Qtd</Th>
                  <Th className="w-32 text-right">Custo un.</Th>
                  <Th className="text-right">Subtotal</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <Tr key={i.product_flavor_id}>
                    <Td className="text-ink-200">{i.rotulo}</Td>
                    <Td className="text-center">
                      <Input
                        type="number" min={1} value={i.quantidade}
                        onChange={(e) => setItens((l) => l.map((x, j) =>
                          j === idx ? { ...x, quantidade: Math.max(1, Number(e.target.value)) } : x))}
                        className="h-7 w-16 text-center"
                      />
                    </Td>
                    <Td className="text-right">
                      <Input
                        type="number" step="0.01" value={i.custo_unitario}
                        onChange={(e) => setItens((l) => l.map((x, j) =>
                          j === idx ? { ...x, custo_unitario: Number(e.target.value) } : x))}
                        className="h-7 w-24 text-right"
                      />
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-ink-100">
                      {brl(i.quantidade * i.custo_unitario)}
                    </Td>
                    <Td>
                      <button
                        onClick={() => setItens((l) => l.filter((_, j) => j !== idx))}
                        className="grid size-6 place-items-center rounded-md text-ink-500 transition hover:bg-bad-500/15 hover:text-bad-400"
                      >
                        <X className="size-3" />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-white/6 bg-white/3 px-4 py-2.5">
              <span className="text-xs text-ink-400">{num(pecas)} peças · {itens.length} itens</span>
              <span className="text-base font-bold tabular-nums text-ink-100">{brl(total)}</span>
            </div>
          </div>
        )}

        <Campo rotulo="Observação">
          <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)}
            placeholder="Reposição mensal" />
        </Campo>

        <p className="rounded-lg bg-brand-500/8 px-3 py-2.5 text-[11px] leading-relaxed text-brand-200 ring-1 ring-inset ring-brand-500/15">
          Ao finalizar, cada item gera uma movimentação de <strong>entrada</strong> no estoque
          e o custo médio do SKU é recalculado com base na quantidade e no custo informados.
        </p>
      </div>
    </Modal>
  );
}

function FormFornecedor({
  onFechar, onSalvar,
}: { onFechar: () => void; onSalvar: (d: Partial<Fornecedor>) => void }) {
  const [f, setF] = useState<Partial<Fornecedor>>({ nome: "" });
  return (
    <Modal aberto onFechar={onFechar} titulo="Novo fornecedor"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" disabled={!f.nome?.trim()} onClick={() => onSalvar(f)}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Nome">
          <Input value={f.nome ?? ""} onChange={(e) => setF((p) => ({ ...p, nome: e.target.value }))}
            placeholder="Distribuidora Vapor SP" />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="CNPJ / documento">
            <Input value={f.documento ?? ""} onChange={(e) => setF((p) => ({ ...p, documento: e.target.value }))} />
          </Campo>
          <Campo rotulo="Telefone">
            <Input value={f.telefone ?? ""} onChange={(e) => setF((p) => ({ ...p, telefone: e.target.value }))} />
          </Campo>
        </div>
        <Campo rotulo="E-mail">
          <Input type="email" value={f.email ?? ""} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} />
        </Campo>
      </div>
    </Modal>
  );
}

function Cartao({ rotulo, valor, tom = "neutro" }: {
  rotulo: string; valor: string; tom?: "neutro" | "ok" | "brand";
}) {
  const cores = { neutro: "text-ink-100", ok: "text-ok-400", brand: "text-brand-300" };
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", cores[tom])}>{valor}</p>
    </Panel>
  );
}
