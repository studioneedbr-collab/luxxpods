import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Banknote, MapPin, MessageCircle, Package, Receipt, ShieldCheck,
  ShoppingBag, TrendingUp, User, AtSign, Clock,
} from "lucide-react";
import { Badge, Button, Panel, PanelHeader, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { CANAL, ESTADO_CONVERSA, METODO_PAGAMENTO, STATUS_PAGAMENTO, STATUS_PEDIDO } from "@/lib/labels";
import { brl, cn, dataHora, iniciais, num, telefone, tempoRelativo } from "@/lib/utils";
import { getCliente } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FichaCliente({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await getCliente(id);
  if (!dados) notFound();

  const { cliente, enderecos, pedidos, conversas } = dados;
  const validos = pedidos.filter((p) => p.status_pedido !== "cancelado");
  const gasto = validos.reduce((a, p) => a + p.total, 0);
  const lucro = validos.reduce((a, p) => a + (p.total - p.custo_total - p.desconto - p.taxa_entrega), 0);
  const itensComprados = validos.reduce(
    (a, p) => a + (p.itens ?? []).reduce((x, i) => x + i.quantidade, 0), 0);

  // o que este cliente mais compra
  const favoritos = new Map<string, number>();
  validos.forEach((p) => (p.itens ?? []).forEach((i) => {
    const chave = `${i.produto_nome} · ${i.sabor_nome}`;
    favoritos.set(chave, (favoritos.get(chave) ?? 0) + i.quantidade);
  }));
  const maisComprados = [...favoritos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/clientes">
          <Button variante="fantasma" tamanho="sm"><ArrowLeft className="size-3.5" /> Clientes</Button>
        </Link>
        <h2 className="text-[19px] font-bold tracking-tight text-ink-100">{cliente.nome || "Sem nome"}</h2>
        {cliente.maioridade_validada && <Badge tom="ok"><ShieldCheck className="size-2.5" /> +18 validado</Badge>}
        {cliente.total_pedidos > 1 && <Badge tom="gold">recorrente</Badge>}
        {(cliente.tags ?? []).map((t) => <Badge key={t} tom="brand">{t}</Badge>)}

        {conversas[0] && (
          <Link href={`/chats?c=${conversas[0].id}`} className="ml-auto">
            <Button variante="primario" tamanho="sm">
              <MessageCircle className="size-3.5" /> Abrir conversa
            </Button>
          </Link>
        )}
      </div>

      {/* ---------------- resumo ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo="Total comprado" valor={brl(gasto)} icone={Banknote} tom="ok" />
        <Cartao rotulo="Pedidos" valor={num(validos.length)} icone={ShoppingBag}
          sub={`${num(itensComprados)} itens no total`} />
        <Cartao rotulo="Ticket médio" valor={brl(validos.length ? gasto / validos.length : 0)}
          icone={Receipt} tom="brand" />
        <Cartao rotulo="Lucro gerado" valor={brl(lucro)} icone={TrendingUp} tom="gold" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[320px_1fr]">
        {/* ---------------- cadastro ---------------- */}
        <div className="space-y-3">
          <Panel>
            <div className="flex flex-col items-center gap-2 px-5 py-5 text-center">
              <span className="grid size-16 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-[19px] font-bold text-white">
                {iniciais(cliente.nome)}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink-100">{cliente.nome || "Sem nome"}</p>
                <p className="text-[11px] tabular-nums text-ink-400">{telefone(cliente.telefone)}</p>
                {cliente.instagram_username && (
                  <p className="flex items-center justify-center gap-1 text-[11px] text-ink-500">
                    <AtSign className="size-2.5" />{cliente.instagram_username.replace("@", "")}
                  </p>
                )}
              </div>
            </div>

            <dl className="divide-y divide-[var(--linha)] border-t border-[var(--linha)]">
              {[
                ["Canal de origem", cliente.canal_origem ? CANAL[cliente.canal_origem].rotulo : "—"],
                ["Origem", cliente.origem ?? "—"],
                ["Cadastrado em", new Date(cliente.created_at).toLocaleDateString("pt-BR")],
                ["Primeira compra", cliente.ultima_compra
                  ? new Date(cliente.created_at).toLocaleDateString("pt-BR") : "nunca comprou"],
                ["Última compra", cliente.ultima_compra
                  ? `${new Date(cliente.ultima_compra).toLocaleDateString("pt-BR")} (${tempoRelativo(cliente.ultima_compra)})`
                  : "nunca"],
                ["Última interação", tempoRelativo(cliente.ultima_interacao)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex items-start justify-between gap-3 px-5 py-2">
                  <dt className="shrink-0 text-[11px] text-ink-500">{rotulo}</dt>
                  <dd className="text-right text-[11px] font-medium text-ink-200">{valor}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel>
            <PanelHeader titulo="Endereços" icone={MapPin} descricao={`${enderecos.length} cadastrado(s)`} />
            {enderecos.length === 0 ? (
              <p className="px-5 py-6 text-center text-[11px] text-ink-500">Nenhum endereço salvo</p>
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {enderecos.map((e, i) => (
                  <li key={i} className="px-5 py-3 text-[11px]">
                    <p className="font-medium text-ink-100">{e.rua}, {e.numero}</p>
                    <p className="text-ink-400">{e.bairro} · {e.cidade}</p>
                    {e.complemento && <p className="text-ink-500">{e.complemento}</p>}
                    {e.referencia && <p className="text-[11px] text-ink-500">Ref: {e.referencia}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {maisComprados.length > 0 && (
            <Panel>
              <PanelHeader titulo="Costuma comprar" icone={Package}
                descricao="Use para sugerir na próxima conversa" />
              <ul className="divide-y divide-[var(--linha)]">
                {maisComprados.map(([nome, qtd]) => (
                  <li key={nome} className="flex items-center justify-between gap-3 px-5 py-2">
                    <span className="min-w-0 truncate text-[11px] text-ink-200">{nome}</span>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-brand-300">
                      {qtd}×
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* ---------------- histórico ---------------- */}
        <div className="space-y-3">
          <Panel className="overflow-hidden">
            <PanelHeader titulo="Histórico de pedidos" icone={ShoppingBag}
              descricao={`${pedidos.length} pedido(s) · ${brl(gasto)} no total`} />
            {pedidos.length === 0 ? (
              <Vazio icone={ShoppingBag} titulo="Nenhum pedido"
                descricao="Este cliente ainda não comprou." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Pedido</Th><Th>Data</Th><Th>Itens</Th>
                    <Th className="text-center">Pagamento</Th>
                    <Th className="text-center">Status</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <Link href={`/pedidos/${p.id}`}
                          className="font-medium tabular-nums text-brand-300 hover:text-brand-200">
                          {p.numero_pedido}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-[11px] tabular-nums text-ink-400">
                        {dataHora(p.created_at)}
                      </Td>
                      <Td className="max-w-[220px] truncate text-[11px] text-ink-300">
                        {(p.itens ?? []).map((i) => `${i.quantidade}× ${i.sabor_nome}`).join(", ") || "—"}
                      </Td>
                      <Td className="text-center">
                        <span className="text-[11px] text-ink-400">
                          {METODO_PAGAMENTO[p.forma_pagamento]}
                        </span>
                        <Badge tom={STATUS_PAGAMENTO[p.status_pagamento].tom} className="ml-1">
                          {STATUS_PAGAMENTO[p.status_pagamento].rotulo}
                        </Badge>
                      </Td>
                      <Td className="text-center">
                        <Badge tom={STATUS_PEDIDO[p.status_pedido].tom}>
                          {STATUS_PEDIDO[p.status_pedido].rotulo}
                        </Badge>
                      </Td>
                      <Td className={cn(
                        "text-right font-semibold tabular-nums",
                        p.status_pedido === "cancelado" ? "text-ink-600 line-through" : "text-ink-100",
                      )}>
                        {brl(p.total)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader titulo="Conversas" icone={MessageCircle}
              descricao={`${conversas.length} conversa(s) neste cliente`} />
            {conversas.length === 0 ? (
              <Vazio icone={MessageCircle} titulo="Nenhuma conversa" />
            ) : (
              <ul className="divide-y divide-[var(--linha)]">
                {conversas.map((c) => (
                  <li key={c.id}>
                    <Link href={`/chats?c=${c.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-850">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: `${CANAL[c.canal].cor}22`, color: CANAL[c.canal].cor }}>
                        {c.canal === "instagram" ? <AtSign className="size-3.5" /> : <MessageCircle className="size-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] text-ink-200">{c.ultima_mensagem ?? "—"}</p>
                        <p className="flex items-center gap-1.5 text-[10px] text-ink-500">
                          <Clock className="size-2.5" />
                          {tempoRelativo(c.ultima_mensagem_em)}
                        </p>
                      </div>
                      <Badge tom={c.bot_ativo ? "brand" : "gold"}>
                        {c.bot_ativo ? "bot" : "atendente"}
                      </Badge>
                      <Badge tom={ESTADO_CONVERSA[c.estado].tom}>
                        {ESTADO_CONVERSA[c.estado].rotulo}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {cliente.observacoes && (
            <Panel>
              <PanelHeader titulo="Observações" icone={User} />
              <p className="px-5 py-4 text-[11px] leading-relaxed text-ink-300">{cliente.observacoes}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Cartao({
  rotulo, valor, sub, icone: Icone, tom = "neutro",
}: {
  rotulo: string; valor: string; sub?: string;
  icone: React.ComponentType<{ className?: string }>;
  tom?: "neutro" | "ok" | "brand" | "gold";
}) {
  const cores = {
    neutro: "text-ink-300", ok: "text-ok-400", brand: "text-brand-300", gold: "text-gold-400",
  };
  return (
    <Panel className="flex items-center gap-3 p-4">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-ink-850", cores[tom])}>
        <Icone className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
        <p className="truncate text-[19px] font-bold tabular-nums text-ink-100">{valor}</p>
        {sub && <p className="truncate text-[10px] text-ink-500">{sub}</p>}
      </div>
    </Panel>
  );
}
