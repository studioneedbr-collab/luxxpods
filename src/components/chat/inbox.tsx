"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bot, Check, CheckCheck, AtSign, MessageCircle, Phone, Search, Send,
  ShoppingBag, User, UserCheck, Sparkles, Clock, ChevronLeft, Loader2, Package,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  assumirConversa, devolverParaBot, enviarCatalogo, enviarMensagem, marcarComoLida,
} from "@/lib/actions";
import { Badge, Button, Vazio } from "@/components/ui";
import { CANAL, ESTADO_CONVERSA } from "@/lib/labels";
import { brl, cn, hora, iniciais, telefone, tempoRelativo } from "@/lib/utils";
import type { Conversa, Mensagem } from "@/lib/types";

type Filtro = "todas" | "nao_lidas" | "bot" | "humano" | "whatsapp" | "instagram";

const FILTROS: Array<{ chave: Filtro; rotulo: string }> = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "nao_lidas", rotulo: "Não lidas" },
  { chave: "humano", rotulo: "Com atendente" },
  { chave: "bot", rotulo: "Com bot" },
];

export function Inbox({
  conversas: conversasIniciais,
  mensagensIniciais,
  conversaInicial,
}: {
  conversas: Conversa[];
  mensagensIniciais: Mensagem[];
  conversaInicial: string | null;
}) {
  const [conversas, setConversas] = useState(conversasIniciais);
  const [ativaId, setAtivaId] = useState<string | null>(conversaInicial);
  const [mensagens, setMensagens] = useState<Mensagem[]>(mensagensIniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [enviando, iniciarEnvio] = useTransition();
  const [mobileAberto, setMobileAberto] = useState(Boolean(conversaInicial));
  const fim = useRef<HTMLDivElement>(null);

  // sincroniza a lista quando o servidor entrega dados novos (padrão oficial
  // de ajuste de estado derivado de props, sem efeito)
  const [ultimasDoServidor, setUltimasDoServidor] = useState(conversasIniciais);
  if (conversasIniciais !== ultimasDoServidor) {
    setUltimasDoServidor(conversasIniciais);
    setConversas(conversasIniciais);
  }

  const ativa = conversas.find((c) => c.id === ativaId) ?? null;

  const [otimistas, addOtimista] = useOptimistic(
    mensagens,
    (state: Mensagem[], nova: Mensagem) => [...state, nova],
  );

  /* ---------------- realtime: novas mensagens ---------------- */
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !ativaId) return;
    const canal = supabase
      .channel(`chat-${ativaId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${ativaId}` },
        (payload: { new: Mensagem }) => setMensagens((m) =>
          m.some((x) => x.id === payload.new.id) ? m : [...m, payload.new]),
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [ativaId]);

  /* ---------------- realtime: lista de conversas ---------------- */
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const canal = supabase
      .channel("inbox-lista")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        fetch("/api/conversas").then((r) => r.json()).then((d) => setConversas(d.conversas ?? []))
          .catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [otimistas.length, ativaId]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (filtro === "nao_lidas" && c.nao_lidas === 0) return false;
      if (filtro === "bot" && !c.bot_ativo) return false;
      if (filtro === "humano" && c.bot_ativo) return false;
      if (filtro === "whatsapp" && c.canal !== "whatsapp") return false;
      if (filtro === "instagram" && c.canal !== "instagram") return false;
      if (!t) return true;
      return (
        (c.cliente?.nome ?? "").toLowerCase().includes(t) ||
        (c.cliente?.telefone ?? "").includes(t) ||
        (c.ultima_mensagem ?? "").toLowerCase().includes(t)
      );
    });
  }, [conversas, busca, filtro]);

  async function abrir(c: Conversa) {
    if (c.id === ativaId) { setMobileAberto(true); return; }

    setAtivaId(c.id);
    setMobileAberto(true);
    setMensagens([]);
    setCarregandoMensagens(true);

    try {
      const r = await fetch(`/api/mensagens?c=${c.id}`).then((x) => x.json());
      setMensagens(r?.mensagens ?? []);
    } catch {
      setMensagens([]);
    } finally {
      setCarregandoMensagens(false);
    }

    if (c.nao_lidas > 0) {
      setConversas((lista) => lista.map((x) => (x.id === c.id ? { ...x, nao_lidas: 0 } : x)));
      marcarComoLida(c.id);
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || !ativaId) return;
    setTexto("");
    iniciarEnvio(async () => {
      addOtimista({
        id: `tmp-${Date.now()}`, conversation_id: ativaId, sender_type: "atendente",
        tipo: "texto", conteudo, arquivo_url: null, status: "pendente",
        created_at: new Date().toISOString(),
      });
      await enviarMensagem(ativaId, conteudo);
      const r = await fetch(`/api/mensagens?c=${ativaId}`).then((x) => x.json()).catch(() => null);
      if (r?.mensagens) setMensagens(r.mensagens);
    });
  }

  function alternarBot() {
    if (!ativa) return;
    const paraBot = !ativa.bot_ativo;
    setConversas((l) => l.map((c) => (c.id === ativa.id ? { ...c, bot_ativo: paraBot } : c)));
    iniciarEnvio(async () => {
      await (paraBot ? devolverParaBot(ativa.id) : assumirConversa(ativa.id));
      const r = await fetch(`/api/mensagens?c=${ativa.id}`).then((x) => x.json()).catch(() => null);
      if (r?.mensagens) setMensagens(r.mensagens);
    });
  }

  const naoLidas = conversas.reduce((a, c) => a + c.nao_lidas, 0);

  return (
    <div className="panel grid h-[calc(100vh-108px)] grid-cols-1 overflow-hidden lg:grid-cols-[320px_1fr_280px] xl:grid-cols-[340px_1fr_300px]">
      {/* ------------------------------- LISTA ------------------------------- */}
      <div className={cn(
        "flex min-h-0 flex-col border-r border-[var(--linha)]",
        mobileAberto && "hidden lg:flex",
      )}>
        <div className="shrink-0 space-y-2.5 border-b border-[var(--linha)] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa, nome ou telefone"
              className="h-8 w-full rounded-lg bg-ink-850 pl-8 pr-3 text-[11px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60"
            />
          </div>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {FILTROS.map((f) => (
              <button
                key={f.chave}
                onClick={() => setFiltro(f.chave)}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition",
                  filtro === f.chave
                    ? "bg-brand-500/18 text-brand-200 ring-1 ring-inset ring-brand-500/30"
                    : "text-ink-500 hover:bg-ink-800 hover:text-ink-300",
                )}
              >
                {f.rotulo}
                {f.chave === "nao_lidas" && naoLidas > 0 && (
                  <span className="ml-1 rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                    {naoLidas}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtradas.length === 0 && (
            <Vazio icone={MessageCircle} titulo="Nenhuma conversa" descricao="Ajuste os filtros ou aguarde novos contatos." />
          )}
          <ul className="divide-y divide-[var(--linha)]">
            {filtradas.map((c) => {
              const on = c.id === ativaId;
              const canal = CANAL[c.canal];
              return (
                <li key={c.id}>
                  <button
                    onClick={() => abrir(c)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition",
                      on ? "bg-brand-500/12" : "hover:bg-ink-850",
                    )}
                  >
                    <span className="relative shrink-0">
                      <span className={cn(
                        "grid size-9 place-items-center rounded-full text-[11px] font-bold",
                        on ? "bg-brand-500 text-white" : "bg-ink-800 text-ink-300",
                      )}>
                        {iniciais(c.cliente?.nome)}
                      </span>
                      <span
                        className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full ring-2 ring-ink-900"
                        style={{ background: canal.cor }}
                      >
                        {c.canal === "instagram"
                          ? <AtSign className="size-2.5 text-white" />
                          : <MessageCircle className="size-2.5 text-white" />}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn(
                          "truncate text-[11px] font-semibold",
                          on ? "text-brand-100" : "text-ink-200",
                        )}>
                          {c.cliente?.nome || "Sem nome"}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-ink-500">
                          {tempoRelativo(c.ultima_mensagem_em)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate text-[11px] text-ink-500">{c.ultima_mensagem ?? "—"}</span>
                        {c.nao_lidas > 0 && (
                          <span className="ml-auto shrink-0 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                            {c.nao_lidas}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex items-center gap-1">
                        {c.bot_ativo
                          ? <Badge tom="brand"><Bot className="size-2.5" />bot</Badge>
                          : <Badge tom="gold"><UserCheck className="size-2.5" />atendente</Badge>}
                        <Badge tom={ESTADO_CONVERSA[c.estado].tom}>{ESTADO_CONVERSA[c.estado].rotulo}</Badge>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ------------------------------ CONVERSA ------------------------------ */}
      <div className={cn(
        "flex min-h-0 flex-col",
        !mobileAberto && "hidden lg:flex",
      )}>
        {!ativa ? (
          <Vazio
            icone={MessageCircle}
            titulo="Selecione uma conversa"
            descricao="A caixa de entrada reúne WhatsApp e Instagram no mesmo lugar."
          />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--linha)] px-3 py-2.5">
              <button
                onClick={() => setMobileAberto(false)}
                className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-800 lg:hidden"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] font-bold text-ink-200">
                {iniciais(ativa.cliente?.nome)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink-100">
                  {ativa.cliente?.nome || "Sem nome"}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  <span style={{ color: CANAL[ativa.canal].cor }}>{CANAL[ativa.canal].rotulo}</span>
                  <span>·</span>
                  <span className="tabular-nums">{telefone(ativa.cliente?.telefone)}</span>
                </p>
              </div>
              <Badge tom={ESTADO_CONVERSA[ativa.estado].tom} className="hidden sm:inline-flex">
                {ESTADO_CONVERSA[ativa.estado].rotulo}
              </Badge>
              <Button
                tamanho="sm"
                onClick={() => {
                  iniciarEnvio(async () => {
                    const r = await enviarCatalogo(ativa.id);
                    const atualizadas = await fetch(`/api/mensagens?c=${ativa.id}`)
                      .then((x) => x.json()).catch(() => null);
                    if (atualizadas?.mensagens) setMensagens(atualizadas.mensagens);
                    if (!r.ok) console.error(r.erro);
                  });
                }}
                disabled={enviando}
                title="Envia o catálogo e agenda o retorno em 5 minutos"
              >
                <Package className="size-3.5" /> Catálogo
              </Button>

              <Button
                variante={ativa.bot_ativo ? "primario" : "ok"}
                tamanho="sm"
                onClick={alternarBot}
                disabled={enviando}
              >
                {ativa.bot_ativo
                  ? <><User className="size-3.5" />Assumir</>
                  : <><Bot className="size-3.5" />Devolver ao bot</>}
              </Button>
            </div>

            {!ativa.bot_ativo && (
              <div className="shrink-0 border-b border-gold-500/20 bg-gold-500/8 px-4 py-1.5 text-[11px] text-gold-400">
                Bot pausado nesta conversa — as respostas automáticas estão desligadas.
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {carregandoMensagens && <EsqueletoConversa />}

              {!carregandoMensagens && otimistas.length === 0 && (
                <p className="py-10 text-center text-[11px] text-ink-500">
                  Nenhuma mensagem nesta conversa ainda.
                </p>
              )}

              {!carregandoMensagens && otimistas.map((m, i) => (
                <Bolha key={m.id} mensagem={m} anterior={otimistas[i - 1]} />
              ))}
              <div ref={fim} />
            </div>

            <form onSubmit={enviar} className="flex shrink-0 items-center gap-2 border-t border-[var(--linha)] p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={ativa.bot_ativo ? "Assuma a conversa para responder…" : "Escreva sua mensagem…"}
                disabled={ativa.bot_ativo || enviando}
                className="h-10 flex-1 rounded-xl bg-ink-850 px-3.5 text-[13px] text-ink-100 ring-1 ring-inset ring-[var(--linha)] placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60 disabled:opacity-50"
              />
              <Button
                type="submit"
                variante="primario"
                tamanho="icone"
                aria-label="Enviar mensagem"
                title="Enviar mensagem"
                disabled={ativa.bot_ativo || enviando || !texto.trim()}
                className="rounded-xl"
              >
                {enviando
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Send className="size-4" />}
              </Button>
            </form>
          </>
        )}
      </div>

      {/* ------------------------------- FICHA ------------------------------- */}
      <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-[var(--linha)] lg:flex">
        {ativa?.cliente ? <Ficha conversa={ativa} /> : (
          <div className="grid h-full place-items-center px-6 text-center text-[11px] text-ink-500">
            Ficha do cliente
          </div>
        )}
      </aside>
    </div>
  );
}

/** Bolhas cinza enquanto o histórico da conversa chega. */
function EsqueletoConversa() {
  const larguras = ["58%", "42%", "70%", "35%", "64%"];
  return (
    <div className="space-y-3 py-2">
      {larguras.map((largura, i) => (
        <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
          <div
            className={cn(
              "skeleton h-9",
              i % 2 === 0 ? "rounded-xl rounded-bl-sm" : "rounded-xl rounded-br-sm",
            )}
            style={{ width: largura }}
          />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- BOLHA */
function Bolha({ mensagem, anterior }: { mensagem: Mensagem; anterior?: Mensagem }) {
  const meu = mensagem.sender_type !== "cliente";
  const sistema = mensagem.sender_type === "sistema";
  const novoDia =
    !anterior ||
    new Date(anterior.created_at).toDateString() !== new Date(mensagem.created_at).toDateString();

  if (sistema) {
    return (
      <>
        {novoDia && <Separador data={mensagem.created_at} />}
        <div className="flex justify-center py-1">
          <span className="rounded-full bg-ink-850 px-3 py-1 text-[10px] text-ink-500">
            {mensagem.conteudo}
          </span>
        </div>
      </>
    );
  }

  const bot = mensagem.sender_type === "bot";

  return (
    <>
      {novoDia && <Separador data={mensagem.created_at} />}
      <div className={cn("flex animate-in-up", meu ? "justify-end" : "justify-start")}>
        <div className={cn(
          "max-w-[78%] rounded-xl px-3.5 py-2 text-[13px] leading-relaxed",
          meu
            ? bot
              ? "rounded-br-sm bg-brand-500/22 text-brand-50 ring-1 ring-inset ring-brand-500/25"
              : "rounded-br-sm bg-brand-500 text-white"
            : "rounded-bl-sm bg-ink-800 text-ink-100",
        )}>
          {bot && (
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-brand-300">
              <Sparkles className="size-2.5" /> Bot
            </p>
          )}
          <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
          <p className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums",
            meu ? "text-white/55" : "text-ink-500",
          )}>
            {hora(mensagem.created_at)}
            {meu && (mensagem.status === "lida"
              ? <CheckCheck className="size-3" />
              : mensagem.status === "pendente"
                ? <Clock className="size-2.5" />
                : <Check className="size-3" />)}
          </p>
        </div>
      </div>
    </>
  );
}

function Separador({ data }: { data: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-ink-800" />
      <span className="text-[10px] uppercase tracking-wide text-ink-500">
        {new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
      </span>
      <span className="h-px flex-1 bg-ink-800" />
    </div>
  );
}

/* --------------------------------------------------------------- FICHA */
function Ficha({ conversa }: { conversa: Conversa }) {
  const c = conversa.cliente!;
  return (
    <div className="space-y-4 p-4">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-[15px] font-bold text-white">
          {iniciais(c.nome)}
        </span>
        <p className="mt-2 text-[13px] font-semibold text-ink-100">{c.nome}</p>
        <p className="text-[11px] tabular-nums text-ink-500">{telefone(c.telefone)}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {c.maioridade_validada && <Badge tom="ok">+18 validado</Badge>}
          {c.tags?.map((t) => <Badge key={t} tom="brand">{t}</Badge>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Mini rotulo="Pedidos" valor={String(c.total_pedidos ?? 0)} />
        <Mini rotulo="Ticket médio" valor={brl(c.ticket_medio)} />
        <Mini rotulo="Total comprado" valor={brl(c.total_comprado)} className="col-span-2" />
      </div>

      <div className="space-y-2 border-t border-[var(--linha)] pt-3 text-[11px]">
        <Linha rotulo="Canal" valor={CANAL[conversa.canal].rotulo} />
        <Linha rotulo="Origem" valor={c.origem ?? "—"} />
        <Linha rotulo="Primeiro contato" valor={new Date(c.created_at).toLocaleDateString("pt-BR")} />
        <Linha rotulo="Última compra" valor={c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString("pt-BR") : "nunca"} />
        <Linha rotulo="Etapa do funil" valor={ESTADO_CONVERSA[conversa.estado].rotulo} />
      </div>

      <div className="border-t border-[var(--linha)] pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-300">
          <ShoppingBag className="size-3" /> Ações rápidas
        </p>
        <div className="space-y-1.5">
          <Link href={`/clientes/${c.id}`} className="block">
            <Button tamanho="sm" className="w-full justify-start">
              <Phone className="size-3.5" /> Ver ficha completa
            </Button>
          </Link>
          <Link href={`/pedidos?q=${encodeURIComponent(c.telefone ?? c.nome)}`} className="block">
            <Button tamanho="sm" className="w-full justify-start">
              <ShoppingBag className="size-3.5" /> Pedidos do cliente
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Mini({ rotulo, valor, className }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={cn("rounded-lg bg-ink-850 px-2.5 py-2", className)}>
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
      <p className="mt-0.5 text-[13px] font-bold tabular-nums text-ink-100">{valor}</p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-500">{rotulo}</span>
      <span className="truncate font-medium text-ink-200">{valor}</span>
    </div>
  );
}
