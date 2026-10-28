import { after, NextResponse } from "next/server";
import { canalDoWebhook } from "@/lib/canal";
import {
  receberMensagem, registrarEnviadaPeloCelular, registrarStatus,
} from "@/lib/bot/recepcao";
import { processar } from "@/lib/bot/motor";
import { despacharFila } from "@/lib/fila/worker";

export const dynamic = "force-dynamic";
// o bot (e a IA) roda depois da resposta, dentro deste mesmo limite
export const maxDuration = 60;

/**
 * Entrada de mensagens do WhatsApp.
 *
 * Regra da casa: guardar antes de processar. Se o motor de conversa quebrar,
 * a mensagem do cliente continua no banco e o atendente responde à mão — o
 * pior resultado é o bot ficar mudo, nunca perder o contato.
 */

/** A Meta confere a URL do webhook com um GET antes de começar a mandar. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const desafio = params.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(desafio, { status: 200 });
  }
  return new NextResponse("Token de verificação inválido", { status: 403 });
}

export async function POST(req: Request) {
  // o corpo cru é necessário para conferir a assinatura
  const cru = await req.text();

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const canal = canalDoWebhook(corpo);
  if (!canal) {
    // 200 de propósito: formato desconhecido não é culpa do provedor, e
    // devolver erro faria a Meta reenviar o mesmo evento indefinidamente
    return NextResponse.json({ ignorado: "formato não reconhecido" });
  }

  // a Z-API não manda cabeçalho nenhum: o segredo vem na URL cadastrada
  const assinatura =
    req.headers.get("x-hub-signature-256")
    ?? req.headers.get("client-token")
    ?? new URL(req.url).searchParams.get("token");

  if (canal.validarAssinatura && !canal.validarAssinatura(cru, assinatura)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  const evento = canal.interpretarWebhook(corpo);
  if (!evento) return NextResponse.json({ ignorado: "sem conteúdo útil" });

  const resultado = {
    recebidas: 0, ignoradas: 0, status: 0, erros: [] as string[],
  };
  // em ordem: duas mensagens seguidas do cliente não podem ser lidas fora
  // da ordem em que ele mandou
  const paraOBot: Array<() => Promise<void>> = [];

  for (const mensagem of evento.mensagens) {
    try {
      // a loja respondeu pelo celular: entra na conversa, e o bot não
      // responde a si mesmo
      if (mensagem.enviadaPorMim) {
        const gravou = await registrarEnviadaPeloCelular(mensagem, canal.nome);
        if (gravou) resultado.recebidas++; else resultado.ignoradas++;
        continue;
      }

      // null significa recusada (número inválido) ou repetida — nos dois
      // casos não é erro, e contar como recebida esconderia o problema
      const recepcao = await receberMensagem(mensagem, canal.nome);
      if (!recepcao) { resultado.ignoradas++; continue; }

      resultado.recebidas++;

      // o bot responde depois da mensagem já estar gravada — e depois da
      // resposta ao provedor. Antes o webhook esperava o bot e a IA (até ~75s
      // no pior caso): a Z-API desistia e reenviava o mesmo evento.
      if (recepcao.botAtivo && mensagem.texto) {
        const conversa = recepcao.conversationId;
        const texto = mensagem.texto;
        paraOBot.push(async () => {
          try {
            const r = await processar(conversa, texto);
            if (r.respondeu) despacharFila();
          } catch (e) {
            // se o motor quebrar, o contato continua no painel para alguém
            // responder à mão
            console.error("[luxx] o motor de conversa falhou:", e);
          }
        });
      }
    } catch (e) {
      // uma mensagem com problema não pode derrubar as outras do mesmo lote
      resultado.erros.push(e instanceof Error ? e.message : "falha ao receber");
      console.error("[luxx] erro ao receber mensagem:", e);
    }
  }

  for (const s of evento.statusAtualizados) {
    try {
      await registrarStatus(s);
      resultado.status++;
    } catch (e) {
      console.error("[luxx] erro ao registrar status:", e);
    }
  }

  if (paraOBot.length) {
    after(async () => {
      for (const tarefa of paraOBot) await tarefa();
    });
  }

  // sempre 200: qualquer outro código faz o provedor reenviar o lote inteiro,
  // e as mensagens que já entraram virariam duplicata
  return NextResponse.json({ ok: true, ...resultado });
}
