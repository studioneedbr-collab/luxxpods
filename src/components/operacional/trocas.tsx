"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2, RefreshCcw, Search, XCircle, Clock, PackageCheck, Eye, Plus, Check,
} from "lucide-react";
import { alterarStatusTroca, criarTroca } from "@/lib/actions-mvp2";
import {
  Badge, Button, Input, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio,
} from "@/components/ui";
import { Campo, Modal, Textarea } from "@/components/ui/modal";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import type { BadgeTom } from "@/components/ui";
import { cn, dataHora, num } from "@/lib/utils";
import type { Troca } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { useListaServidor } from "@/lib/usar-lista-servidor";

const STATUS: Record<Troca["status"], { rotulo: string; tom: BadgeTom }> = {
  solicitada: { rotulo: "Solicitada", tom: "warn" },
  em_analise: { rotulo: "Em análise", tom: "info" },
  aprovada:   { rotulo: "Aprovada",   tom: "brand" },
  recusada:   { rotulo: "Recusada",   tom: "bad" },
  finalizada: { rotulo: "Finalizada", tom: "ok" },
};

const FLUXO: Record<Troca["status"], Array<{ status: Troca["status"]; rotulo: string; variante: "primario" | "ok" | "perigo" }>> = {
  solicitada: [
    { status: "em_analise", rotulo: "Analisar", variante: "primario" },
    { status: "recusada", rotulo: "Recusar", variante: "perigo" },
  ],
  em_analise: [
    { status: "aprovada", rotulo: "Aprovar", variante: "ok" },
    { status: "recusada", rotulo: "Recusar", variante: "perigo" },
  ],
  aprovada: [
    { status: "finalizada", rotulo: "Finalizar e devolver ao estoque", variante: "ok" },
  ],
  recusada: [],
  finalizada: [],
};

export function TelaTrocas({
  trocas: iniciais, pedidos,
}: {
  trocas: Troca[];
  /** pedidos entregues nos últimos 30 dias — são os que podem gerar troca */
  pedidos: Array<{ id: string; numero_pedido: string; cliente_nome: string | null }>;
}) {
  const [trocas, setTrocas] = useListaServidor(iniciais);
  const [abrindo, setAbrindo] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [vendo, setVendo] = useState<Troca | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return trocas.filter((x) => {
      if (filtro === "abertas" && ["finalizada", "recusada"].includes(x.status)) return false;
      if (filtro !== "todas" && filtro !== "abertas" && x.status !== filtro) return false;
      if (!t) return true;
      return [x.cliente_nome, x.numero_pedido, x.produto_nome, x.motivo]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [trocas, busca, filtro]);

  function mudar(troca: Troca, status: Troca["status"]) {
    setTrocas((l) => l.map((x) => (x.id === troca.id ? { ...x, status } : x)));
    setVendo((v) => (v && v.id === troca.id ? { ...v, status } : v));
    iniciar(async () => {
      const r = await alterarStatusTroca(troca.id, status);
      if (r.ok) {
        toast.ok(
          `Troca ${STATUS[status].rotulo.toLowerCase()}`,
          status === "finalizada" ? "Peça devolvida ao estoque" : troca.cliente_nome ?? undefined,
        );
      } else {
        toast.erro("Não consegui atualizar a troca", r.erro);
      }
    });
  }

  const { visiveis, props: paginacao } = usePaginacao(filtradas, 25);
  function abrir(dados: {
    order_id: string; quantidade: number; motivo: string; descricao: string;
  }) {
    const pedido = pedidos.find((p) => p.id === dados.order_id);
    setAbrindo(false);
    setTrocas((l) => [{
      id: `tmp-${Date.now()}`,
      customer_id: null, order_id: dados.order_id,
      cliente_nome: pedido?.cliente_nome ?? null,
      numero_pedido: pedido?.numero_pedido ?? null,
      produto_nome: null, sabor_nome: null,
      quantidade: dados.quantidade, motivo: dados.motivo,
      descricao: dados.descricao || null, status: "solicitada",
      created_at: new Date().toISOString(), approved_at: null, completed_at: null,
    }, ...l]);

    iniciar(async () => {
      const r = await criarTroca({
        order_id: dados.order_id,
        quantidade: dados.quantidade,
        motivo: dados.motivo,
        descricao: dados.descricao || null,
      });
      if (r.ok) toast.ok("Troca aberta", pedido?.numero_pedido);
      else {
        setTrocas(iniciais);
        toast.erro("Não consegui abrir a troca", r.erro);
      }
    });
  }

  const abertas = trocas.filter((t) => !["finalizada", "recusada"].includes(t.status));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Em aberto" valor={num(abertas.length)} tom="warn" icone={Clock} />
        <Cartao rotulo="Aguardando análise"
          valor={num(trocas.filter((t) => t.status === "solicitada").length)} icone={Eye} />
        <Cartao rotulo="Finalizadas"
          valor={num(trocas.filter((t) => t.status === "finalizada").length)} tom="ok" icone={PackageCheck} />
        <Cartao rotulo="Recusadas"
          valor={num(trocas.filter((t) => t.status === "recusada").length)} tom="bad" icone={XCircle} />
      </div>

      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, pedido ou motivo…"
            className="h-9 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
          />
        </div>
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas</option>
          <option value="abertas">Em aberto</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.rotulo}</option>
          ))}
        </Select>
        <Button variante="primario" tamanho="sm" onClick={() => setAbrindo(true)}>
          <Plus className="size-3.5" /> Abrir troca
        </Button>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Solicitações de troca" icone={RefreshCcw}
          descricao="Vinculadas à venda original — ao finalizar, a peça volta ao estoque" />
        {filtradas.length === 0 ? (
          <Vazio icone={RefreshCcw} titulo="Nenhuma troca"
            descricao="Abra a solicitação a partir do pedido do cliente."
            acao={
              <Button variante="primario" tamanho="sm" onClick={() => setAbrindo(true)}>
                <Plus className="size-3.5" /> Abrir troca
              </Button>
            } />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th><Th>Pedido</Th><Th>Produto</Th><Th>Motivo</Th>
                <Th>Aberta em</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((t) => {
                const st = STATUS[t.status];
                const acoes = FLUXO[t.status];
                return (
                  <Tr key={t.id}>
                    <Td className="font-medium text-ink-100">{t.cliente_nome ?? "—"}</Td>
                    <Td>
                      {t.order_id ? (
                        <Link href={`/pedidos/${t.order_id}`}
                          className="tabular-nums text-brand-300 hover:text-brand-200">
                          {t.numero_pedido}
                        </Link>
                      ) : <span className="text-ink-500">—</span>}
                    </Td>
                    <Td>
                      <p className="truncate text-ink-200">{t.produto_nome ?? "—"}</p>
                      <p className="truncate text-[11px] text-ink-500">{t.sabor_nome ?? ""}</p>
                    </Td>
                    <Td className="max-w-[200px] truncate text-ink-300">{t.motivo ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-[11px] tabular-nums text-ink-400">
                      {dataHora(t.created_at)}
                    </Td>
                    <Td className="text-center"><Badge tom={st.tom} ponto>{st.rotulo}</Badge></Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <Button tamanho="sm" variante="fantasma" onClick={() => setVendo(t)}>
                          <Eye className="size-3.5" />
                        </Button>
                        {acoes.slice(0, 1).map((a) => (
                          <Button key={a.status} tamanho="sm" variante={a.variante}
                            onClick={() => mudar(t, a.status)}>
                            {a.rotulo}
                          </Button>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="trocas" />
      </Panel>

      {abrindo && (
        <FormTroca pedidos={pedidos} onFechar={() => setAbrindo(false)} onSalvar={abrir} />
      )}

      {vendo && (
        <Modal aberto onFechar={() => setVendo(null)}
          titulo={`Troca — ${vendo.cliente_nome}`}
          descricao={`${vendo.numero_pedido ?? "sem pedido"} · aberta em ${dataHora(vendo.created_at)}`}
          rodape={
            <>
              <Button variante="fantasma" onClick={() => setVendo(null)}>Fechar</Button>
              {FLUXO[vendo.status].map((a) => (
                <Button key={a.status} variante={a.variante} onClick={() => mudar(vendo, a.status)}>
                  {a.rotulo}
                </Button>
              ))}
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tom={STATUS[vendo.status].tom} ponto>{STATUS[vendo.status].rotulo}</Badge>
              <Badge tom="neutro">{vendo.quantidade} unidade{vendo.quantidade > 1 ? "s" : ""}</Badge>
            </div>

            <div className="rounded-lg bg-ink-850 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Produto</p>
              <p className="mt-0.5 text-[13px] font-medium text-ink-100">{vendo.produto_nome ?? "—"}</p>
              <p className="text-[11px] text-ink-400">{vendo.sabor_nome ?? ""}</p>
            </div>

            <div className="rounded-lg bg-ink-850 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Motivo</p>
              <p className="mt-0.5 text-[13px] text-ink-200">{vendo.motivo ?? "—"}</p>
              {vendo.descricao && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{vendo.descricao}</p>
              )}
            </div>

            <div className="rounded-lg bg-ink-850 px-3 py-2.5">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-500">Linha do tempo</p>
              <ul className="space-y-1.5 text-[11px]">
                <li className="flex justify-between">
                  <span className="text-ink-400">Solicitada</span>
                  <span className="tabular-nums text-ink-200">{dataHora(vendo.created_at)}</span>
                </li>
                {vendo.approved_at && (
                  <li className="flex justify-between">
                    <span className="text-ink-400">Aprovada</span>
                    <span className="tabular-nums text-ink-200">{dataHora(vendo.approved_at)}</span>
                  </li>
                )}
                {vendo.completed_at && (
                  <li className="flex justify-between">
                    <span className="text-ok-400">Finalizada — estoque devolvido</span>
                    <span className="tabular-nums text-ink-200">{dataHora(vendo.completed_at)}</span>
                  </li>
                )}
              </ul>
            </div>

            {vendo.status === "aprovada" && (
              <p className="flex items-start gap-2 rounded-lg bg-ok-500/8 px-3 py-2.5 text-[11px] leading-relaxed text-ok-300 ring-1 ring-inset ring-ok-500/15">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                Ao finalizar, o sistema registra automaticamente a movimentação de devolução
                e a peça volta ao estoque disponível.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, tom = "neutro", icone: Icone }: {
  rotulo: string; valor: string;
  tom?: "neutro" | "ok" | "bad" | "warn";
  icone: React.ComponentType<{ className?: string }>;
}) {
  const cores = {
    neutro: "text-ink-100", ok: "text-ok-400", bad: "text-bad-400", warn: "text-warn-400",
  };
  return (
    <Panel className="flex items-center gap-3 p-4">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-ink-850", cores[tom])}>
        <Icone className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
        <p className={cn("text-[19px] font-bold tabular-nums", cores[tom])}>{valor}</p>
      </div>
    </Panel>
  );
}

const MOTIVOS = [
  "Produto não liga",
  "Sabor veio diferente do pedido",
  "Vazando",
  "Produto danificado",
  "Bateria não carrega",
  "Outro",
];

/** Toda troca nasce de uma venda — por isso começa escolhendo o pedido. */
function FormTroca({
  pedidos, onFechar, onSalvar,
}: {
  pedidos: Array<{ id: string; numero_pedido: string; cliente_nome: string | null }>;
  onFechar: () => void;
  onSalvar: (d: { order_id: string; quantidade: number; motivo: string; descricao: string }) => void;
}) {
  const [orderId, setOrderId] = useState(pedidos[0]?.id ?? "");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [quantidade, setQuantidade] = useState(1);
  const [descricao, setDescricao] = useState("");

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Abrir troca"
      descricao="A peça só volta ao estoque quando a troca for finalizada"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={!orderId || !motivo}
            onClick={() => onSalvar({ order_id: orderId, quantidade, motivo, descricao })}
          >
            <Check className="size-3.5" /> Abrir solicitação
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Pedido" dica="a troca fica ligada à venda original">
          <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full">
            {pedidos.length === 0 && <option value="">Nenhum pedido elegível</option>}
            {pedidos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero_pedido} — {p.cliente_nome ?? "sem nome"}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
          <Campo rotulo="Motivo">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full">
              {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Quantidade">
            <Input type="number" min={1} value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value)))} />
          </Campo>
        </div>

        <Campo rotulo="O que aconteceu" dica="o que o cliente relatou, nas palavras dele">
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder="Cliente diz que o pod não acende desde a primeira tragada." />
        </Campo>
      </div>
    </Modal>
  );
}
