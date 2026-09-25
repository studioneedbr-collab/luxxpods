import { NextResponse } from "next/server";
import { canalDoWebhook } from "@/lib/canal";
import { receberMensagem, registrarStatus } from "@/lib/bot/recepcao";
import { processar } from "@/lib/bot/motor";

export const dynamic = "force-dynamic";

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

  const assinatura =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("client-token");

  if (canal.validarAssinatura && !canal.validarAssinatura(cru, assinatura)) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  const evento = canal.interpretarWebhook(corpo);
  if (!evento) return NextResponse.json({ ignorado: "sem conteúdo útil" });

  const resultado = {
    recebidas: 0, ignoradas: 0, respondidas: 0, status: 0, erros: [] as string[],
  };

  for (const mensagem of evento.mensagens) {
    try {
      // null significa recusada (número inválido) ou repetida — nos dois
      // casos não é erro, e contar como recebida esconderia o problema
      const recepcao = await receberMensagem(mensagem, canal.nome);
      if (!recepcao) { resultado.ignoradas++; continue; }

      resultado.recebidas++;

      // o bot responde depois da mensagem já estar gravada: se o motor
      // quebrar, o contato continua no painel para alguém responder à mão
      if (recepcao.botAtivo && mensagem.texto) {
        try {
          const r = await processar(recepcao.conversationId, mensagem.texto);
          if (r.respondeu) resultado.respondidas++;
        } catch (e) {
          console.error("[luxx] o motor de conversa falhou:", e);
          resultado.erros.push("bot não respondeu — a mensagem está no painel");
        }
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

  // sempre 200: qualquer outro código faz o provedor reenviar o lote inteiro,
  // e as mensagens que já entraram virariam duplicata
  return NextResponse.json({ ok: true, ...resultado });
}
