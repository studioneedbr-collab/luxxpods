"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, Banknote, Bike, CheckCircle2, MapPin, MessageCircle, Package,
  Printer, QrCode, User, X, AlertTriangle, Clock,
} from "lucide-react";
import { alterarStatusPedido, cancelarPedido } from "@/lib/actions";
import { Badge, Button, Panel, PanelHeader } from "@/components/ui";
import { FLUXO_PEDIDO, METODO_PAGAMENTO, STATUS_PAGAMENTO, STATUS_PEDIDO } from "@/lib/labels";
import { brl, cn, dataHora, telefone } from "@/lib/utils";
import type { Pedido, PedidoStatus } from "@/lib/types";
import { Comanda } from "./comanda";
import { useToast } from "@/components/ui/toast";

const PROXIMO: Partial<Record<PedidoStatus, { status: PedidoStatus; rotulo: string; icone: typeof CheckCircle2 }>> = {
  pendente:             { status: "confirmado",        rotulo: "Confirmar pedido",  icone: CheckCircle2 },
  aguardando_pagamento: { status: "confirmado",        rotulo: "Confirmar pedido",  icone: CheckCircle2 },
  confirmado:           { status: "em_separacao",      rotulo: "Iniciar separação", icone: Package },
  em_separacao:         { status: "saiu_para_entrega", rotulo: "Saiu para entrega", icone: Bike },
  saiu_para_entrega:    { status: "entregue",          rotulo: "Marcar entregue",   icone: CheckCircle2 },
};

export function DetalhePedido({ pedido: inicial }: { pedido: Pedido }) {
  const [pedido, setPedido] = useState(inicial);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, iniciar] = useTransition();
  const toast = useToast();

  const st = STATUS_PEDIDO[pedido.status_pedido];
  const pg = STATUS_PAGAMENTO[pedido.status_pagamento];
  const proximo = PROXIMO[pedido.status_pedido];
  const etapa = FLUXO_PEDIDO.indexOf(pedido.status_pedido);
  const emDinheiro = pedido.forma_pagamento === "dinheiro";
  const aReceber = emDinheiro && pedido.status_pagamento !== "aprovado";

  function avancar() {
    if (!proximo) return;
    const novo = proximo.status;
    setPedido((p) => ({
      ...p,
      status_pedido: novo,
      status_pagamento: novo === "entregue" && emDinheiro ? "aprovado" : p.status_pagamento,
    }));
    iniciar(async () => {
      const r = await alterarStatusPedido(pedido.id, novo);
      if (r.ok) toast.ok(`${pedido.numero_pedido} → ${STATUS_PEDIDO[novo].rotulo}`);
      else {
        setPedido(inicial);
        toast.erro("Não consegui mudar o status", r.erro);
      }
    });
  }

  function cancelar() {
    setPedido((p) => ({ ...p, status_pedido: "cancelado" }));
    setCancelando(false);
    iniciar(async () => {
      const r = await cancelarPedido(pedido.id, motivo || "Cancelado pelo painel");
      if (r.ok) toast.ok(`${pedido.numero_pedido} cancelado`, "Estoque devolvido");
      else {
        setPedido(inicial);
        toast.erro("Não consegui cancelar", r.erro);
      }
    });
  }

  return (
    <div className="space-y-3">
      <Comanda pedido={pedido} />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/pedidos">
          <Button variante="fantasma" tamanho="sm"><ArrowLeft className="size-3.5" /> Pedidos</Button>
        </Link>
        <h2 className="text-lg font-bold tabular-nums tracking-tight text-ink-100">{pedido.numero_pedido}</h2>
        <Badge tom={st.tom} ponto>{st.rotulo}</Badge>
        <Badge tom={pg.tom}>{METODO_PAGAMENTO[pedido.forma_pagamento]} · {pg.rotulo}</Badge>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button tamanho="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Imprimir comanda
          </Button>
          {pedido.conversation_id && (
            <Link href={`/chats?c=${pedido.conversation_id}`}>
              <Button tamanho="sm"><MessageCircle className="size-3.5" /> Conversa</Button>
            </Link>
          )}
          {pedido.status_pedido !== "cancelado" && pedido.status_pedido !== "entregue" && (
            <Button variante="perigo" tamanho="sm" onClick={() => setCancelando(true)}>
              <X className="size-3.5" /> Cancelar
            </Button>
          )}
          {proximo && pedido.status_pedido !== "cancelado" && (
            <Button variante="primario" tamanho="sm" onClick={avancar} disabled={salvando}>
              <proximo.icone className="size-3.5" /> {proximo.rotulo}
            </Button>
          )}
        </div>
      </div>

      {aReceber && pedido.status_pedido !== "cancelado" && (
        <div className="flex items-center gap-2.5 rounded-xl border border-warn-500/25 bg-warn-500/8 px-4 py-3 print:hidden">
          <AlertTriangle className="size-4 shrink-0 text-warn-400" />
          <p className="text-xs text-warn-300">
            <span className="font-semibold">Receber na entrega: {brl(pedido.total)}</span>
            {pedido.troco_para
              ? ` — cliente vai pagar com ${brl(pedido.troco_para)}, levar ${brl(pedido.valor_troco ?? 0)} de troco.`
              : " — sem necessidade de troco."}
          </p>
        </div>
      )}

      {/* linha do tempo */}
      {pedido.status_pedido !== "cancelado" && (
        <Panel className="p-4 print:hidden">
          <div className="flex items-center">
            {FLUXO_PEDIDO.map((s, i) => {
              const feito = i <= etapa;
              const atual = i === etapa;
              return (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className={cn(
                      "grid size-7 place-items-center rounded-full text-[10px] font-bold transition",
                      atual ? "bg-brand-500 text-white ring-4 ring-brand-500/20"
                        : feito ? "bg-ok-500/20 text-ok-400"
                          : "bg-ink-800 text-ink-600",
                    )}>
                      {feito && !atual ? <CheckCircle2 className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn(
                      "hidden whitespace-nowrap text-[10px] sm:block",
                      atual ? "font-semibold text-brand-200" : feito ? "text-ink-400" : "text-ink-600",
                    )}>
                      {STATUS_PEDIDO[s].rotulo}
                    </span>
                  </div>
                  {i < FLUXO_PEDIDO.length - 1 && (
                    <span className={cn(
                      "mx-1 mb-5 h-0.5 flex-1 rounded-full transition",
                      i < etapa ? "bg-ok-500/40" : "bg-ink-800",
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <div className="grid gap-3 lg:grid-cols-3 print:hidden">
        <Panel className="lg:col-span-2">
          <PanelHeader titulo="Itens do pedido" icone={Package}
            descricao="Valores registrados no momento da venda" />
          <div className="divide-y divide-[var(--linha)]">
            {(pedido.itens ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-500/12 text-xs font-bold text-brand-300">
                  {item.quantidade}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-100">{item.produto_nome}</p>
                  <p className="truncate text-[11px] text-ink-500">
                    {item.marca_nome} · {item.sabor_nome}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-ink-100">{brl(item.subtotal)}</p>
                  <p className="text-[11px] tabular-nums text-ink-500">{brl(item.preco_unitario)} un</p>
                </div>
              </div>
            ))}
            {(pedido.itens ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-xs text-ink-500">Sem itens registrados</p>
            )}
          </div>
          <div className="space-y-1.5 border-t border-[var(--linha)] px-5 py-4">
            <Linha rotulo="Produtos" valor={brl(pedido.subtotal)} />
            {pedido.desconto > 0 && <Linha rotulo="Desconto" valor={`− ${brl(pedido.desconto)}`} tom="ok" />}
            <Linha rotulo="Entrega" valor={brl(pedido.taxa_entrega)} />
            <div className="flex items-center justify-between border-t border-[var(--linha)] pt-2.5">
              <span className="text-sm font-semibold text-ink-200">Total</span>
              <span className="text-lg font-bold tabular-nums text-ink-100">{brl(pedido.total)}</span>
            </div>
            {pedido.custo_total > 0 && (
              <p className="pt-1 text-right text-[11px] tabular-nums text-ink-500">
                lucro estimado {brl(pedido.total - pedido.custo_total - pedido.desconto - pedido.taxa_entrega)}
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel>
            <PanelHeader titulo="Cliente" icone={User} />
            <div className="space-y-2 px-5 py-4 text-xs">
              <p className="text-sm font-semibold text-ink-100">{pedido.cliente_nome}</p>
              <p className="tabular-nums text-ink-400">{telefone(pedido.cliente_telefone)}</p>
              {pedido.customer_id && (
                <Link href={`/clientes/${pedido.customer_id}`}
                  className="inline-block text-[11px] font-medium text-brand-300 hover:text-brand-200">
                  ver ficha completa →
                </Link>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader titulo="Entrega" icone={MapPin} />
            <div className="space-y-1 px-5 py-4 text-xs text-ink-300">
              {pedido.endereco_snapshot ? (
                <>
                  <p className="font-medium text-ink-100">
                    {pedido.endereco_snapshot.rua}, {pedido.endereco_snapshot.numero}
                  </p>
                  <p>{pedido.endereco_snapshot.bairro} · {pedido.endereco_snapshot.cidade}</p>
                  {pedido.endereco_snapshot.complemento && <p>{pedido.endereco_snapshot.complemento}</p>}
                  {pedido.endereco_snapshot.referencia && (
                    <p className="text-ink-500">Ref: {pedido.endereco_snapshot.referencia}</p>
                  )}
                </>
              ) : <p className="text-ink-500">Endereço não informado</p>}
            </div>
          </Panel>

          <Panel>
            <PanelHeader titulo="Pagamento"
              icone={pedido.forma_pagamento === "pix" ? QrCode : Banknote} />
            <div className="space-y-2 px-5 py-4 text-xs">
              <Linha rotulo="Forma" valor={METODO_PAGAMENTO[pedido.forma_pagamento]} />
              <Linha rotulo="Situação" valor={pg.rotulo} tom={pedido.status_pagamento === "aprovado" ? "ok" : "warn"} />
              {pedido.troco_para && (
                <>
                  <Linha rotulo="Cliente paga com" valor={brl(pedido.troco_para)} />
                  <Linha rotulo="Troco" valor={brl(pedido.valor_troco ?? 0)} tom="warn" />
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader titulo="Histórico" icone={Clock} />
            <div className="space-y-2 px-5 py-4 text-[11px]">
              <Linha rotulo="Criado" valor={dataHora(pedido.created_at)} />
              {pedido.confirmado_em && <Linha rotulo="Confirmado" valor={dataHora(pedido.confirmado_em)} />}
              {pedido.entregue_em && <Linha rotulo="Entregue" valor={dataHora(pedido.entregue_em)} />}
              <Linha rotulo="Origem" valor={pedido.origem === "bot" ? "Chatbot" : "Operador"} />
            </div>
          </Panel>
        </div>
      </div>

      {cancelando && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm print:hidden"
          onClick={() => setCancelando(false)}>
          <div className="panel w-full max-w-sm animate-in-up p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink-100">Cancelar {pedido.numero_pedido}?</h3>
            <p className="mt-1 text-xs text-ink-400">
              O estoque dos itens volta automaticamente e o lançamento financeiro é cancelado.
            </p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento"
              className="mt-3 h-9 w-full rounded-lg bg-ink-850 px-3 text-sm text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variante="fantasma" onClick={() => setCancelando(false)}>Voltar</Button>
              <Button variante="perigo" onClick={cancelar}>Confirmar cancelamento</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-500">{rotulo}</span>
      <span className={cn(
        "font-medium tabular-nums",
        tom === "ok" ? "text-ok-400" : tom === "warn" ? "text-warn-400" : "text-ink-200",
      )}>
        {valor}
      </span>
    </div>
  );
}
