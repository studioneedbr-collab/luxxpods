import "server-only";
import { clienteDoSistema, type ClienteSistema } from "../supabase/sistema";
import { STORE_ID } from "../supabase/config";
import { canalAtivo } from "../canal";
import { validarTelefone } from "../bot/telefone";
import { envioLiberado, type Natureza } from "../bot/ritmo";
import { demo } from "../demo";
import { esperaAteProxima, type Job, type ResultadoJob, type TipoJob } from "./tipos";
import { decidirFollowup, decidirTentativa } from "./decisoes";

/**
 * Consome a fila. Chamado pelo cron.
 *
 * Trabalha em lote pequeno e com orçamento de tempo: a função serverless
 * morre em 60s, e é melhor entregar 8 mensagens e deixar o resto para a
 * próxima rodada do que morrer no meio e não saber o que já saiu.
 */

const ORCAMENTO_MS = 45_000;
const LOTE = 10;

export interface ResultadoRodada {
  processados: number;
  concluidos: number;
  falhados: number;
  cancelados: number;
  detalhes: string[];
}

export async function rodarFila(): Promise<ResultadoRodada> {
  const comeco = Date.now();
  const resultado: ResultadoRodada = {
    processados: 0, concluidos: 0, falhados: 0, cancelados: 0, detalhes: [],
  };

  const c = await clienteDoSistema();
  const jobs = c ? await pegarJobsDoBanco(c) : pegarJobsDaDemo();

  for (const job of jobs) {
    if (Date.now() - comeco > ORCAMENTO_MS) {
      resultado.detalhes.push("orçamento de tempo esgotado — o resto fica para a próxima");
      break;
    }

    resultado.processados++;
    const r = await executar(job);

    const decisao = decidirTentativa(job.tipo, job.tentativas, r);

    if (r.cancelado) {
      resultado.cancelados++;
      await marcar(c, job, "cancelado", r.erro);
    } else if (r.ok) {
      resultado.concluidos++;
      await marcar(c, job, "concluido");
    } else {
      resultado.falhados++;
      await marcar(c, job, decisao.status, r.erro, decisao.reagendar);
    }

    if (r.detalhe) resultado.detalhes.push(r.detalhe);
  }

  return resultado;
}

/* ----------------------------------------------------------- execução ---- */

async function executar(job: Job): Promise<ResultadoJob> {
  switch (job.tipo) {
    case "enviar_mensagem": return enviarMensagem(job);
    case "followup_catalogo": return followupCatalogo(job);
    case "avisar_status_pedido": return avisarStatus(job);
    case "imprimir_pedido": return imprimirPedido(job);
    case "liberar_reservas": return liberarReservas();
    default:
      return { ok: false, erro: `Tipo de job desconhecido: ${job.tipo}`, tentarDeNovo: false };
  }
}

/** Entrega no canal a mensagem que já está gravada na conversa. */
async function enviarMensagem(job: Job): Promise<ResultadoJob> {
  const conteudo = String(job.payload.conteudo ?? "");
  const conversationId = job.conversation_id;
  if (!conteudo || !conversationId) {
    return { ok: false, erro: "Job sem conteúdo ou conversa", tentarDeNovo: false };
  }

  const natureza = (job.payload.natureza as Natureza) ?? "transacional";
  const interruptor = await lerInterruptor();
  if (!envioLiberado(natureza, interruptor)) {
    return {
      ok: false, cancelado: true,
      erro: `Envio de ${natureza} está pausado nas configurações`,
      detalhe: `mensagem não enviada: ${natureza} pausado`,
    };
  }

  const destino = await telefoneDaConversa(conversationId);
  if (!destino) {
    return {
      ok: false, cancelado: true,
      erro: "Conversa sem telefone válido",
      detalhe: "mensagem cancelada: telefone inválido",
    };
  }

  const canal = canalAtivo();
  const envio = await canal.enviar({ para: destino, tipo: "texto", texto: conteudo });

  if (!envio.ok) {
    return { ok: false, erro: envio.erro, tentarDeNovo: envio.tentarDeNovo };
  }

  await marcarMensagemEnviada(String(job.payload.message_id ?? ""), envio.idExterno);
  return { ok: true, detalhe: `mensagem entregue via ${canal.nome}` };
}

/**
 * Follow-up do catálogo.
 *
 * Confere a conversa AGORA, não quando foi agendado: se o cliente respondeu
 * nesse meio tempo, o follow-up não vai. Mandar "conseguiu ver?" para quem
 * acabou de responder é o jeito mais rápido de parecer robô.
 */
async function followupCatalogo(job: Job): Promise<ResultadoJob> {
  const conversationId = job.conversation_id;
  if (!conversationId) return { ok: false, erro: "Job sem conversa", tentarDeNovo: false };

  const enviadoEm = new Date(String(job.payload.enviado_em ?? job.executar_em));
  const conversa = await lerConversa(conversationId);

  const decisao = decidirFollowup(conversa, enviadoEm);
  if (!decisao.enviar) {
    return { ok: false, cancelado: true, detalhe: `follow-up cancelado: ${decisao.motivo}` };
  }

  const nome = (conversa?.cliente_nome ?? "").split(" ")[0];
  const texto = nome
    ? `${nome}, conseguiu dar uma olhada? Me fala qual modelo você gostou que já te mando os sabores disponíveis 🖤`
    : "Conseguiu dar uma olhada? Me fala qual modelo te interessou que já mando os sabores 🖤";

  return enviarMensagem({
    ...job,
    tipo: "enviar_mensagem",
    payload: { conteudo: texto, natureza: "transacional" },
  });
}

/** Avisa o cliente quando o pedido muda de etapa. */
async function avisarStatus(job: Job): Promise<ResultadoJob> {
  const texto = String(job.payload.texto ?? "");
  if (!texto) return { ok: false, erro: "Job sem texto", tentarDeNovo: false };

  return enviarMensagem({
    ...job,
    tipo: "enviar_mensagem",
    payload: { conteudo: texto, natureza: "transacional" },
  });
}

/**
 * Impressão da comanda.
 *
 * Sem agente local configurado, marca como pendente e deixa o pedido na fila
 * da tela de impressão — melhor um aviso visível que um "impresso" falso.
 */
async function imprimirPedido(job: Job): Promise<ResultadoJob> {
  const orderId = String(job.payload.order_id ?? "");
  if (!orderId) return { ok: false, erro: "Job sem pedido", tentarDeNovo: false };

  const agente = process.env.IMPRESSORA_AGENTE_URL;
  if (!agente) {
    return {
      ok: false, cancelado: true,
      detalhe: "sem impressora configurada — o pedido ficou na fila da tela de impressão",
    };
  }

  try {
    const r = await fetch(`${agente}/imprimir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    });
    if (!r.ok) return { ok: false, erro: `Impressora respondeu ${r.status}`, tentarDeNovo: true };

    const c = await clienteDoSistema();
    await c?.from("orders")
      .update({ impresso: true, impresso_em: new Date().toISOString() })
      .eq("id", orderId);

    return { ok: true, detalhe: "comanda impressa" };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "impressora inacessível",
      tentarDeNovo: true,
    };
  }
}

/** Devolve ao estoque o que ficou preso em carrinho abandonado. */
async function liberarReservas(): Promise<ResultadoJob> {
  const c = await clienteDoSistema();
  if (!c) return { ok: true, detalhe: "sem banco: nada a liberar" };

  const { data, error } = await c.rpc("liberar_reservas_expiradas");
  if (error) return { ok: false, erro: error.message, tentarDeNovo: true };

  return { ok: true, detalhe: `${data ?? 0} reserva(s) liberada(s)` };
}

/* -------------------------------------------------------------- apoio ---- */

async function pegarJobsDoBanco(
  c: ClienteSistema,
): Promise<Job[]> {
  const { data } = await c.from("jobs")
    .select("*")
    .eq("status", "pendente")
    .lte("executar_em", new Date().toISOString())
    .order("executar_em")
    .limit(LOTE);
  return (data ?? []) as unknown as Job[];
}

function pegarJobsDaDemo(): Job[] {
  const agora = Date.now();
  return demo().jobs
    .filter((j) => j.status === "pendente" && new Date(j.executar_em).getTime() <= agora)
    .slice(0, LOTE) as unknown as Job[];
}

async function marcar(
  c: ClienteSistema | null,
  job: Job,
  status: Job["status"],
  erro?: string,
  reagendar = false,
) {
  const campos: Record<string, unknown> = {
    status,
    erro: erro ?? null,
    tentativas: job.tentativas + 1,
    processado_em: status === "concluido" ? new Date().toISOString() : null,
  };
  if (reagendar) {
    campos.executar_em = new Date(Date.now() + esperaAteProxima(job.tentativas)).toISOString();
  }

  if (c) {
    await c.from("jobs").update(campos).eq("id", job.id);
  } else {
    const alvo = demo().jobs.find((j) => j.id === job.id);
    if (alvo) Object.assign(alvo, campos);
  }
}

async function lerInterruptor() {
  const c = await clienteDoSistema();
  if (!c) {
    // na demonstração tudo transacional passa; marketing fica desligado
    return { transacional: true, interno: true, cobranca: false, marketing: false };
  }

  const { data } = await c.from("settings")
    .select("valor").eq("store_id", STORE_ID).eq("chave", "whatsapp_envios").maybeSingle();

  // sem configuração, NADA é enviado: liberar o canal justamente quando algo
  // está errado é como o número acaba banido
  return (data?.valor as Record<string, boolean> | undefined) ?? null;
}

async function telefoneDaConversa(conversationId: string): Promise<string | null> {
  const c = await clienteDoSistema();

  if (!c) {
    const conversa = demo().conversas.find((x) => x.id === conversationId);
    return validarTelefone(conversa?.cliente?.telefone)?.e164 ?? null;
  }

  const { data } = await c.from("conversations")
    .select("identificador_externo, customers(telefone)")
    .eq("id", conversationId).maybeSingle();

  const bruto =
    (data?.customers as { telefone?: string } | null)?.telefone ??
    data?.identificador_externo;

  return validarTelefone(bruto)?.e164 ?? null;
}

async function lerConversa(conversationId: string) {
  const c = await clienteDoSistema();

  if (!c) {
    const conversa = demo().conversas.find((x) => x.id === conversationId);
    if (!conversa) return null;
    return {
      bot_ativo: conversa.bot_ativo,
      ultima_interacao_cliente: conversa.ultima_mensagem_em,
      cliente_nome: conversa.cliente?.nome ?? null,
    };
  }

  const { data } = await c.from("conversations")
    .select("bot_ativo, ultima_interacao_cliente, customers(nome)")
    .eq("id", conversationId).maybeSingle();
  if (!data) return null;

  return {
    bot_ativo: data.bot_ativo as boolean,
    ultima_interacao_cliente: data.ultima_interacao_cliente as string | null,
    cliente_nome: (data.customers as { nome?: string } | null)?.nome ?? null,
  };
}

async function marcarMensagemEnviada(messageId: string, idExterno?: string) {
  if (!messageId) return;
  const c = await clienteDoSistema();

  if (c) {
    await c.from("messages")
      .update({ status: "enviada", external_message_id: idExterno ?? null })
      .eq("id", messageId);
  } else {
    const msg = demo().mensagens.find((m) => m.id === messageId);
    if (msg) msg.status = "enviada";
  }
}

/** Enfileira um job novo. */
export async function enfileirar(
  tipo: TipoJob,
  payload: Record<string, unknown>,
  opcoes?: { conversationId?: string | null; atrasoMs?: number },
): Promise<{ ok: boolean; id?: number; erro?: string }> {
  const executarEm = new Date(Date.now() + (opcoes?.atrasoMs ?? 0)).toISOString();
  const c = await clienteDoSistema();

  if (!c) {
    const d = demo();
    const id = (d.jobs.at(-1)?.id ?? 0) + 1;
    d.jobs.push({
      id, tipo, payload,
      conversation_id: opcoes?.conversationId ?? null,
      executar_em: executarEm, status: "pendente", tentativas: 0, erro: null,
    });
    return { ok: true, id };
  }

  const { data, error } = await c.from("jobs")
    .insert({
      store_id: STORE_ID, tipo, payload,
      conversation_id: opcoes?.conversationId ?? null,
      executar_em: executarEm,
    })
    .select("id").single();

  if (error) return { ok: false, erro: error.message };
  return { ok: true, id: data.id };
}

/** Cancela jobs pendentes de um tipo numa conversa — usado no follow-up. */
export async function cancelarJobs(conversationId: string, tipo: TipoJob) {
  const c = await clienteDoSistema();

  if (!c) {
    demo().jobs.forEach((j) => {
      if (j.conversation_id === conversationId && j.tipo === tipo && j.status === "pendente") {
        j.status = "cancelado";
      }
    });
    return;
  }

  await c.from("jobs")
    .update({ status: "cancelado" })
    .eq("conversation_id", conversationId)
    .eq("tipo", tipo)
    .eq("status", "pendente");
}
