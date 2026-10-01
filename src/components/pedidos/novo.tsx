"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Banknote, Check, MapPin, Package, QrCode, Search,
  ShoppingBag, X,
} from "lucide-react";
import { criarPedido } from "@/lib/actions";
import {
  Button, CampoMascara, CampoMoeda, Input, Panel, PanelHeader, Secao, Vazio,
} from "@/components/ui";
import { Campo, Textarea } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { brl, cn, iniciais, num, telefone } from "@/lib/utils";
import type { Cliente, ItemCatalogo } from "@/lib/types";
import { buscarCep, cepCompleto } from "@/lib/cep";

interface Linha {
  product_flavor_id: string;
  produto: string;
  sabor: string;
  marca: string | null;
  preco: number;
  disponivel: number;
  quantidade: number;
}

/**
 * Pedido no balcão: quem atende pelo telefone ou pessoalmente monta a venda
 * aqui, pelo mesmo caminho que o bot usa — carrinho, reserva, pedido.
 */
export function NovoPedido({
  catalogo, clientes,
}: { catalogo: ItemCatalogo[]; clientes: Cliente[] }) {
  const router = useRouter();
  const toast = useToast();
  const [salvando, iniciar] = useTransition();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");

  const [cep, setCep] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepNaoAchado, setCepNaoAchado] = useState(false);
  const [bairro, setBairro] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [referencia, setReferencia] = useState("");

  const [pagamento, setPagamento] = useState<"pix" | "dinheiro">("pix");
  const [trocoPara, setTrocoPara] = useState(0);
  const [observacoes, setObservacoes] = useState("");

  /* ------------------------------------------------------------- busca */

  const clientesAchados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase();
    if (t.length < 2) return [];
    return clientes
      .filter((c) =>
        c.nome.toLowerCase().includes(t) || (c.telefone ?? "").includes(t.replace(/\D/g, "")))
      .slice(0, 5);
  }, [clientes, buscaCliente]);

  const produtosAchados = useMemo(() => {
    const t = buscaProduto.trim().toLowerCase();
    if (!t) return [];
    return catalogo
      .filter((c) => c.vendavel)
      .filter((c) => !linhas.some((l) => l.product_flavor_id === c.product_flavor_id))
      .filter((c) => [c.produto, c.sabor, c.marca, c.sku]
        .some((v) => (v ?? "").toLowerCase().includes(t)))
      .slice(0, 6);
  }, [catalogo, buscaProduto, linhas]);

  /* ------------------------------------------------------------- conta */

  const subtotal = linhas.reduce((a, l) => a + l.preco * l.quantidade, 0);
  const entrega = subtotal >= 150 || subtotal === 0 ? 0 : 5;
  const total = subtotal + entrega;
  const troco = trocoPara > 0 ? trocoPara - total : 0;

  /**
   * O CEP preenche o resto, mas não manda: o que já estiver digitado fica.
   * Em Teófilo Otoni muita entrega chega pelo ponto de referência, então
   * CEP errado ou fora da base não pode impedir de fechar o pedido.
   */
  async function aoMudarCep(valor: string) {
    setCep(valor);
    setCepNaoAchado(false);
    if (!cepCompleto(valor)) return;

    setBuscandoCep(true);
    const achado = await buscarCep(valor);
    setBuscandoCep(false);

    if (!achado) { setCepNaoAchado(true); return; }
    if (achado.bairro) setBairro(achado.bairro);
    if (achado.rua) setRua(achado.rua);
  }

  const faltaEndereco = !bairro.trim() || !rua.trim() || !numero.trim();
  const trocoInvalido = pagamento === "dinheiro" && trocoPara > 0 && trocoPara < total;
  const podeSalvar =
    linhas.length > 0 && !faltaEndereco && !trocoInvalido &&
    (cliente !== null || novoNome.trim().length > 1);

  function adicionar(item: ItemCatalogo) {
    setLinhas((l) => [...l, {
      product_flavor_id: item.product_flavor_id,
      produto: item.produto, sabor: item.sabor, marca: item.marca,
      preco: item.preco, disponivel: item.estoque_disponivel, quantidade: 1,
    }]);
    setBuscaProduto("");
  }

  function salvar() {
    iniciar(async () => {
      const r = await criarPedido({
        customer_id: cliente?.id ?? null,
        conversation_id: null,
        address_id: null,
        endereco: { cep, bairro, rua, numero, complemento, referencia },
        itens: linhas.map((l) => ({
          product_flavor_id: l.product_flavor_id, quantidade: l.quantidade,
        })),
        forma_pagamento: pagamento,
        troco_para: pagamento === "dinheiro" && trocoPara > 0 ? trocoPara : null,
        observacoes: observacoes || null,
      });

      if (r.ok) {
        toast.ok(`Pedido ${r.numero} criado`, `${num(linhas.length)} itens · ${brl(total)}`);
        router.push(r.id ? `/pedidos/${r.id}` : "/pedidos");
      } else {
        toast.erro("Não consegui criar o pedido", r.erro);
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* ------------------------------ cliente ------------------------------ */}
        <Secao titulo="Cliente" descricao="Busque quem já comprou ou cadastre na hora">
          {cliente ? (
            <Panel className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-500/14 text-[11px] font-semibold text-brand-200">
                {iniciais(cliente.nome)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink-100">{cliente.nome}</p>
                <p className="text-[11px] tabular-nums text-ink-500">
                  {telefone(cliente.telefone)} · {cliente.total_pedidos} pedidos
                </p>
              </div>
              <Button tamanho="sm" variante="fantasma" onClick={() => setCliente(null)}>
                trocar
              </Button>
            </Panel>
          ) : (
            <Panel className="space-y-3 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
                <input
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  placeholder="Buscar por nome ou telefone…"
                  className="h-9 w-full rounded-md bg-ink-950 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
                />
              </div>

              {clientesAchados.length > 0 && (
                <ul className="overflow-hidden rounded-md ring-1 ring-inset ring-[var(--linha-forte)]">
                  {clientesAchados.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => { setCliente(c); setBuscaCliente(""); }}
                        className="flex w-full items-center gap-2.5 bg-ink-850 px-3 py-2 text-left transition-colors hover:bg-brand-500/15"
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-800 text-[10px] font-semibold text-ink-300">
                          {iniciais(c.nome)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink-100">{c.nome}</span>
                          <span className="block text-[11px] tabular-nums text-ink-500">
                            {telefone(c.telefone)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-3 border-t border-[var(--linha)] pt-3 sm:grid-cols-2">
                <Campo rotulo="Ou cadastre agora — nome">
                  <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Nome do cliente" />
                </Campo>
                <Campo rotulo="Telefone">
                  <CampoMascara tipo="telefone" valor={novoTelefone} aoMudar={setNovoTelefone} />
                </Campo>
              </div>
            </Panel>
          )}
        </Secao>

        {/* ------------------------------ produtos ----------------------------- */}
        <Secao titulo="Produtos" descricao="Só aparece o que tem estoque disponível agora">
          <Panel className="space-y-3 p-4">
            <div className="relative">
              <Package className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
              <input
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="Buscar por modelo, sabor ou marca…"
                className="h-9 w-full rounded-md bg-ink-950 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
              />
            </div>

            {produtosAchados.length > 0 && (
              <ul className="overflow-hidden rounded-md ring-1 ring-inset ring-[var(--linha-forte)]">
                {produtosAchados.map((c) => (
                  <li key={c.product_flavor_id}>
                    <button
                      onClick={() => adicionar(c)}
                      className="flex w-full items-center gap-2.5 bg-ink-850 px-3 py-2 text-left transition-colors hover:bg-brand-500/15"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink-100">{c.produto}</span>
                        <span className="block truncate text-[11px] text-ink-500">
                          {c.marca} · {c.sabor}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-500">
                        {c.estoque_disponivel} un
                      </span>
                      <span className="numero shrink-0 text-[13px] text-ink-100">
                        {brl(c.preco)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {linhas.length === 0 ? (
              <Vazio icone={ShoppingBag} titulo="Nenhum item"
                descricao="Busque acima para montar o pedido." />
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {linhas.map((l, i) => {
                  const passou = l.quantidade > l.disponivel;
                  return (
                    <li key={l.product_flavor_id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink-100">{l.produto}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {l.marca} · {l.sabor} · {brl(l.preco)} un
                        </p>
                      </div>

                      <Input
                        type="number" min={1} max={l.disponivel} value={l.quantidade}
                        onChange={(e) => setLinhas((ls) => ls.map((x, j) =>
                          j === i ? { ...x, quantidade: Math.max(1, Number(e.target.value)) } : x))}
                        className={cn("h-7 w-16 text-center", passou && "ring-bad-500/50")}
                      />

                      <span className="numero w-20 text-right text-[13px] text-ink-100">
                        {brl(l.preco * l.quantidade)}
                      </span>

                      <button
                        onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                        aria-label={`Remover ${l.produto}`}
                        className="grid size-6 shrink-0 place-items-center rounded text-ink-600 transition-colors hover:bg-bad-500/15 hover:text-bad-400"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {linhas.some((l) => l.quantidade > l.disponivel) && (
              <p className="flex items-center gap-2 rounded-md bg-bad-500/10 px-3 py-2 text-[11px] text-bad-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                Há item acima do estoque disponível — o pedido será recusado.
              </p>
            )}
          </Panel>
        </Secao>

        {/* ------------------------------ entrega ------------------------------ */}
        <Secao titulo="Entrega" descricao="Endereço que vai sair impresso na comanda">
          <Panel className="grid gap-3 p-4 sm:grid-cols-2">
            <Campo
              rotulo="CEP"
              dica={
                buscandoCep ? "buscando…"
                : cepNaoAchado ? "não achei este CEP — digite o endereço"
                : "opcional, preenche o resto"
              }
            >
              <CampoMascara tipo="cep" valor={cep} aoMudar={aoMudarCep} />
            </Campo>
            <Campo rotulo="Bairro">
              <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Centro" />
            </Campo>
            <Campo rotulo="Rua">
              <Input value={rua} onChange={(e) => setRua(e.target.value)} placeholder="Rua das Flores" />
            </Campo>
            <Campo rotulo="Número">
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="120" />
            </Campo>
            <Campo rotulo="Complemento">
              <Input value={complemento} onChange={(e) => setComplemento(e.target.value)}
                placeholder="Apto 202" />
            </Campo>
            <Campo rotulo="Ponto de referência" className="sm:col-span-2">
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                placeholder="Em frente ao mercado" />
            </Campo>
          </Panel>
        </Secao>
      </div>

      {/* ------------------------------ resumo ------------------------------ */}
      <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <Panel className="overflow-hidden">
          <PanelHeader titulo="Resumo" icone={ShoppingBag} />

          <div className="space-y-2 px-4 py-3.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-ink-400">Produtos</span>
              <span className="numero text-ink-200">{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-400">Entrega</span>
              <span className="numero text-ink-200">
                {entrega === 0 && subtotal > 0 ? "grátis" : brl(entrega)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-[var(--linha)] pt-2.5">
              <span className="font-medium text-ink-200">Total</span>
              <span className="numero-destaque text-ink-100">{brl(total)}</span>
            </div>
          </div>

          <div className="border-t border-[var(--linha)] px-4 py-3.5">
            <p className="rotulo mb-2">Pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { valor: "pix" as const, rotulo: "PIX", icone: QrCode },
                { valor: "dinheiro" as const, rotulo: "Dinheiro", icone: Banknote },
              ]).map((f) => (
                <button
                  key={f.valor}
                  onClick={() => setPagamento(f.valor)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md py-2 text-[13px] font-medium transition-colors",
                    pagamento === f.valor
                      ? "bg-brand-500 text-white"
                      : "bg-ink-850 text-ink-400 hover:bg-ink-800 hover:text-ink-200",
                  )}
                >
                  <f.icone className="size-3.5" /> {f.rotulo}
                </button>
              ))}
            </div>

            {pagamento === "dinheiro" && (
              <div className="mt-3">
                <Campo rotulo="Cliente paga com" dica="deixe zerado se não precisa de troco">
                  <CampoMoeda valor={trocoPara} aoMudar={setTrocoPara} />
                </Campo>
                {trocoInvalido ? (
                  <p className="mt-1.5 text-[11px] text-bad-400">
                    Menor que o total do pedido.
                  </p>
                ) : troco > 0 ? (
                  <p className="mt-1.5 text-[11px] text-warn-400">
                    Levar <strong>{brl(troco)}</strong> de troco.
                  </p>
                ) : null}
              </div>
            )}

            {pagamento === "pix" && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-500">
                O pedido fica aguardando pagamento. Só é confirmado — e só baixa
                do estoque — quando o PIX cair.
              </p>
            )}
          </div>

          <div className="border-t border-[var(--linha)] px-4 py-3.5">
            <Campo rotulo="Observação">
              <Textarea rows={2} value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Entregar depois das 19h" />
            </Campo>
          </div>

          <div className="border-t border-[var(--linha)] p-4">
            <Button
              variante="primario"
              className="h-10 w-full justify-center"
              disabled={!podeSalvar || salvando}
              onClick={salvar}
            >
              <Check className="size-4" />
              {salvando ? "Criando…" : "Criar pedido"}
            </Button>

            {!podeSalvar && (
              <ul className="mt-2.5 space-y-1 text-[11px] text-ink-500">
                {linhas.length === 0 && <li>· adicione ao menos um produto</li>}
                {!cliente && novoNome.trim().length < 2 && <li>· informe o cliente</li>}
                {faltaEndereco && <li>· preencha bairro, rua e número</li>}
                {trocoInvalido && <li>· o troco não cobre o total</li>}
              </ul>
            )}
          </div>
        </Panel>

        <div className="flex items-start gap-2 rounded-lg bg-ink-900 px-3.5 py-3 ring-1 ring-inset ring-[var(--linha)]">
          <MapPin className="mt-px size-3.5 shrink-0 text-ink-500" />
          <p className="text-[11px] leading-relaxed text-ink-400">
            Ao criar, as unidades são <strong>reservadas na hora</strong>. Se
            outro pedido levar a última peça antes, este é recusado com o motivo.
          </p>
        </div>
      </aside>
    </div>
  );
}
