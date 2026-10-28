"use server";

import { revalidatePath } from "next/cache";
import { CanalZApi } from "./canal/zapi";
import { clienteDoSistema } from "./supabase/sistema";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";

/**
 * Traz para o painel as conversas que já existem no WhatsApp conectado.
 *
 * Serve para o primeiro dia: sem isto, a caixa de entrada começa vazia e
 * quem já estava conversando com a loja só aparece quando escrever de novo.
 *
 * O QUE NÃO VEM, e é importante dizer: o histórico das mensagens. A Z-API
 * entrega a lista de conversas e as mensagens NOVAS a partir da conexão; o
 * histórico antigo fica no aparelho — é assim que o WhatsApp funciona, não é
 * limitação do sistema. Então cada conversa importada nasce com o contato, o
 * contador de não lidas e a data da última mensagem, e o conteúdo começa a
 * ser gravado da conexão em diante.
 */

export interface ResultadoImportacao {
  ok: boolean;
  erro?: string;
  clientes_novos?: number;
  conversas_novas?: number;
  ja_existiam?: number;
  grupos_ignorados?: number;
  leads_abertos?: number;
}

const JANELA_KANBAN_DIAS = 30;

/** Não lida conta como viva mesmo sem data: alguém está esperando resposta. */
function ativaRecentemente(chat: { naoLidas: number; ultimaEm: Date | null }) {
  if (chat.naoLidas > 0) return true;
  if (!chat.ultimaEm) return false;
  return Date.now() - chat.ultimaEm.getTime() < JANELA_KANBAN_DIAS * 86_400_000;
}

export async function importarConversasDoWhatsapp(): Promise<ResultadoImportacao> {
  // quem pede precisa poder mexer em atendimento
  if (!supabaseConfigurado) {
    return { ok: false, erro: "Sistema sem banco configurado." };
  }

  const sessao = await getSupabaseServer();
  if (!sessao) return { ok: false, erro: "Sistema sem banco configurado." };

  const { data: usuario } = await sessao.auth.getUser();
  if (!usuario.user) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  const { data: podeAtender } = await sessao.rpc("posso", {
    p_permissao: "acessar_chat",
  });
  if (podeAtender !== true) {
    return { ok: false, erro: "Seu perfil não pode importar conversas." };
  }

  const canal = new CanalZApi();
  if (!canal.configurado()) {
    return {
      ok: false,
      erro: "Z-API não configurada: falta ZAPI_INSTANCE_ID e ZAPI_TOKEN.",
    };
  }

  const chats = await canal.listarTodosChats();
  if (!chats) {
    return {
      ok: false,
      erro: "Não consegui falar com a Z-API. Confira se a instância está conectada.",
    };
  }

  // a gravação usa a chave de serviço: importação é rotina do sistema, e
  // precisa criar cliente e conversa independentemente do perfil de quem
  // apertou o botão (já conferido acima)
  const c = await clienteDoSistema();
  if (!c) return { ok: false, erro: "Falta a chave de serviço do Supabase." };

  let clientesNovos = 0;
  let conversasNovas = 0;
  let jaExistiam = 0;
  let leadsAbertos = 0;

  for (const chat of chats) {
    // 1) cliente pelo telefone, que é único por loja
    const { data: existente } = await c.from("customers")
      .select("id, nome").eq("store_id", STORE_ID)
      .eq("telefone", chat.telefone).maybeSingle();

    let customerId = existente?.id as string | undefined;

    if (!customerId) {
      const { data: novo, error } = await c.from("customers").insert({
        store_id: STORE_ID,
        nome: chat.nome ?? "",
        telefone: chat.telefone,
        canal_origem: "whatsapp",
        origem: "Importado do WhatsApp",
        primeira_interacao: chat.ultimaEm?.toISOString() ?? new Date().toISOString(),
        ultima_interacao: chat.ultimaEm?.toISOString() ?? null,
        status: "ativo",
      }).select("id").single();

      if (error || !novo) {
        console.error(`[luxx] não importei ${chat.telefone}: ${error?.message}`);
        continue;
      }
      customerId = novo.id;
      clientesNovos++;
    } else if (chat.nome && !existente?.nome) {
      // o nome do WhatsApp preenche quem estava sem nome
      await c.from("customers").update({ nome: chat.nome }).eq("id", customerId);
    }

    // 2) conversa — o identificador externo é o telefone, igual ao webhook,
    //    então a mensagem que chegar depois cai nesta mesma conversa
    const { data: conversa } = await c.from("conversations")
      .select("id").eq("store_id", STORE_ID).eq("canal", "whatsapp")
      .eq("identificador_externo", chat.telefone).maybeSingle();

    if (conversa) { jaExistiam++; continue; }

    const { data: criada, error } = await c.from("conversations").insert({
      store_id: STORE_ID,
      customer_id: customerId,
      canal: "whatsapp",
      identificador_externo: chat.telefone,
      estado: "INITIAL",
      // importada entra como aberta, para alguém olhar; arquivada no
      // WhatsApp entra como resolvida, respeitando o que a loja já decidiu
      status: chat.arquivado ? "resolvida" : "aberta",
      bot_ativo: false,
      nao_lidas: chat.naoLidas,
      ultima_mensagem: chat.naoLidas > 0
        ? "(mensagens não lidas no WhatsApp)"
        : "(conversa importada do WhatsApp)",
      ultima_mensagem_em: chat.ultimaEm?.toISOString() ?? null,
      ultima_interacao_cliente: chat.ultimaEm?.toISOString() ?? null,
    }).select("id").single();

    if (error || !criada) {
      console.error(`[luxx] conversa de ${chat.telefone} não importou: ${error?.message}`);
      continue;
    }
    conversasNovas++;

    // conversa viva entra no kanban como atendimento aberto; a de meses
    // atrás não — senão o funil nasceria com centenas de cards parados
    if (!chat.arquivado && ativaRecentemente(chat)) {
      const { error: erroLead } = await c.rpc("abrir_atendimento", {
        p_conversation_id: criada.id, p_origem: "Importado do WhatsApp",
      });
      if (erroLead) {
        console.error(`[luxx] atendimento de ${chat.telefone} não abriu: ${erroLead.message}`);
      } else {
        leadsAbertos++;
      }
    }
  }

  // o bot fica desligado nas importadas de propósito: ele não viu o começo
  // da conversa e responderia como se fosse o primeiro contato
  revalidatePath("/chats");
  revalidatePath("/clientes");
  revalidatePath("/painel-atendimento");
  revalidatePath("/kanban");

  return {
    ok: true,
    clientes_novos: clientesNovos,
    conversas_novas: conversasNovas,
    ja_existiam: jaExistiam,
    leads_abertos: leadsAbertos,
  };
}

/** Quantos chats a Z-API vê, sem gravar nada — para a tela mostrar antes. */
export async function contarChatsDoWhatsapp(): Promise<
  { ok: boolean; total?: number; erro?: string }
> {
  const canal = new CanalZApi();
  if (!canal.configurado()) {
    return { ok: false, erro: "Z-API não configurada." };
  }

  const chats = await canal.listarTodosChats();
  if (!chats) return { ok: false, erro: "Não consegui falar com a Z-API." };

  return { ok: true, total: chats.length };
}
