import Link from "next/link";
import {
  Bot, Clock, MessageSquare, MessagesSquare, Target, TrendingUp, UserCheck,
  UserPlus, Users, Zap,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { FiltroPeriodo } from "@/components/dashboard/filtro-periodo";
import { FunilPedidos } from "@/components/dashboard/funil";
import { GraficoPedidosLeads, GraficoRosca } from "@/components/dashboard/charts";
import { Badge, Panel, PanelHeader, Barra } from "@/components/ui";
import { Realtime, PulsoAoVivo } from "@/components/realtime";
import { resolverPeriodo } from "@/lib/periodo";
import { ESTADO_CONVERSA, CANAL } from "@/lib/labels";
import { brl, iniciais, num, pct, tempoRelativo } from "@/lib/utils";
import { getConversas, getFunil, getMetricas, getSerie } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PainelAtendimento({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp.p, sp.de, sp.ate, Number(sp.m ?? 0));

  const [m, serie, funil, conversas] = await Promise.all([
    getMetricas(periodo.inicio, periodo.fim),
    getSerie(periodo.inicio, periodo.fim),
    getFunil(),
    getConversas(),
  ]);

  const comBot = conversas.filter((c) => c.bot_ativo).length;
  const comHumano = conversas.length - comBot;

  const porCanal = [
    { nome: "WhatsApp", valor: conversas.filter((c) => c.canal === "whatsapp").length },
    { nome: "Instagram", valor: conversas.filter((c) => c.canal === "instagram").length },
  ].filter((c) => c.valor > 0);

  const porEstado = Object.entries(
    conversas.reduce<Record<string, number>>((acc, c) => {
      acc[c.estado] = (acc[c.estado] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([estado, qtd]) => ({
    estado, qtd, rotulo: ESTADO_CONVERSA[estado as keyof typeof ESTADO_CONVERSA]?.rotulo ?? estado,
  })).sort((a, b) => b.qtd - a.qtd);

  const naoRespondidas = conversas
    .filter((c) => c.nao_lidas > 0)
    .sort((a, b) => +new Date(a.ultima_mensagem_em ?? 0) - +new Date(b.ultima_mensagem_em ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <Realtime tabelas={["conversations", "messages", "leads"]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo rotulo={periodo.rotulo} />
        <PulsoAoVivo />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Mensagens recebidas" valor={num(m.mensagens_recebidas)} icone={MessageSquare} tom="brand" />
        <StatCard rotulo="Novos leads" valor={num(m.leads)} icone={UserPlus} tom="info"
          sub={`${num(m.leads_ganhos)} ganhos · ${num(m.leads_perdidos)} perdidos`} />
        <StatCard rotulo="Taxa de conversão" valor={pct(m.taxa_conversao)} icone={Target} tom="ok" destaque />
        <StatCard rotulo="1ª resposta (média)" valor={`${num(m.tempo_primeira_resposta)} min`} icone={Clock} tom="gold" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Conversas em andamento" valor={num(m.conversas_abertas)} icone={MessagesSquare} tom="brand" />
        <StatCard rotulo="Aguardando cliente" valor={num(m.conversas_aguardando)} icone={Clock} tom="info" />
        <StatCard rotulo="Não respondidas" valor={num(m.conversas_nao_respondidas)} icone={Zap}
          tom={m.conversas_nao_respondidas > 0 ? "bad" : "ok"} />
        <StatCard rotulo="Faturamento do bot" valor={brl(m.faturamento_bot)} icone={TrendingUp} tom="ok"
          sub={`${pct(m.faturamento > 0 ? (m.faturamento_bot / m.faturamento) * 100 : 0)} do total`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader titulo="Leads e pedidos por dia" icone={Users}
            descricao={`${periodo.rotulo} · ${num(m.leads)} leads gerados`} />
          <div className="p-2 pr-4"><GraficoPedidosLeads dados={serie} /></div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Bot x Atendente" icone={Bot} descricao="Quem está conduzindo agora" />
          <div className="space-y-4 px-5 py-4">
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-brand-300">
                  <Bot className="size-3.5" /> Chatbot
                </span>
                <span className="font-bold tabular-nums text-ink-100">{num(comBot)}</span>
              </div>
              <Barra valor={conversas.length ? (comBot / conversas.length) * 100 : 0} tom="brand" className="mt-1.5" />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-gold-400">
                  <UserCheck className="size-3.5" /> Atendente humano
                </span>
                <span className="font-bold tabular-nums text-ink-100">{num(comHumano)}</span>
              </div>
              <Barra valor={conversas.length ? (comHumano / conversas.length) * 100 : 0} tom="warn" className="mt-1.5" />
            </div>

            <div className="border-t border-[var(--linha)] pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">Canais de entrada</p>
              {porCanal.length > 0 ? <GraficoRosca dados={porCanal} altura={160} />
                : <p className="py-6 text-center text-[11px] text-ink-500">Sem conversas</p>}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel>
          <PanelHeader titulo="Esperando resposta" icone={Zap}
            descricao="Mais antigas primeiro"
            acao={<Link href="/chats" className="text-[11px] font-medium text-brand-300 hover:text-brand-200">abrir chats</Link>} />
          <ul className="divide-y divide-[var(--linha)]">
            {naoRespondidas.length === 0 && (
              <li className="px-5 py-8 text-center text-[11px] text-ink-500">Tudo respondido ✅</li>
            )}
            {naoRespondidas.map((c) => (
              <li key={c.id}>
                <Link href={`/chats?c=${c.id}`} className="flex items-center gap-2.5 px-5 py-2.5 transition hover:bg-ink-850">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">
                    {iniciais(c.cliente?.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-ink-200">{c.cliente?.nome ?? "Sem nome"}</p>
                    <p className="truncate text-[11px] text-ink-500">{c.ultima_mensagem}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-bad-500 px-1.5 text-[10px] font-bold text-white">
                      {c.nao_lidas}
                    </span>
                    <p className="mt-0.5 text-[10px] text-ink-500">{tempoRelativo(c.ultima_mensagem_em)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader titulo="Estado das conversas" icone={MessagesSquare}
            descricao="Onde os clientes estão parados" />
          <div className="space-y-2 px-5 py-4">
            {porEstado.map((e) => (
              <div key={e.estado}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-ink-300">{e.rotulo}</span>
                  <span className="font-semibold tabular-nums text-ink-100">{e.qtd}</span>
                </div>
                <Barra
                  valor={conversas.length ? (e.qtd / conversas.length) * 100 : 0}
                  tom="brand" className="mt-1"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader titulo="Funil de leads" icone={Target} />
          <FunilPedidos etapas={funil} />
        </Panel>
      </div>

      <Panel>
        <PanelHeader titulo="Conversas recentes" icone={MessagesSquare}
          acao={<Link href="/chats" className="text-[11px] font-medium text-brand-300 hover:text-brand-200">ver todas</Link>} />
        <div className="grid gap-px bg-ink-850 sm:grid-cols-2 lg:grid-cols-3">
          {conversas.slice(0, 9).map((c) => (
            <Link key={c.id} href={`/chats?c=${c.id}`}
              className="bg-ink-900 p-3 transition hover:bg-ink-800">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">
                  {iniciais(c.cliente?.nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-ink-100">{c.cliente?.nome ?? "Sem nome"}</p>
                  <p className="text-[10px]" style={{ color: CANAL[c.canal].cor }}>{CANAL[c.canal].rotulo}</p>
                </div>
                <span className="shrink-0 text-[10px] text-ink-500">{tempoRelativo(c.ultima_mensagem_em)}</span>
              </div>
              <p className="mt-2 truncate text-[11px] text-ink-400">{c.ultima_mensagem}</p>
              <div className="mt-2 flex items-center gap-1">
                <Badge tom={c.bot_ativo ? "brand" : "gold"}>
                  {c.bot_ativo ? "bot" : "atendente"}
                </Badge>
                <Badge tom={ESTADO_CONVERSA[c.estado].tom}>{ESTADO_CONVERSA[c.estado].rotulo}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
