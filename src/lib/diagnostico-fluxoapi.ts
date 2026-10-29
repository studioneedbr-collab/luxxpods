/**
 * O que o estado da instância da FluxoAPI significa para a tela.
 *
 * Mora separado e sem `server-only` para ter teste. A decisão que importa
 * aqui é a que eu quase errei: a instância responde `connected` e o envio
 * funciona, mas se `webhook_url` for `null` NENHUMA mensagem de cliente
 * chega. Mostrar isso como verde é pior que não mostrar nada — alguém
 * confere a tela, vê "no ar", e vai descobrir pelo cliente reclamando que
 * ninguém respondeu.
 */
import type { DiagnosticoInstancia } from "./canal/fluxoapi";
import type { Situacao } from "./diagnostico-integracoes";

export interface Ambiente {
  semSegredoDeWebhook: boolean;
  chaveDeTeste: boolean;
  agora?: Date;
}

/** Dias que faltam para o acesso vencer. Abaixo disto, vira aviso. */
const AVISAR_VENCIMENTO_EM = 15;

const ESTADO_EXPLICADO: Record<string, string> = {
  pending: "o número ainda não terminou de conectar",
  disconnected: "o número caiu: reconecte no painel da FluxoAPI",
  suspended: "a instância está suspensa",
};

export function avaliarInstancia(d: DiagnosticoInstancia, amb: Ambiente): Situacao {
  if (!d.ok) return { tom: "bad", rotulo: "FluxoAPI com erro", detalhe: d.erro };

  /* o canal pela metade: conecta, envia, e não recebe nada */
  if (d.webhook === null) {
    return {
      tom: "bad",
      rotulo: "FluxoAPI sem webhook",
      detalhe:
        "O número está conectado e o envio funciona, mas nenhuma mensagem de "
        + "cliente chega: falta cadastrar o webhook no painel da FluxoAPI "
        + "apontando para /api/webhooks/whatsapp.",
    };
  }

  if (d.estado && d.estado !== "connected") {
    return {
      tom: "bad",
      rotulo: `FluxoAPI · ${d.estado}`,
      detalhe: ESTADO_EXPLICADO[d.estado] ?? `a instância está "${d.estado}".`,
    };
  }

  const avisos: string[] = [];

  if (amb.semSegredoDeWebhook) {
    avisos.push("sem FLUXOAPI_WEBHOOK_SECRET qualquer um pode postar no webhook");
  }
  if (amb.chaveDeTeste) {
    avisos.push("a chave é fxk_test_, então nada sai de verdade");
  }
  if (d.modo && d.modo !== "coexistence") {
    // api_only: o dono perde o WhatsApp do número no celular
    avisos.push(`o modo é ${d.modo}: o número não funciona no app do celular`);
  }
  if (d.qualidade === "red" || d.qualidade === "yellow") {
    avisos.push(`a Meta marcou a qualidade do número como ${d.qualidade}`);
  }

  /**
   * O acesso tem validade, e existe um webhook `instance.access_expiring`
   * só por causa disso. Vencer sem ninguém ver derruba o atendimento num
   * dia de movimento.
   */
  const agora = amb.agora ?? new Date();
  const dias = d.acessoExpiraEm
    ? Math.ceil((d.acessoExpiraEm.getTime() - agora.getTime()) / 86_400_000)
    : null;

  if (dias !== null && dias <= AVISAR_VENCIMENTO_EM) {
    avisos.push(dias <= 0
      ? "o acesso VENCEU: renove na FluxoAPI"
      : `o acesso vence em ${dias} dia(s)`);
  }

  const rotulo = `no ar · FluxoAPI${d.numero ? ` · ${d.numero}` : ""}`;
  if (avisos.length > 0) return { tom: "warn", rotulo, detalhe: `${avisos.join("; ")}.` };

  const extras = [
    d.nomeVerificado ? `Aparece como "${d.nomeVerificado}"` : null,
    d.limite24h ? `limite de ${d.limite24h} conversas por dia` : null,
    dias !== null ? `acesso até ${d.acessoExpiraEm?.toLocaleDateString("pt-BR")}` : null,
  ].filter(Boolean);

  return {
    tom: "ok",
    rotulo,
    detalhe: "Cloud API oficial da Meta, em modo coexistência: o número segue "
      + "funcionando no celular do dono, e quando ele responde por lá o bot se "
      + `cala naquela conversa. ${extras.join(" · ")}.`,
  };
}
