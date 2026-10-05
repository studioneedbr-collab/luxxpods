import "server-only";
import { paraFormatoOpenAI } from "../bot/ferramentas";
import { executar, type Ambiente } from "../bot/executor";
import { conversar, iaConfigurada } from "./deepseek";
import { ferramentasDoModelo } from "./politica";
import { montarContexto, montarPrompt, type EstadoDaConversa } from "./prompt";
import { responderComIa, type ResultadoIa } from "./laco";
import { historicoDaConversa } from "./historico";
import { ehSim } from "../bot/intencoes";
import type { Configuracoes } from "../configuracoes";
import type { TermosDoCatalogo } from "./conferir";

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
  catalogo?: TermosDoCatalogo,
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
      historico: await historicoDaConversa(ambiente.conversationId, textoDoCliente),
      origens: {
        catalogo,
        // a taxa de entrega e o frete grátis estão no prompt: são fato do
        // sistema, e o bot pode repeti-los sem consultar
        valoresDaLoja: [cfg.entrega.taxa_padrao, cfg.entrega.taxa_gratis_acima],
      },
      ferramentas: toolsDoModelo(),
      ambiente,
      /**
       * A trava do passo irreversível, calculada AQUI e não pelo modelo.
       * `ehSim` é a mesma função que o caminho determinístico usa para ler
       * "pode ser", "fechou", "isso mesmo" — testada, e cega a qualquer
       * conversa que o modelo tenha tido consigo mesmo.
       */
      clienteConfirmou: ehSim(textoDoCliente),
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
