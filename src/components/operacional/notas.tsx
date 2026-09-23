"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight, CheckCircle2, ClipboardCheck, FileInput, Package, Plus,
  RotateCcw, Search, Truck, X, DollarSign, AlertTriangle,
} from "lucide-react";
import {
  concluirNota, criarNota, reabrirNota, salvarFornecedor, situacaoNota,
} from "@/lib/actions-mvp2";
import {
  Badge, Button, CampoData, CampoMoeda, Input, Panel, Secao, Select,
  Table, Td, Th, Tr, Vazio, CampoMascara,
} from "@/components/ui";
import { Campo, Confirmar, Modal, Textarea } from "@/components/ui/modal";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { useToast } from "@/components/ui/toast";
import type { BadgeTom } from "@/components/ui";
import { brl, cn, num } from "@/lib/utils";
import type { Fornecedor, ItemCatalogo, NotaEntrada, NotaSituacao } from "@/lib/types";

interface ItemNota {
  product_flavor_id: string;
  rotulo: string;
  quantidade: number;
  custo_unitario: number;
}

const SITUACAO: Record<NotaSituacao, { rotulo: string; tom: BadgeTom; explica: string }> = {
  transito:   { rotulo: "Em trânsito", tom: "info",
                explica: "Mercadoria a caminho. Nada entrou no estoque ainda." },
  conferencia:{ rotulo: "Em conferência", tom: "warn",
                explica: "Chegou e está sendo conferida. O estoque só sobe ao concluir." },
  concluida:  { rotulo: "Concluída", tom: "ok",
                explica: "Estoque atualizado, custo médio recalculado e conta a pagar criada." },
  cancelada:  { rotulo: "Cancelada", tom: "bad", explica: "Nota descartada." },
};

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
  const [filtro, setFiltro] = useState("todas");
  const [nova, setNova] = useState(false);
  const [novoForn, setNovoForn] = useState(false);
  const [concluindo, setConcluindo] = useState<NotaEntrada | null>(null);
  const [reabrindo, setReabrindo] = useState<NotaEntrada | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return notas.filter((n) => {
      if (filtro === "abertas" && ["concluida", "cancelada"].includes(n.situacao)) return false;
      if (filtro !== "todas" && filtro !== "abertas" && n.situacao !== filtro) return false;
      if (!t) return true;
      return [n.fornecedor_nome, n.numero_documento]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [notas, busca, filtro]);

  const { visiveis, props: paginacao } = usePaginacao(filtradas, 25);

  const aCaminho = notas.filter((n) => n.situacao === "transito");
  const conferindo = notas.filter((n) => n.situacao === "conferencia");
  const concluidas = notas.filter((n) => n.situacao === "concluida");

  /* ---------------------------------------------------------------- ações */

  function lancar(dados: {
    supplier_id: string | null; numero_documento: string; data: string;
    observacao: string; cotacao: number | null; freteiro_pct: number;
    vencimento: string | null; itens: ItemNota[];
  }) {
    const valor = dados.itens.reduce((a, i) => a + i.quantidade * i.custo_unitario, 0);
    const pecas = dados.itens.reduce((a, i) => a + i.quantidade, 0);
    const fornecedor = fornecedores.find((f) => f.id === dados.supplier_id);

    setNotas((l) => [{
      id: `tmp-${Date.now()}`,
      supplier_id: dados.supplier_id, fornecedor_nome: fornecedor?.nome ?? null,
      numero_documento: dados.numero_documento || null, data: dados.data,
      valor_total: valor, observacao: dados.observacao || null,
      situacao: "transito", estoque_aplicado: false,
      cotacao: dados.cotacao, freteiro_pct: dados.freteiro_pct,
      vencimento: dados.vencimento,
      itens_count: dados.itens.length, pecas,
      created_at: new Date().toISOString(),
    }, ...l]);
    setNova(false);

    iniciar(async () => {
      const r = await criarNota(
        {
          supplier_id: dados.supplier_id,
          numero_documento: dados.numero_documento || null,
          data: dados.data,
          observacao: dados.observacao || null,
          cotacao: dados.cotacao,
          freteiro_pct: dados.freteiro_pct,
          vencimento: dados.vencimento,
        },
        dados.itens.map((i) => ({
          product_flavor_id: i.product_flavor_id,
          quantidade: i.quantidade,
          custo_unitario: i.custo_unitario,
        })),
      );
      if (r.ok) {
        toast.ok("Nota lançada", `${num(pecas)} peças · ${brl(valor)} — o estoque sobe ao concluir`);
      } else {
        setNotas(iniciais);
        toast.erro("Não consegui lançar a nota", r.erro);
      }
    });
  }

  function mudarSituacao(nota: NotaEntrada, situacao: NotaSituacao) {
    setNotas((l) => l.map((n) => (n.id === nota.id ? { ...n, situacao } : n)));
    iniciar(async () => {
      const r = await situacaoNota(nota.id, situacao);
      if (r.ok) toast.ok(`Nota em ${SITUACAO[situacao].rotulo.toLowerCase()}`);
      else { setNotas(iniciais); toast.erro("Não consegui mudar a situação", r.erro); }
    });
  }

  function concluir(nota: NotaEntrada) {
    setConcluindo(null);
    setNotas((l) => l.map((n) => (n.id === nota.id
      ? { ...n, situacao: "concluida", estoque_aplicado: true } : n)));
    iniciar(async () => {
      const r = await concluirNota(nota.id);
      if (r.ok) {
        toast.ok(
          `${num(nota.pecas)} peças entraram no estoque`,
          "Custo médio recalculado e conta a pagar gerada",
        );
      } else {
        setNotas(iniciais);
        toast.erro("Não consegui concluir a nota", r.erro);
      }
    });
  }

  function reabrir(nota: NotaEntrada) {
    setReabrindo(null);
    setNotas((l) => l.map((n) => (n.id === nota.id
      ? { ...n, situacao: "conferencia", estoque_aplicado: false } : n)));
    iniciar(async () => {
      const r = await reabrirNota(nota.id);
      if (r.ok) toast.ok("Nota reaberta", "O estoque foi estornado e a conta cancelada");
      else { setNotas(iniciais); toast.erro("Não consegui reabrir", r.erro); }
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

  /* ----------------------------------------------------------------- tela */

  return (
    <div className="space-y-6">
      {/* o caminho da mercadoria, em vez de cartões soltos */}
      <div className="chapa overflow-hidden">
        <div className="grid divide-y divide-[var(--linha)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { etapa: "1", titulo: "Em trânsito", qtd: aCaminho.length, icone: Truck,
              texto: "a caminho, nada no estoque", tom: "text-info-400" },
            { etapa: "2", titulo: "Em conferência", qtd: conferindo.length, icone: ClipboardCheck,
              texto: "chegou, sendo conferida", tom: "text-warn-400" },
            { etapa: "3", titulo: "Concluídas", qtd: concluidas.length, icone: CheckCircle2,
              texto: "estoque e financeiro aplicados", tom: "text-ok-400" },
          ].map((e, i) => (
            <div key={e.etapa} className="relative flex items-center gap-3 px-4 py-3.5">
              <e.icone className={cn("size-4 shrink-0", e.tom)} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink-100">{e.titulo}</p>
                <p className="truncate text-[11px] text-ink-500">{e.texto}</p>
              </div>
              <span className={cn("numero text-lg", e.qtd > 0 ? e.tom : "text-ink-600")}>
                {e.qtd}
              </span>
              {i < 2 && (
                <ArrowRight className="absolute -right-2 top-1/2 hidden size-3.5 -translate-y-1/2 text-ink-700 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      <Secao
        titulo="Notas de entrada"
        descricao="O estoque só sobe quando a nota é concluída — lançar e dar entrada são atos separados"
        acao={
          <div className="flex gap-2">
            <Button tamanho="sm" onClick={() => setNovoForn(true)}>
              <Truck className="size-3.5" /> Fornecedor
            </Button>
            <Button variante="primario" tamanho="sm" onClick={() => setNova(true)}>
              <Plus className="size-3.5" /> Lançar nota
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Fornecedor ou número da nota…"
              className="h-8 w-full rounded-md bg-ink-950 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
            />
          </div>
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="abertas">Em aberto</option>
            <option value="transito">Em trânsito</option>
            <option value="conferencia">Em conferência</option>
            <option value="concluida">Concluídas</option>
          </Select>
        </div>

        <Panel className="overflow-hidden">
          {filtradas.length === 0 ? (
            <Vazio icone={FileInput} titulo="Nenhuma nota"
              descricao="Lance a nota quando a compra for feita — ela fica em trânsito até a mercadoria chegar."
              acao={<Button variante="primario" tamanho="sm" onClick={() => setNova(true)}>
                <Plus className="size-3.5" /> Lançar nota
              </Button>} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th><Th>Fornecedor</Th><Th>Documento</Th>
                  <Th className="text-right">Peças</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-center">Situação</Th>
                  <Th className="text-right">Ação</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((n) => {
                  const st = SITUACAO[n.situacao];
                  return (
                    <Tr key={n.id}>
                      <Td className="whitespace-nowrap tabular-nums text-ink-400">
                        {new Date(`${n.data}T12:00:00`).toLocaleDateString("pt-BR")}
                      </Td>
                      <Td>
                        <p className="font-medium text-ink-100">{n.fornecedor_nome ?? "—"}</p>
                        {n.cotacao && (
                          <p className="text-[11px] text-ink-500">
                            dólar a {brl(n.cotacao)}
                          </p>
                        )}
                      </Td>
                      <Td className="font-mono text-[11px] text-ink-400">
                        {n.numero_documento ?? "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-ink-200">{num(n.pecas)}</Td>
                      <Td className="numero text-right text-ink-100">{brl(n.valor_total)}</Td>
                      <Td className="text-center">
                        <Badge tom={st.tom} ponto>{st.rotulo}</Badge>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {n.situacao === "transito" && (
                            <Button tamanho="sm" onClick={() => mudarSituacao(n, "conferencia")}>
                              <ClipboardCheck className="size-3.5" /> Chegou
                            </Button>
                          )}
                          {n.situacao === "conferencia" && (
                            <Button variante="ok" tamanho="sm" onClick={() => setConcluindo(n)}>
                              <CheckCircle2 className="size-3.5" /> Concluir
                            </Button>
                          )}
                          {n.situacao === "concluida" && (
                            <Button tamanho="sm" variante="fantasma" onClick={() => setReabrindo(n)}
                              title="Estorna o estoque e cancela a conta gerada">
                              <RotateCcw className="size-3.5" /> Reabrir
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Paginacao {...paginacao} rotulo="notas" />
        </Panel>
      </Secao>

      {nova && (
        <FormNota
          fornecedores={fornecedores}
          catalogo={catalogo}
          onFechar={() => setNova(false)}
          onSalvar={lancar}
        />
      )}

      {novoForn && (
        <FormFornecedor onFechar={() => setNovoForn(false)} onSalvar={criarFornecedor} />
      )}

      <Confirmar
        aberto={Boolean(concluindo)}
        titulo={`Concluir a nota de ${concluindo?.fornecedor_nome ?? "fornecedor"}?`}
        mensagem={
          `${num(concluindo?.pecas ?? 0)} peças entram no estoque agora, o custo médio de cada ` +
          `SKU é recalculado${(concluindo?.freteiro_pct ?? 0) > 0 ? ` (com ${concluindo?.freteiro_pct}% de freteiro embutido)` : ""}` +
          ` e uma conta a pagar de ${brl(concluindo?.valor_total ?? 0)} é criada. Só conclua depois de conferir a carga.`
        }
        textoConfirmar="Concluir e dar entrada"
        onCancelar={() => setConcluindo(null)}
        onConfirmar={() => concluindo && concluir(concluindo)}
      />

      <Confirmar
        aberto={Boolean(reabrindo)}
        titulo="Reabrir a nota?"
        mensagem={
          `As ${num(reabrindo?.pecas ?? 0)} peças saem do estoque com movimentação registrada e a ` +
          `conta a pagar é cancelada. A nota volta para conferência.`
        }
        textoConfirmar="Reabrir e estornar"
        perigo
        onCancelar={() => setReabrindo(null)}
        onConfirmar={() => reabrindo && reabrir(reabrindo)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ FORM */

function FormNota({
  fornecedores, catalogo, onFechar, onSalvar,
}: {
  fornecedores: Fornecedor[];
  catalogo: ItemCatalogo[];
  onFechar: () => void;
  onSalvar: (d: {
    supplier_id: string | null; numero_documento: string; data: string;
    observacao: string; cotacao: number | null; freteiro_pct: number;
    vencimento: string | null; itens: ItemNota[];
  }) => void;
}) {
  const [supplier, setSupplier] = useState(fornecedores[0]?.id ?? "");
  const [documento, setDocumento] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [vencimento, setVencimento] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [importada, setImportada] = useState(false);
  const [cotacao, setCotacao] = useState(0);
  const [freteiro, setFreteiro] = useState(0);
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
  const valorFreteiro = total * (freteiro / 100);

  return (
    <Modal
      aberto
      onFechar={onFechar}
      largura="lg"
      titulo="Lançar nota de entrada"
      descricao="A nota nasce em trânsito — o estoque só muda quando você concluir"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={itens.length === 0}
            onClick={() => onSalvar({
              supplier_id: supplier || null, numero_documento: documento, data,
              observacao, cotacao: importada && cotacao > 0 ? cotacao : null,
              freteiro_pct: freteiro, vencimento, itens,
            })}
          >
            Lançar ({num(pecas)} peças)
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Fornecedor">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full">
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Número da nota">
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF 10482" />
          </Campo>
          <Campo rotulo="Data da compra">
            <CampoData valor={data} aoMudar={(v) => setData(v ?? data)} />
          </Campo>
          <Campo rotulo="Vencimento do pagamento" dica="vira conta a pagar ao concluir">
            <CampoData valor={vencimento} aoMudar={setVencimento} />
          </Campo>
        </div>

        {/* custos que mudam a margem: freteiro e dólar */}
        <div className="rounded-lg bg-ink-950 p-3 ring-1 ring-inset ring-[var(--linha)]">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
            <DollarSign className="size-3.5 text-ink-500" />
            Custos que entram no preço de cada peça
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Freteiro (%)" dica="embutido no custo médio de cada SKU">
              <Input type="number" min={0} max={100} step={0.5} value={freteiro}
                onChange={(e) => setFreteiro(Number(e.target.value))} />
            </Campo>
            <div>
              <button
                type="button"
                onClick={() => setImportada((v) => !v)}
                className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-500 transition-colors hover:text-ink-300"
              >
                <span className={cn(
                  "grid size-3.5 place-items-center rounded-sm transition-colors",
                  importada ? "bg-brand-500" : "bg-ink-800 ring-1 ring-inset ring-[var(--linha-forte)]",
                )}>
                  {importada && <span className="size-1.5 rounded-[1px] bg-white" />}
                </span>
                Compra em dólar
              </button>
              {importada && (
                <CampoMoeda valor={cotacao} aoMudar={setCotacao} placeholder="5,42" />
              )}
            </div>
          </div>
          {freteiro > 0 && total > 0 && (
            <p className="mt-2 text-[11px] text-ink-500">
              Freteiro de {brl(valorFreteiro)} — vira uma segunda conta a pagar e entra no custo.
            </p>
          )}
        </div>

        {/* itens */}
        <div>
          <Campo rotulo="Adicionar produto + sabor" dica="busque por modelo, sabor ou SKU">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Ignite V300 Watermelon…" />
          </Campo>
          {sugestoes.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-md ring-1 ring-inset ring-[var(--linha-forte)]">
              {sugestoes.map((c) => (
                <li key={c.product_flavor_id}>
                  <button
                    onClick={() => adicionar(c)}
                    className="flex w-full items-center gap-2 bg-ink-850 px-3 py-2 text-left transition-colors hover:bg-brand-500/15"
                  >
                    <Package className="size-3.5 shrink-0 text-ink-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink-100">{c.produto}</span>
                      <span className="block truncate text-[11px] text-ink-500">
                        {c.marca} · {c.sabor} · tem {c.estoque_total} em estoque
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
          <div className="overflow-hidden rounded-md ring-1 ring-inset ring-[var(--linha)]">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="w-20 text-center">Qtd</Th>
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
                      <CampoMoeda
                        valor={i.custo_unitario}
                        aoMudar={(v) => setItens((l) => l.map((x, j) =>
                          j === idx ? { ...x, custo_unitario: v } : x))}
                        className="w-28"
                      />
                    </Td>
                    <Td className="numero text-right text-ink-100">
                      {brl(i.quantidade * i.custo_unitario)}
                    </Td>
                    <Td>
                      <button
                        onClick={() => setItens((l) => l.filter((_, j) => j !== idx))}
                        aria-label={`Remover ${i.rotulo}`}
                        className="grid size-6 place-items-center rounded text-ink-600 transition-colors hover:bg-bad-500/15 hover:text-bad-400"
                      >
                        <X className="size-3" />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-[var(--linha)] bg-ink-950 px-4 py-2.5">
              <span className="text-[11px] text-ink-500">
                {num(pecas)} peças · {itens.length} itens
              </span>
              <span className="numero text-base text-ink-100">{brl(total)}</span>
            </div>
          </div>
        )}

        <Campo rotulo="Observação">
          <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)}
            placeholder="Chega na quinta pela transportadora" />
        </Campo>

        <p className="flex items-start gap-2 rounded-lg bg-info-500/8 px-3 py-2.5 text-[11px] leading-relaxed text-info-400">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          A nota entra como <strong>em trânsito</strong>. Quando a carga chegar, marque
          &ldquo;Chegou&rdquo; e confira; só ao <strong>concluir</strong> é que o estoque sobe,
          o custo médio muda e a conta a pagar é criada.
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
          <Campo rotulo="CNPJ ou CPF">
            <CampoMascara tipo="documento" valor={f.documento ?? ""}
              aoMudar={(v) => setF((p) => ({ ...p, documento: v }))} />
          </Campo>
          <Campo rotulo="Telefone">
            <CampoMascara tipo="telefone" valor={f.telefone ?? ""}
              aoMudar={(v) => setF((p) => ({ ...p, telefone: v }))} />
          </Campo>
        </div>
        <Campo rotulo="E-mail">
          <Input type="email" value={f.email ?? ""} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} />
        </Campo>
      </div>
    </Modal>
  );
}
