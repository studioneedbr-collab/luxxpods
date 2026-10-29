"use server";

import { revalidatePath } from "next/cache";
import { CanalFluxoApi } from "./canal/fluxoapi";
import { CanalZApi } from "./canal/zapi";
import {
  classificarAutor, escolherParaHistorico, previaSemHistorico,
  type ChatNormalizado, type MensagemHistorica,
} from "./importar-core";
import { clienteDoSistema } from "./supabase/sistema";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";

/**
 * Traz para o painel as conversas que já existem no WhatsApp conectado.
 *
 * Serve para o primeiro dia: sem isto, a caixa de entrada começa vazia e
 * quem já estava conversando com a loja só aparece quando escrever de novo.
 *
 * O HISTÓRICO depende do provedor, e a diferença é grande:
 *
 * - FluxoAPI: tem `GET /conversations/{id}/messages`, então o conteúdo vem.
 *   Buscar o de todas seria uma chamada assinada por conversa, e a ação do
 *   servidor estoura o tempo no meio; traz o das mais recentes e deixa o
 *   resto se preencher conforme as pessoas escrevem.
 * - Z-API: não tem esse endpoint. Entrega a lista de conversas e as
 *   mensagens NOVAS a partir da conexão; o histórico antigo fica no
 *   aparelho. A conversa nasce com contato, não lidas e data, sem conteúdo.
 */

export interface ResultadoImportacao {
  ok: boolean;
  erro?: string;
  provedor?: string;
  clientes_novos?: number;
  conversas_novas?: number;
  ja_existiam?: number;
  grupos_ignorados?: number;
  /** quantas conversas vieram com o conteúdo das mensagens */
  com_historico?: number;
  mensagens_importadas?: number;
}

/**
 * De onde ler as conversas.
 *
 * A ordem é a de `canalAtivo()`, e por um motivo prático além da coerência:
 * só a FluxoAPI tem histórico de mensagem.
 */
interface Provedor {
  nome: string;
  chats(): Promise<ChatNormalizado[] | null>;
  historico?(idExterno: string): Promise<MensagemHistorica[]>;
}

function escolherProvedor(): Provedor | null {
  const fluxo = new CanalFluxoApi();
  if (fluxo.configurado()) {
    return {
      nome: "FluxoAPI",
      async chats() {
        const r = await fluxo.listarConversas(undefined, 100);
        if (r.erro) {
          console.error(`[luxx] FluxoAPI não listou conversas: ${r.erro}`);
          return null;
        }
        return r.conversas.map((c) => ({
          telefone: c.phone.replace(/\D/g, ""),
          nome: c.contact_name ?? undefined,
          naoLidas: c.unread ?? 0,
          ultimaEm: c.last_message_at ? new Date(c.last_message_at) : undefined,
          arquivado: c.status === "closed",
          idExterno: c.id,
          janelaAte: c.window_expires_at ? new Date(c.window_expires_at) : null,
        }));
      },
      async historico(id) {
        const r = await fluxo.historico(id, 200);
        if (r.erro) {
          console.warn(`[luxx] histórico de ${id} não veio: ${r.erro}`);
          return [];
        }
        return r.mensagens
          .filter((m) => (m.text ?? "").trim() || m.media)
          .map((m) => ({
            idExterno: m.id,
            autor: classificarAutor(m),
            texto: (m.text ?? "").trim() || `[${m.type}]`,
            em: new Date(m.at),
          }));
      },
    };
  }

  const zapi = new CanalZApi();
  if (zapi.configurado()) {
    return {
      nome: "Z-API",
      async chats() {
        const chats = await zapi.listarChats(1, 100);
        if (!chats) return null;
        return chats.map((c) => ({
          telefone: c.telefone,
          nome: c.nome ?? undefined,
          naoLidas: c.naoLidas,
          ultimaEm: c.ultimaEm ?? undefined,
          arquivado: c.arquivado,
        }));
      },
      // a Z-API não tem endpoint de histórico — ver o comentário no topo
    };
  }

  return null;
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

  const provedor = escolherProvedor();
  if (!provedor) {
    return {
      ok: false,
      erro: "Nenhum provedor de WhatsApp configurado. Preencha a FluxoAPI ou a Z-API.",
    };
  }

  const chats = await provedor.chats();
  if (!chats) {
    return {
      ok: false,
      erro: `Não consegui falar com a ${provedor.nome}. Confira se o número está conectado.`,
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
  let comHistorico = 0;
  let mensagensImportadas = 0;

  // só as mais recentes ganham histórico: cada uma é uma chamada assinada à
  // parte, e cem delas estouram o tempo da ação no meio da gravação
  const comConteudo = new Set(
    provedor.historico
      ? escolherParaHistorico(chats).map((c) => c.idExterno).filter(Boolean)
      : [],
  );

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

    const { data: nova, error } = await c.from("conversations").insert({
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
      ultima_mensagem: previaSemHistorico(chat.naoLidas),
      ultima_mensagem_em: chat.ultimaEm?.toISOString() ?? null,
      ultima_interacao_cliente: chat.ultimaEm?.toISOString() ?? null,
    }).select("id").single();

    if (error || !nova) {
      console.error(`[luxx] conversa de ${chat.telefone} não importou: ${error?.message}`);
      continue;
    }
    conversasNovas++;

    /* ---- o conteúdo, quando o provedor tem ---- */

    if (!provedor.historico || !chat.idExterno || !comConteudo.has(chat.idExterno)) {
      continue;
    }

    const mensagens = await provedor.historico(chat.idExterno);
    if (mensagens.length === 0) continue;

    const { error: erroMsg } = await c.from("messages").insert(
      mensagens.map((m) => ({
        conversation_id: nova.id,
        store_id: STORE_ID,
        sender_type: m.autor,
        external_message_id: m.idExterno || null,
        tipo: "texto",
        conteudo: m.texto,
        status: "lida",
        enviada_em: m.em.toISOString(),
      })),
    );

    if (erroMsg) {
      // conversa sem histórico é pior que nada? não: ela já está no painel
      // com o contato, e o atendente responde. Só registra e segue.
      console.warn(`[luxx] histórico de ${chat.telefone} não gravou: ${erroMsg.message}`);
      continue;
    }

    comHistorico++;
    mensagensImportadas += mensagens.length;

    const ultima = mensagens.at(-1);
    if (ultima) {
      await c.from("conversations").update({
        ultima_mensagem: ultima.texto.slice(0, 500),
        ultima_mensagem_em: ultima.em.toISOString(),
      }).eq("id", nova.id);
    }
  }

  // o bot fica desligado nas importadas de propósito: ele não viu o começo
  // da conversa e responderia como se fosse o primeiro contato
  revalidatePath("/chats");
  revalidatePath("/clientes");
  revalidatePath("/painel-atendimento");

  return {
    ok: true,
    provedor: provedor.nome,
    clientes_novos: clientesNovos,
    conversas_novas: conversasNovas,
    ja_existiam: jaExistiam,
    com_historico: comHistorico,
    mensagens_importadas: mensagensImportadas,
  };
}

/** Quantos chats a Z-API vê, sem gravar nada — para a tela mostrar antes. */
export async function contarChatsDoWhatsapp(): Promise<
  { ok: boolean; total?: number; provedor?: string; temHistorico?: boolean; erro?: string }
> {
  const provedor = escolherProvedor();
  if (!provedor) return { ok: false, erro: "Nenhum provedor de WhatsApp configurado." };

  const chats = await provedor.chats();
  if (!chats) return { ok: false, erro: `Não consegui falar com a ${provedor.nome}.` };

  return {
    ok: true,
    total: chats.length,
    provedor: provedor.nome,
    temHistorico: Boolean(provedor.historico),
  };
}
