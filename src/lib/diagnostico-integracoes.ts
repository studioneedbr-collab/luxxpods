import "server-only";
import { MeioAsaas } from "./pagamento/asaas";

/**
 * O estado real de cada integração.
 *
 * A tela antes mostrava "aguardando credenciais" fixo no código, o que é
 * pior que não mostrar nada: quem configurou tudo continuava vendo o aviso e
 * não tinha como saber se funcionou. Aqui cada linha é conferida de verdade —
 * e, no caso do pagamento, perguntando ao provedor.
 */

export type Situacao =
  | { tom: "ok"; rotulo: string; detalhe?: string }
  | { tom: "warn"; rotulo: string; detalhe?: string }
  | { tom: "bad"; rotulo: string; detalhe?: string };

function faltando(nomes: string[]): string[] {
  return nomes.filter((n) => !process.env[n]);
}

export async function diagnosticarAsaas(): Promise<Situacao> {
  const asaas = new MeioAsaas();

  if (!asaas.configurado()) {
    return {
      tom: "warn",
      rotulo: "aguardando credenciais",
      detalhe: "Sem ASAAS_API_KEY o sistema gera PIX estático e a baixa é manual.",
    };
  }

  const d = await asaas.diagnosticar();

  if (!d.ok) {
    return { tom: "bad", rotulo: `erro em ${d.ambiente}`, detalhe: d.erro };
  }

  const semToken = !process.env.ASAAS_WEBHOOK_TOKEN;
  return {
    tom: semToken ? "warn" : "ok",
    rotulo: `no ar · ${d.ambiente}`,
    detalhe: semToken
      ? `Recebendo em ${d.chavePix}, mas sem ASAAS_WEBHOOK_TOKEN o webhook aceita qualquer corpo.`
      : `Recebendo em ${d.chavePix}. Pagamento confirma o pedido sozinho.`,
  };
}

export function diagnosticarWhatsapp(): Situacao {
  const falta = faltando([
    "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_VERIFY_TOKEN",
  ]);

  if (falta.length === 3) {
    return {
      tom: "warn",
      rotulo: "aguardando credenciais",
      detalhe: "A mensagem que o atendente escreve fica gravada e enfileirada, mas não sai.",
    };
  }
  if (falta.length > 0) {
    return {
      tom: "bad",
      rotulo: "configuração incompleta",
      detalhe: `Falta ${falta.join(", ")} — com parte das variáveis o envio falha calado.`,
    };
  }
  return { tom: "ok", rotulo: "no ar", detalhe: "Recebendo e enviando pela Cloud API." };
}

export function diagnosticarInstagram(): Situacao {
  const falta = faltando(["INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_ACCESS_TOKEN"]);
  return falta.length > 0
    ? { tom: "warn", rotulo: "aguardando credenciais", detalhe: "O canal está previsto na caixa de entrada, falta o adaptador." }
    : { tom: "ok", rotulo: "credenciais presentes", detalhe: "O adaptador do Direct ainda não foi escrito." };
}

export function diagnosticarImpressora(): Situacao {
  return {
    tom: "warn",
    rotulo: "sem agente local",
    detalhe: "A comanda já entra na fila ao confirmar o pedido; falta quem consuma na loja.",
  };
}
