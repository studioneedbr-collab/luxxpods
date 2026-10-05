import "server-only";
import { paraFormatoOpenAI } from "../bot/ferramentas";
import { executar, type Ambiente } from "../bot/executor";
import { conversar, iaConfigurada } from "./deepseek";
import { ferramentasDoModelo } from "./politica";
import { montarContexto, montarPrompt, type EstadoDaConversa } from "./prompt";
import { responderComIa, type ResultadoIa } from "./laco";
import type { Configuracoes } from "../configuracoes";

/**
 * O fio entre o motor do bot e a IA.
 *
 * Existe para o motor não precisar saber de prompt, política nem protocolo —
 * ele chama uma função e recebe texto ou uma recusa. E é aqui que as duas
 * dependências de verdade (banco e internet) entram no laço.
 */

export { type ResultadoIa };

/** As tools não mudam entre mensagens; montar uma vez por processo basta. */
let tools: unknown[] | null = null;
const toolsDoModelo = () => (tools ??= paraFormatoOpenAI(ferramentasDoModelo()));

export function iaLigada(cfg: Configuracoes): boolean {
  return iaConfigurada() && cfg.ia.ativo;
}

export async function atenderComIa(
  textoDoCliente: string,
  ambiente: Ambiente,
  conversa: EstadoDaConversa,
  cfg: Configuracoes,
): Promise<ResultadoIa> {
  const formas = [
    cfg.pagamentos.pix_ativo ? "PIX" : null,
    cfg.pagamentos.dinheiro_ativo ? "dinheiro na entrega" : null,
    cfg.pagamentos.cartao_ativo ? "cartão" : null,
  ].filter((f): f is string => f !== null);

  const prompt = montarPrompt({
    nomeDaLoja: cfg.empresa.nome,
    nomeDoBot: cfg.chatbot.nome_bot,
    abreAs: cfg.atendimento.horario_inicio,
    fechaAs: cfg.atendimento.horario_fim,
    taxaEntrega: cfg.entrega.taxa_padrao,
    entregaGratisAcima: cfg.entrega.taxa_gratis_acima,
    prazoMinutos: cfg.entrega.prazo_minutos,
    formasDePagamento: formas,
    instrucoesDaLoja: cfg.ia.instrucoes,
  });

  const resultado = await responderComIa(
    {
      textoDoCliente,
      prompt,
      contexto: montarContexto(conversa),
      ferramentas: toolsDoModelo(),
      ambiente,
    },
    { conversar, executar },
  );

  /**
   * A recusa vai para o log com o motivo, sempre. É o único jeito de
   * descobrir que o modelo está inventando preço numa loja de verdade — o
   * cliente nunca vê essa mensagem, ele recebe o caminho determinístico.
   */
  if (!resultado.ok) {
    console.warn(
      `[luxx:ia] não usei a resposta (${resultado.rodadas} rodada(s)): ${resultado.motivo}`,
    );
  }

  return resultado;
}
