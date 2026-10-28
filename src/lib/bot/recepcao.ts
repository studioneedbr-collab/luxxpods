import "server-only";
import { clienteDoSistema, type ClienteSistema } from "../supabase/sistema";
import { STORE_ID } from "../supabase/config";
import { enfileirar, cancelarJobs } from "../fila/worker";
import { demo, demoAbrirAtendimento, demoEnviarMensagem } from "../demo";
import { validarTelefone } from "./telefone";
import type { AtualizacaoStatus, MensagemEntrada } from "../canal/tipos";

/**
 * Onde a mensagem do cliente entra no sistema.
 *
 * A ordem importa e é a do escopo (§33): localizar o cliente, achar ou criar
 * a conversa, GRAVAR a mensagem, e só então processar. Gravar primeiro
 * garante que nenhum contato se perde se o processamento falhar.
 */

/**
 * O enum do banco chama de `botao` o que o canal chama de `botoes`: gravado
 * como veio, o insert falhava e toda resposta de botão ou lista se perdia.
 */
function tipoNoBanco(tipo: MensagemEntrada["tipo"]) {
  if (tipo === "botoes") return "botao";
  if (tipo === "desconhecido") return "texto";
  return tipo;
}

export interface Recepcao {
  customerId: string;
  conversationId: string;
  messageId: string;
  leadId: string | null;
  botAtivo: boolean;
  primeiraDoCliente: boolean;
}

export async function receberMensagem(
  mensagem: MensagemEntrada,
  canal: string,
): Promise<Recepcao | null> {
  const telefone = validarTelefone(mensagem.de);
  if (!telefone) {
    // telefone é dado pessoal: no log só o fim
    console.warn(`[luxx] mensagem de número inválido, ignorada: …${String(mensagem.de).slice(-4)}`);
    return null;
  }

  const c = await clienteDoSistema();
  return c
    ? receberNoBanco(c, mensagem, telefone.e164, canal)
    : receberNaDemo(mensagem, telefone.e164);
}

async function receberNoBanco(
  c: ClienteSistema,
  mensagem: MensagemEntrada,
  telefone: string,
  canal: string,
): Promise<Recepcao | null> {
  // idempotência: o provedor reenvia o lote quando não recebe 200 a tempo
  if (mensagem.idExterno) {
    const { data: jaExiste } = await c.from("messages")
      .select("id").eq("external_message_id", mensagem.idExterno).maybeSingle();
    if (jaExiste) return null;
  }

  const canalTipo = canal.includes("instagram") ? "instagram" : "whatsapp";

  // 1) cliente — telefone é único por loja, então o mesmo número sempre cai
  //    no mesmo cadastro e o histórico não se parte em dois
  const { data: existente } = await c.from("customers")
    .select("id, nome").eq("store_id", STORE_ID).eq("telefone", telefone).maybeSingle();

  let customerId = existente?.id as string | undefined;

  if (!customerId) {
    const { data: novo, error } = await c.from("customers")
      .insert({
        store_id: STORE_ID,
        nome: mensagem.nome ?? "",
        telefone,
        canal_origem: canalTipo,
        origem: canalTipo === "instagram" ? "Instagram Direct" : "WhatsApp",
        primeira_interacao: mensagem.recebidaEm.toISOString(),
      })
      .select("id").single();
    if (error) throw new Error(`Falha ao criar cliente: ${error.message}`);
    customerId = novo.id;
  } else if (mensagem.nome && !existente?.nome) {
    // o cliente se apresentou: aproveita o nome que veio do perfil
    await c.from("customers").update({ nome: mensagem.nome }).eq("id", customerId);
  }

  // 2) conversa
  const { data: conversaExistente } = await c.from("conversations")
    .select("id, bot_ativo, estado")
    .eq("store_id", STORE_ID).eq("canal", canalTipo)
    .eq("identificador_externo", telefone)
    .maybeSingle();

  let conversationId = conversaExistente?.id as string | undefined;
  const botAtivo = conversaExistente?.bot_ativo ?? true;
  const primeiraDoCliente = !conversaExistente;

  if (!conversationId) {
    const { data: nova, error } = await c.from("conversations")
      .insert({
        store_id: STORE_ID, customer_id: customerId, canal: canalTipo,
        identificador_externo: telefone, estado: "INITIAL", status: "aberta",
        bot_ativo: true, nao_lidas: 1,
        ultima_mensagem: mensagem.texto ?? `[${mensagem.tipo}]`,
        ultima_mensagem_em: mensagem.recebidaEm.toISOString(),
        ultima_interacao_cliente: mensagem.recebidaEm.toISOString(),
      })
      .select("id").single();
    if (error) throw new Error(`Falha ao criar conversa: ${error.message}`);
    conversationId = nova.id;
  } else {
    await c.from("conversations").update({
      ultima_mensagem: mensagem.texto ?? `[${mensagem.tipo}]`,
      ultima_mensagem_em: mensagem.recebidaEm.toISOString(),
      ultima_interacao_cliente: mensagem.recebidaEm.toISOString(),
      nao_lidas: (conversaExistente?.bot_ativo ? 0 : 1),
      status: "aberta",
    }).eq("id", conversationId);
  }

  // 3) GRAVA a mensagem antes de qualquer processamento
  const { data: gravada, error: erroMsg } = await c.from("messages")
    .insert({
      conversation_id: conversationId,
      store_id: STORE_ID,
      sender_type: "cliente",
      external_message_id: mensagem.idExterno || null,
      tipo: tipoNoBanco(mensagem.tipo),
      conteudo: mensagem.texto ?? null,
      arquivo_url: mensagem.arquivo ?? null,
      status: "lida",
      enviada_em: mensagem.recebidaEm.toISOString(),
    })
    .select("id").single();
  if (erroMsg) throw new Error(`Falha ao gravar mensagem: ${erroMsg.message}`);

  // 4) o cliente respondeu: o follow-up pendente perde o sentido
  await cancelarJobs(conversationId!, "followup_catalogo");

  // 5) atendimento aberto — cria um novo se o anterior já fechou
  const { data: lead } = await c.rpc("abrir_atendimento", {
    p_conversation_id: conversationId,
    p_origem: canalTipo === "instagram" ? "Instagram Direct" : "WhatsApp",
  });

  return {
    customerId: customerId!,
    conversationId: conversationId!,
    messageId: gravada.id,
    leadId: (lead as { id?: string } | null)?.id ?? null,
    botAtivo,
    primeiraDoCliente,
  };
}

/**
 * O que a loja escreveu direto no celular.
 *
 * Antes isto era descartado: quem respondia pelo aparelho via a conversa no
 * painel com buraco, só com o lado do cliente. Agora entra como mensagem de
 * atendente — e pausa o bot, porque uma pessoa está conversando e o bot
 * responderia por cima dela na próxima mensagem do cliente.
 *
 * O eco do que saiu pelo painel normalmente vem marcado como `fromApi` e nem
 * chega aqui; quando não vem, a mesma mensagem já gravada nos últimos minutos
 * sem id externo é reconhecida e só ganha o id, em vez de duplicar.
 */
export async function registrarEnviadaPeloCelular(
  mensagem: MensagemEntrada,
  canal: string,
): Promise<boolean> {
  const telefone = validarTelefone(mensagem.de);
  if (!telefone) return false;

  const c = await clienteDoSistema();
  if (!c) return false;

  if (mensagem.idExterno) {
    const { data: jaExiste } = await c.from("messages")
      .select("id").eq("external_message_id", mensagem.idExterno).maybeSingle();
    if (jaExiste) return false;
  }

  const canalTipo = canal.includes("instagram") ? "instagram" : "whatsapp";
  const quando = mensagem.recebidaEm.toISOString();
  const texto = mensagem.texto ?? `[${mensagem.tipo}]`;

  const { data: conversa } = await c.from("conversations")
    .select("id, bot_ativo")
    .eq("store_id", STORE_ID).eq("canal", canalTipo)
    .eq("identificador_externo", telefone.e164)
    .maybeSingle();

  let conversationId = conversa?.id as string | undefined;

  if (conversationId) {
    const recente = new Date(mensagem.recebidaEm.getTime() - 5 * 60_000).toISOString();
    const { data: eco } = await c.from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .in("sender_type", ["atendente", "bot"])
      .is("external_message_id", null)
      .eq("conteudo", texto)
      .gte("created_at", recente)
      .limit(1).maybeSingle();

    if (eco) {
      await c.from("messages")
        .update({ external_message_id: mensagem.idExterno || null })
        .eq("id", eco.id);
      return false;
    }
  } else {
    // a loja puxou assunto com alguém que nunca escreveu
    const { data: existente } = await c.from("customers")
      .select("id").eq("store_id", STORE_ID).eq("telefone", telefone.e164).maybeSingle();

    let customerId = existente?.id as string | undefined;
    if (!customerId) {
      const { data: novo, error } = await c.from("customers").insert({
        store_id: STORE_ID, nome: mensagem.nome ?? "", telefone: telefone.e164,
        canal_origem: canalTipo, origem: "Contato iniciado pela loja",
        primeira_interacao: quando,
      }).select("id").single();
      if (error) throw new Error(`Falha ao criar cliente: ${error.message}`);
      customerId = novo.id;
    }

    const { data: nova, error } = await c.from("conversations").insert({
      store_id: STORE_ID, customer_id: customerId, canal: canalTipo,
      identificador_externo: telefone.e164, estado: "HUMAN", status: "aberta",
      bot_ativo: false, nao_lidas: 0,
    }).select("id").single();
    if (error) throw new Error(`Falha ao criar conversa: ${error.message}`);
    conversationId = nova.id;
  }

  const { error: erroMsg } = await c.from("messages").insert({
    conversation_id: conversationId,
    store_id: STORE_ID,
    sender_type: "atendente",
    external_message_id: mensagem.idExterno || null,
    tipo: tipoNoBanco(mensagem.tipo),
    conteudo: mensagem.texto ?? null,
    arquivo_url: mensagem.arquivo ?? null,
    status: "enviada",
    enviada_em: quando,
  });
  if (erroMsg) throw new Error(`Falha ao gravar mensagem: ${erroMsg.message}`);

  await c.from("conversations").update({
    ultima_mensagem: texto,
    ultima_mensagem_em: quando,
    ultima_interacao_sistema: quando,
    ...(conversa?.bot_ativo ? { bot_ativo: false, estado: "HUMAN" } : {}),
  }).eq("id", conversationId);

  if (conversa?.bot_ativo) {
    await c.from("messages").insert({
      conversation_id: conversationId, store_id: STORE_ID,
      sender_type: "sistema", tipo: "sistema",
      conteudo: "Respondido pelo celular. Bot pausado nesta conversa.",
    });
  }

  // quem respondeu já cuidou: o "conseguiu ver o catálogo?" perde o sentido
  await cancelarJobs(conversationId!, "followup_catalogo");
  return true;
}

/** Mesmo fluxo na base de demonstração, para exercitar o bot sem WhatsApp. */
function receberNaDemo(mensagem: MensagemEntrada, telefone: string): Recepcao | null {
  const d = demo();

  if (mensagem.idExterno && d.mensagens.some((m) => m.id === mensagem.idExterno)) {
    return null;
  }

  let cliente = d.clientes.find(
    (x) => x.telefone?.replace(/\D/g, "") === telefone.replace(/^55/, ""));

  if (!cliente) {
    cliente = {
      id: `cli-${Date.now()}`,
      nome: mensagem.nome ?? "",
      telefone: telefone.replace(/^55/, ""),
      instagram_username: null,
      canal_origem: "whatsapp",
      origem: "WhatsApp",
      maioridade_validada: false,
      tags: [],
      total_pedidos: 0, total_comprado: 0, ticket_medio: 0,
      ultima_compra: null,
      ultima_interacao: mensagem.recebidaEm.toISOString(),
      created_at: mensagem.recebidaEm.toISOString(),
      observacoes: null,
    };
    d.clientes.unshift(cliente);
  }

  let conversa = d.conversas.find((x) => x.customer_id === cliente!.id);
  const primeiraDoCliente = !conversa;

  if (!conversa) {
    conversa = {
      id: `conv-${Date.now()}`,
      customer_id: cliente.id,
      canal: "whatsapp",
      estado: "INITIAL",
      status: "aberta",
      bot_ativo: true,
      nao_lidas: 1,
      ultima_mensagem: mensagem.texto ?? null,
      ultima_mensagem_em: mensagem.recebidaEm.toISOString(),
      responsavel_id: null,
      created_at: mensagem.recebidaEm.toISOString(),
      cliente,
      lead_id: null,
    };
    d.conversas.unshift(conversa);
  } else {
    conversa.ultima_mensagem = mensagem.texto ?? null;
    conversa.ultima_mensagem_em = mensagem.recebidaEm.toISOString();
    if (!conversa.bot_ativo) conversa.nao_lidas += 1;
  }

  const gravada = demoEnviarMensagem(
    conversa.id, mensagem.texto ?? "", "cliente", mensagem.idExterno);
  const lead = demoAbrirAtendimento(conversa.id);

  return {
    customerId: cliente.id,
    conversationId: conversa.id,
    messageId: gravada.id,
    leadId: lead?.id ?? null,
    botAtivo: conversa.bot_ativo,
    primeiraDoCliente,
  };
}

/**
 * Status de entrega vindo do provedor.
 * É o que separa "mandei" de "chegou" — sem isso, mensagem perdida some sem
 * ninguém notar.
 */
export async function registrarStatus(s: AtualizacaoStatus): Promise<void> {
  if (!s.idExterno) return;

  const c = await clienteDoSistema();
  if (!c) {
    const msg = demo().mensagens.find((m) => m.id === s.idExterno);
    if (msg) msg.status = s.status;
    return;
  }

  const campos: Record<string, unknown> = { status: s.status };
  if (s.status === "entregue") campos.entregue_em = s.em.toISOString();
  if (s.status === "lida") campos.lida_em = s.em.toISOString();
  if (s.status === "erro") campos.erro = s.erro ?? "falha na entrega";

  await c.from("messages").update(campos).eq("external_message_id", s.idExterno);
}

/** Agenda o follow-up do catálogo com o tempo que estiver configurado. */
export async function agendarFollowup(conversationId: string): Promise<void> {
  const c = await clienteDoSistema();

  let minutos = 5;
  if (c) {
    const { data } = await c.from("settings")
      .select("valor").eq("store_id", STORE_ID).eq("chave", "atendimento").maybeSingle();
    const cfg = data?.valor as { followup_minutos?: number; followup_ativo?: boolean } | undefined;
    if (cfg?.followup_ativo === false) return;
    minutos = cfg?.followup_minutos ?? 5;
  }

  // um follow-up por vez: reagendar sem cancelar mandaria dois
  await cancelarJobs(conversationId, "followup_catalogo");
  await enfileirar(
    "followup_catalogo",
    { enviado_em: new Date().toISOString() },
    { conversationId, atrasoMs: minutos * 60_000 },
  );
}
