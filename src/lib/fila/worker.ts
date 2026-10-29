import "server-only";
import { after } from "next/server";
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

/**
 * Roda a fila logo depois da resposta, sem esperar o cron.
 *
 * O cron passa uma vez por minuto: sem isto, a resposta do atendente e a do
 * bot levavam até 60s para sair. A trava em `pegarJobsDoBanco` garante que
 * esta rodada e a do cron, se coincidirem, não mandem a mesma mensagem duas
 * vezes.
 */
export function despacharFila() {
  after(async () => {
    try {
      await rodarFila();
    } catch (e) {
      console.error("[luxx] a rodada imediata da fila falhou; o cron tenta de novo:", e);
    }
  });
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
    // falha sem volta: a conversa mostra "falhou" em vez do relógio eterno
    if (!envio.tentarDeNovo) {
      await marcarMensagemComErro(String(job.payload.message_id ?? ""), envio.erro);
    }
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

/** Job preso em "processando" por mais que isto é de uma função que morreu. */
const PRESO_MS = 3 * 60_000;

/**
 * Pega o lote E marca como "processando" na mesma escrita.
 *
 * Só ler os pendentes não bastava a partir do momento em que o painel passou
 * a rodar a fila na hora: duas rodadas ao mesmo tempo liam os mesmos jobs e
 * a mensagem saía duas vezes. O UPDATE condicionado a `status = pendente` é
 * atômico por linha — quem chegar depois não recebe a linha de volta.
 */
async function pegarJobsDoBanco(
  c: ClienteSistema,
): Promise<Job[]> {
  const agora = new Date();

  // a função serverless morre em 60s; o que ficou "processando" além disso
  // nunca vai terminar e volta para a fila
  await c.from("jobs")
    .update({ status: "pendente" })
    .eq("status", "processando")
    .lt("executar_em", new Date(agora.getTime() - PRESO_MS).toISOString());

  const { data: candidatos } = await c.from("jobs")
    .select("id")
    .eq("status", "pendente")
    .lte("executar_em", agora.toISOString())
    .order("executar_em")
    .limit(LOTE);

  const ids = (candidatos ?? []).map((j) => j.id as number);
  if (ids.length === 0) return [];

  // executar_em vira a hora em que foi pego, que é o que mede o "preso"
  const { data } = await c.from("jobs")
    .update({ status: "processando", executar_em: agora.toISOString() })
    .in("id", ids)
    .eq("status", "pendente")
    .select("*");

  return ((data ?? []) as unknown as Job[])
    .sort((a, b) => a.id - b.id);
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

  if (data?.valor) return data.valor as Record<string, boolean>;

  // Linha ausente cai no padrão do código, não em "tudo pausado".
  //
  // Antes isto devolvia null, e `envioLiberado(natureza, null)` é false: num
  // banco onde ninguém salvou essa configuração — e nada a cria — TODA
  // mensagem era cancelada pela fila. Pior, a tela de configurações mostrava
  // o padrão ("transacional ligado") enquanto a fila bloqueava tudo.
  //
  // O padrão mantém a intenção original onde ela importa: marketing e
  // cobrança seguem desligados. Transacional é resposta a quem escreveu
  // primeiro — não é spam e não derruba número.
  const { PADRAO } = await import("../configuracoes");
  console.warn(
    "[luxx] settings.whatsapp_envios não existe no banco; usando o padrão "
    + "(transacional e interno liberados, marketing e cobrança pausados)",
  );
  return PADRAO.whatsapp_envios as unknown as Record<string, boolean>;
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

async function marcarMensagemComErro(messageId: string, erro?: string) {
  if (!messageId) return;
  const c = await clienteDoSistema();
  if (c) {
    await c.from("messages")
      .update({ status: "erro", erro: erro ?? "não foi entregue" })
      .eq("id", messageId);
  }
}

/**
 * O que já foi resolvido há tempo sai do banco.
 *
 * O cron enfileira a limpeza de reservas a cada minuto (~1440 linhas por
 * dia) e nada apagava job nem evento de webhook: a tabela crescia para
 * sempre e a busca da fila ficava mais lenta. Mensagem, pedido e dinheiro
 * NÃO entram aqui — isso é histórico da loja.
 */
export async function limparHistorico(): Promise<{ jobs: number; eventos: number }> {
  const c = await clienteDoSistema();
  if (!c) return { jobs: 0, eventos: 0 };

  const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  const { data: jobs } = await c.from("jobs").delete()
    .in("status", ["concluido", "cancelado"]).lt("created_at", dias(30)).select("id");
  const { data: eventos } = await c.from("webhook_events").delete()
    .eq("processado", true).lt("created_at", dias(90)).select("id");

  return { jobs: jobs?.length ?? 0, eventos: eventos?.length ?? 0 };
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
