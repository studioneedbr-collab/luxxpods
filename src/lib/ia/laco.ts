import { validarChamada } from "../bot/ferramentas";
import { podeChamar } from "./politica";
import { conferirResposta, type LeituraFeita } from "./conferir";
import type { Ambiente, Saida } from "../bot/executor";
import type { Contexto } from "../bot/estados";
import type { Mensagem, Opcoes, Resposta } from "./deepseek";

/**
 * O laço de ferramentas: pergunta, executa o que o modelo pediu, devolve o
 * resultado, repete até ele escrever a resposta.
 *
 * As duas dependências entram por parâmetro, e não por import, de propósito.
 * `executar` e `conversar` moram em módulos `server-only` — um fala com o
 * banco, o outro com a internet. Recebendo-as aqui, toda a decisão deste
 * arquivo fica testável sem subir banco nem gastar token, que é onde os
 * erros caros se esconderiam.
 */

export type Conversador = (o: Opcoes) => Promise<Resposta>;
export type Executor = (
  nome: string,
  argumentos: Record<string, unknown>,
  ambiente: Ambiente,
) => Promise<Saida>;

export interface Dependencias {
  conversar: Conversador;
  executar: Executor;
  agora?: () => number;
}

export interface Entrada {
  textoDoCliente: string;
  /** o prompt estável, de montarPrompt */
  prompt: string;
  /** a parte volátil, de montarContexto */
  contexto: string;
  /** as tools no formato da OpenAI, já peneiradas pela política */
  ferramentas: unknown[];
  ambiente: Ambiente;
}

export interface ResultadoIa {
  ok: boolean;
  texto?: string;
  /** o modelo pediu uma pessoa; o motor cuida da transferência */
  transferir?: string;
  /** o que gravar no contexto da conversa, vindo SÓ de resultado de consulta */
  mudancasDeContexto?: Partial<Contexto>;
  /** por que não deu, para o log — nunca para o cliente */
  motivo?: string;
  leituras: LeituraFeita[];
  rodadas: number;
}

/** Três idas ao modelo bastam: pergunta, consulta, responde. */
const MAX_RODADAS = 3;

/** O cliente está olhando a tela do WhatsApp. Passando disso, desiste. */
const PRAZO_TOTAL_MS = 35_000;

export async function responderComIa(
  entrada: Entrada,
  dep: Dependencias,
): Promise<ResultadoIa> {
  const agora = dep.agora ?? (() => Date.now());
  const comecou = agora();

  const mensagens: Mensagem[] = [
    { role: "system", content: entrada.prompt },
    {
      role: "user",
      content: `${entrada.contexto}\n\nMensagem do cliente: "${entrada.textoDoCliente}"`,
    },
  ];

  const leituras: LeituraFeita[] = [];
  const mudancas: Partial<Contexto> = {};

  for (let rodada = 1; rodada <= MAX_RODADAS; rodada++) {
    if (agora() - comecou > PRAZO_TOTAL_MS) {
      return { ok: false, motivo: "estourou o prazo de resposta", leituras, rodadas: rodada - 1 };
    }

    let resposta: Resposta;
    try {
      resposta = await dep.conversar({
        mensagens,
        ferramentas: entrada.ferramentas,
      });
    } catch (e) {
      return { ok: false, motivo: `a DeepSeek falhou: ${String(e)}`, leituras, rodadas: rodada - 1 };
    }

    /**
     * Cota gasta pensando. Medido contra a API de verdade: o modelo pode
     * consumir max_tokens inteiro no raciocínio e devolver conteúdo vazio
     * com finish_reason "length". Sem esta recusa explícita, o bot mandaria
     * mensagem em branco para o cliente.
     */
    if (resposta.motivoDoFim === "length" && !resposta.texto && resposta.ferramentas.length === 0) {
      return {
        ok: false,
        motivo: "o modelo gastou a cota de tokens raciocinando e não respondeu",
        leituras,
        rodadas: rodada,
      };
    }

    /* ---- sem ferramenta: é a resposta final ---- */

    if (resposta.ferramentas.length === 0) {
      const conferencia = conferirResposta(resposta.texto, leituras);
      if (!conferencia.ok) {
        return { ok: false, motivo: conferencia.motivo, leituras, rodadas: rodada };
      }
      return {
        ok: true,
        texto: resposta.texto,
        mudancasDeContexto: mudancas,
        leituras,
        rodadas: rodada,
      };
    }

    /* ---- pediu gente: o motor tem o caminho pronto para isso ---- */

    const transferencia = resposta.ferramentas.find(
      (f) => f.nome === "transferir_atendimento");
    if (transferencia) {
      const motivo = String(transferencia.argumentos.motivo ?? "").trim();
      return {
        ok: true,
        transferir: motivo || "a IA não soube responder",
        mudancasDeContexto: mudancas,
        leituras,
        rodadas: rodada,
      };
    }

    /**
     * O texto que vem JUNTO com as chamadas é enchimento — "vou verificar
     * isso pra você". Não vai para o cliente: ele receberia duas mensagens,
     * e a primeira sem conteúdo.
     */
    mensagens.push(resposta.mensagemCrua);

    for (const chamada of resposta.ferramentas) {
      const resultado = await executarComTravas(chamada, entrada.ambiente, dep.executar);

      if (resultado.leitura) {
        leituras.push(resultado.leitura);
        if (resultado.contexto) Object.assign(mudancas, resultado.contexto);
      }

      mensagens.push({
        role: "tool",
        tool_call_id: chamada.id,
        content: resultado.paraOModelo,
      });
    }
  }

  return {
    ok: false,
    motivo: `não concluiu em ${MAX_RODADAS} rodadas`,
    leituras,
    rodadas: MAX_RODADAS,
  };
}

/* ---------------------------------------------------------------- TRAVAS -- */

interface Executada {
  paraOModelo: string;
  leitura?: LeituraFeita;
  contexto?: Partial<Contexto>;
}

/**
 * Nada roda sem passar por aqui. São três portas, e cada recusa volta ao
 * modelo COM O MOTIVO escrito — ele costuma corrigir na rodada seguinte, e
 * uma recusa muda vira insistência no mesmo erro.
 */
async function executarComTravas(
  chamada: { nome: string; argumentos: Record<string, unknown>; argumentosCrus?: string },
  ambiente: Ambiente,
  executar: Executor,
): Promise<Executada> {
  if (chamada.argumentosCrus !== undefined) {
    return {
      paraOModelo: JSON.stringify({
        erro: "não consegui ler os argumentos como JSON; mande um objeto simples",
      }),
    };
  }

  const veredito = podeChamar(chamada.nome);
  if (!veredito.permitida) {
    console.warn(
      `[luxx:ia] recusei ${chamada.nome}: ${veredito.motivo}`,
    );
    return {
      paraOModelo: JSON.stringify({
        erro: `você não tem permissão para ${chamada.nome}: ${veredito.motivo}`,
        faca: "responda com o que já consultou, ou chame transferir_atendimento",
      }),
    };
  }

  const validacao = validarChamada(chamada.nome, chamada.argumentos, ambiente.estado);
  if (!validacao.valida) {
    return { paraOModelo: JSON.stringify({ erro: validacao.erro }) };
  }

  let saida: Saida;
  try {
    saida = await executar(chamada.nome, chamada.argumentos, ambiente);
  } catch (e) {
    console.error(`[luxx:ia] ${chamada.nome} estourou: ${String(e)}`);
    return { paraOModelo: JSON.stringify({ erro: "a consulta falhou" }) };
  }

  return {
    paraOModelo: JSON.stringify(saida.ok ? saida.dados ?? {} : { erro: saida.erro }),
    leitura: { nome: chamada.nome, ok: saida.ok, dados: saida.dados },
    contexto: saida.contexto,
  };
}
