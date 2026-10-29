import { demoEnviarMensagem } from "../demo";
import { supabaseConfigurado } from "../supabase/config";
import type { Canal, EventoCanal, MensagemSaida, ResultadoEnvio } from "./tipos";

/**
 * Canal de mentira, para a base de demonstração.
 *
 * Entrega a mensagem na própria conversa, como se o cliente tivesse recebido.
 * Serve para exercitar o fluxo inteiro — atendente escreve, aparece na tela,
 * follow-up dispara — antes de existir número de WhatsApp.
 */
export class CanalSimulado implements Canal {
  nome = "simulado";

  configurado() {
    return true;
  }

  async enviar(m: MensagemSaida): Promise<ResultadoEnvio> {
    // com banco de verdade não há "demonstração": fingir que entregou fazia
    // a conversa mostrar como enviada uma mensagem que nunca saiu
    if (supabaseConfigurado) {
      return {
        ok: false,
        erro: "Nenhum WhatsApp conectado: configure a Z-API (ou a Meta) na Vercel.",
        tentarDeNovo: false,
      };
    }
    // um número claramente inválido falha, para dar para testar o caminho do erro
    if (!m.para || m.para.length < 10) {
      return { ok: false, erro: "Número inválido", tentarDeNovo: false };
    }
    return { ok: true, idExterno: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  }

  interpretarWebhook(): EventoCanal | null {
    return null;
  }

  /** Simula o cliente respondendo, para testar o bot sem WhatsApp. */
  simularRespostaDoCliente(conversationId: string, texto: string) {
    return demoEnviarMensagem(conversationId, texto, "cliente");
  }
}
