import "server-only";

/**
 * O cliente da DeepSeek.
 *
 * Fica em módulo `server-only` pelo mesmo motivo da chave do Supabase: a
 * chave da API é um segredo de cobrança, e quem a tiver gasta o saldo da
 * loja. Importar isto de um componente de cliente é erro de build.
 *
 * A API fala o protocolo da OpenAI, então o formato das mensagens e das
 * tools é o de lá — não há SDK no projeto, é um POST.
 */

const BASE = "https://api.deepseek.com";
const MODELO_PADRAO = "deepseek-flash";

/**
 * O modelo RACIOCINA antes de responder, e os tokens de raciocínio contam
 * dentro de max_tokens. Medido contra a API: com 800 de teto, ele gastou os
 * 800 pensando e devolveu texto VAZIO, com finish_reason "length". Um teto
 * apertado aqui não deixa a resposta curta — deixa o bot mudo.
 *
 * Daí o teto folgado e, em `conversar`, a recusa explícita quando a resposta
 * volta sem texto e sem ferramenta.
 */
const TETO_TOKENS = 1600;

/** Esperar mais que isso é pior que cair no caminho determinístico. */
const TIMEOUT_MS = 20_000;

export const CHAVE_DEEPSEEK = process.env.DEEPSEEK_API_KEY ?? "";
export const MODELO_DEEPSEEK = process.env.DEEPSEEK_MODELO || MODELO_PADRAO;

export function iaConfigurada(): boolean {
  return CHAVE_DEEPSEEK.length > 0;
}

/* ------------------------------------------------------------- PROTOCOLO -- */

export interface ChamadaDeFerramenta {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
  /** o que veio escrito, quando não deu para ler como JSON */
  argumentosCrus?: string;
}

export type Mensagem =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface Resposta {
  texto: string;
  ferramentas: ChamadaDeFerramenta[];
  /** a mensagem crua, para devolver ao histórico na rodada seguinte */
  mensagemCrua: Mensagem;
  motivoDoFim: string;
  tokens: { entrada: number; saida: number; raciocinio: number; cache: number };
}

export class ErroDeepSeek extends Error {
  constructor(mensagem: string, readonly status?: number) {
    super(mensagem);
    this.name = "ErroDeepSeek";
  }
}

/* --------------------------------------------------------------- CHAMADA -- */

export interface Opcoes {
  mensagens: Mensagem[];
  ferramentas?: unknown[];
  /** "low" para conversa: é a diferença entre 4s e mais que isso */
  esforco?: "low" | "high" | "max";
}

export async function conversar(opcoes: Opcoes): Promise<Resposta> {
  if (!iaConfigurada()) throw new ErroDeepSeek("DEEPSEEK_API_KEY não configurada");

  const corpo: Record<string, unknown> = {
    model: MODELO_DEEPSEEK,
    messages: opcoes.mensagens,
    max_tokens: TETO_TOKENS,
    effort: opcoes.esforco ?? "low",
    // o bot não é para ser criativo com preço e estoque
    temperature: 0,
  };

  if (opcoes.ferramentas?.length) {
    corpo.tools = opcoes.ferramentas;
    corpo.tool_choice = "auto";
  }

  const bruto = await postar(corpo);
  return interpretar(bruto);
}

/**
 * Uma repetição, e só em erro do servidor ou rede.
 *
 * 4xx é problema nosso — chave errada, corpo inválido — e repetir só atrasa
 * a resposta ao cliente. Em 5xx a segunda tentativa costuma passar, e o
 * cliente no WhatsApp prefere esperar meio segundo a receber "não entendi".
 */
async function postar(corpo: Record<string, unknown>): Promise<unknown> {
  let ultimo: ErroDeepSeek | null = null;

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      return await postarUmaVez(corpo);
    } catch (e) {
      const erro = e instanceof ErroDeepSeek ? e : new ErroDeepSeek(String(e));
      const valeRepetir = erro.status === undefined || erro.status >= 500;
      if (!valeRepetir || tentativa === 2) throw erro;
      ultimo = erro;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  throw ultimo ?? new ErroDeepSeek("falha desconhecida");
}

async function postarUmaVez(corpo: Record<string, unknown>): Promise<unknown> {
  const relogio = AbortSignal.timeout(TIMEOUT_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${CHAVE_DEEPSEEK}`,
      },
      body: JSON.stringify(corpo),
      signal: relogio,
      cache: "no-store",
    });
  } catch (e) {
    const abortou = e instanceof Error && e.name === "TimeoutError";
    // sem status: `postar` trata como repetível
    throw new ErroDeepSeek(
      abortou ? `a DeepSeek não respondeu em ${TIMEOUT_MS / 1000}s` : `rede: ${String(e)}`,
    );
  }

  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    throw new ErroDeepSeek(
      `DeepSeek respondeu ${resposta.status}: ${recortar(texto)}`,
      resposta.status,
    );
  }

  return resposta.json();
}

const recortar = (t: string, n = 300) => (t.length > n ? `${t.slice(0, n)}…` : t);

/* ------------------------------------------------------------ RESPOSTA -- */

function interpretar(bruto: unknown): Resposta {
  const d = bruto as {
    choices?: Array<{
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_cache_hit_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };

  const escolha = d.choices?.[0];
  if (!escolha?.message) throw new ErroDeepSeek("resposta sem mensagem");

  const m = escolha.message;

  /**
   * `reasoning_content` fica de fora de propósito, e não é só economia: é o
   * rascunho do modelo, em inglês, com ele discutindo consigo mesmo o que
   * vai responder. Isso não vai para o cliente nem volta no histórico.
   */
  const ferramentas: ChamadaDeFerramenta[] = (m.tool_calls ?? []).map((c, i) => {
    const cru = c.function?.arguments ?? "";
    let argumentos: Record<string, unknown> = {};
    let argumentosCrus: string | undefined;

    try {
      const lido = cru.trim() ? JSON.parse(cru) : {};
      if (lido && typeof lido === "object" && !Array.isArray(lido)) {
        argumentos = lido as Record<string, unknown>;
      } else {
        argumentosCrus = cru;
      }
    } catch {
      // JSON torto não derruba a rodada: o laço devolve o erro ao modelo,
      // que normalmente corrige na tentativa seguinte
      argumentosCrus = cru;
    }

    return {
      id: c.id ?? `sem-id-${i}`,
      nome: c.function?.name ?? "",
      argumentos,
      argumentosCrus,
    };
  });

  const u = d.usage ?? {};

  return {
    texto: (m.content ?? "").trim(),
    ferramentas,
    mensagemCrua: {
      role: "assistant",
      content: m.content ?? null,
      ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
    },
    motivoDoFim: escolha.finish_reason ?? "desconhecido",
    tokens: {
      entrada: u.prompt_tokens ?? 0,
      saida: u.completion_tokens ?? 0,
      raciocinio: u.completion_tokens_details?.reasoning_tokens ?? 0,
      cache: u.prompt_cache_hit_tokens ?? 0,
    },
  };
}

/* ----------------------------------------------------------- DIAGNÓSTICO -- */

export interface Diagnostico {
  ok: boolean;
  erro?: string;
  modelo?: string;
  /** o modelo configurado existe na conta? */
  modeloExiste?: boolean;
  disponiveis?: string[];
}

/**
 * Pergunta à DeepSeek se a chave vale, em vez de só conferir se a variável
 * está preenchida. Chave errada e chave ausente dão telas diferentes, e
 * quem configurou precisa saber qual dos dois é o caso.
 */
export async function diagnosticar(): Promise<Diagnostico> {
  if (!iaConfigurada()) return { ok: false, erro: "DEEPSEEK_API_KEY não configurada" };

  try {
    const r = await fetch(`${BASE}/models`, {
      headers: { authorization: `Bearer ${CHAVE_DEEPSEEK}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      return {
        ok: false,
        erro: r.status === 401
          ? "a chave foi recusada pela DeepSeek"
          : `a DeepSeek respondeu ${r.status}: ${recortar(corpo, 160)}`,
      };
    }

    const d = await r.json() as { data?: Array<{ id?: string }> };
    const disponiveis = (d.data ?? []).map((m) => m.id ?? "").filter(Boolean);

    return {
      ok: true,
      modelo: MODELO_DEEPSEEK,
      modeloExiste: disponiveis.includes(MODELO_DEEPSEEK),
      disponiveis,
    };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, erro: abortou ? "a DeepSeek não respondeu em 8s" : String(e) };
  }
}
