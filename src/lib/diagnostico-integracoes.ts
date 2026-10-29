import "server-only";
import { MeioAsaas } from "./pagamento/asaas";
import { diagnosticar as diagnosticarDeepseek } from "./ia/deepseek";
import { CanalFluxoApi } from "./canal/fluxoapi";
import { avaliarInstancia } from "./diagnostico-fluxoapi";

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

/**
 * A IA é opcional de propósito: sem ela o bot segue vendendo, só
 * determinístico. Por isso a ausência é aviso, não erro — mas chave
 * RECUSADA é erro, porque aí alguém configurou e acha que está no ar.
 */
export async function diagnosticarIa(): Promise<Situacao> {
  const d = await diagnosticarDeepseek();

  if (!d.ok && d.erro?.includes("não configurada")) {
    return {
      tom: "warn",
      rotulo: "desligada",
      detalhe: "Sem DEEPSEEK_API_KEY o bot responde só pelo caminho determinístico.",
    };
  }

  if (!d.ok) return { tom: "bad", rotulo: "erro", detalhe: d.erro };

  if (!d.modeloExiste) {
    return {
      tom: "bad",
      rotulo: "modelo inexistente",
      detalhe: `DEEPSEEK_MODELO=${d.modelo} não está na conta. Disponíveis: ${d.disponiveis?.join(", ")}.`,
    };
  }

  return {
    tom: "ok",
    rotulo: `no ar · ${d.modelo}`,
    detalhe: "Entra só no que a palavra-chave não entendeu. Não escreve no banco.",
  };
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

/**
 * O WhatsApp tem dois caminhos, e o diagnóstico precisa conhecer os dois.
 *
 * Antes só olhava as variáveis da Meta: quem configurasse a Z-API continuava
 * vendo "aguardando credenciais" com o canal funcionando — e o `canalAtivo()`
 * já aceitava a Z-API como segunda opção.
 */
export async function diagnosticarWhatsapp(): Promise<Situacao> {
  /**
   * A FluxoAPI é a única que dá para conferir de verdade: ela tem endpoint
   * de estado da instância. Nas outras duas só se vê se a variável está
   * preenchida, o que não prova que a credencial vale.
   */
  const fluxo = new CanalFluxoApi();
  if (fluxo.configurado()) {
    const d = await fluxo.diagnosticar();

    if (!d.ok) {
      return { tom: "bad", rotulo: "FluxoAPI com erro", detalhe: d.erro };
    }

    return avaliarInstancia(d, {
      semSegredoDeWebhook: !process.env.FLUXOAPI_WEBHOOK_SECRET,
      chaveDeTeste: fluxo.ehTeste(),
    });
  }

  const semFluxo = faltando(["FLUXOAPI_KEY", "FLUXOAPI_SECRET", "FLUXOAPI_INSTANCE_ID"]);
  if (semFluxo.length > 0 && semFluxo.length < 3) {
    return {
      tom: "bad",
      rotulo: "FluxoAPI incompleta",
      detalhe: `Falta ${semFluxo.join(", ")} — com parte das variáveis o envio falha calado.`,
    };
  }

  const meta = faltando([
    "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_VERIFY_TOKEN",
  ]);
  const zapi = faltando(["ZAPI_INSTANCE_ID", "ZAPI_TOKEN"]);

  // Meta tem prioridade: é a via oficial, com status de entrega e sem risco
  // de banimento. É a mesma ordem de `canalAtivo()`.
  if (meta.length === 0) {
    return { tom: "ok", rotulo: "no ar · Meta", detalhe: "Via oficial, com status de entrega." };
  }

  if (zapi.length === 0) {
    const semSegredo = !process.env.ZAPI_WEBHOOK_SECRET;
    return {
      tom: "ok",
      rotulo: "no ar · Z-API",
      detalhe: semSegredo
        ? "Funcionando. Sem ZAPI_WEBHOOK_SECRET o webhook aceita qualquer corpo — vale preencher."
        : "Funcionando, com o webhook validando o segredo.",
    };
  }

  // metade preenchida é pior que nada: o envio falha calado
  if (meta.length > 0 && meta.length < 3) {
    return {
      tom: "bad",
      rotulo: "Meta incompleta",
      detalhe: `Falta ${meta.join(", ")} — com parte das variáveis o envio falha calado.`,
    };
  }
  if (zapi.length === 1) {
    return {
      tom: "bad",
      rotulo: "Z-API incompleta",
      detalhe: `Falta ${zapi.join(", ")} — com parte das variáveis o envio falha calado.`,
    };
  }

  return {
    tom: "warn",
    rotulo: "aguardando credenciais",
    detalhe: "A mensagem que o atendente escreve fica gravada e enfileirada, mas não sai. "
      + "Dá para usar a FluxoAPI (oficial, e o número continua no celular), "
      + "a Meta direto, ou a Z-API (com risco de banimento).",
  };
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
