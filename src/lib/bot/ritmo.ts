/**
 * Proteção do número de WhatsApp.
 *
 * Número banido = operação parada. Estas regras existem para o disparo
 * parecer conversa e não robô: pausa entre mensagens, teto por lote,
 * orçamento de tempo da função e disjuntor quando o canal começa a falhar.
 */

export interface ItemEnvio<T> {
  destino: string;
  carga: T;
}

export interface ResultadoEnvio {
  enviados: number;
  falhados: number;
  /** ficaram para a próxima rodada */
  adiados: string[];
  parouPor?: "lote" | "tempo" | "disjuntor";
}

interface ConfigRitmo {
  PAUSA_MIN_MS: number;
  PAUSA_MAX_MS: number;
  MAX_POR_LOTE: number;
  ORCAMENTO_MS: number;
  FALHAS_PARA_ABRIR: number;
}

export const RITMO: ConfigRitmo = {
  /** pausa entre uma mensagem e a seguinte */
  PAUSA_MIN_MS: 4_000,
  PAUSA_MAX_MS: 9_000,
  /** quantas mensagens no mesmo disparo */
  MAX_POR_LOTE: 8,
  /** a função serverless morre em 60s; paramos antes com folga */
  ORCAMENTO_MS: 45_000,
  /** falhas seguidas que abrem o disjuntor */
  FALHAS_PARA_ABRIR: 3,
};

const pausar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Recebe a config em uso — ler a global aqui ignorava qualquer ajuste. */
const pausaAleatoria = (cfg: ConfigRitmo) =>
  cfg.PAUSA_MIN_MS + Math.random() * (cfg.PAUSA_MAX_MS - cfg.PAUSA_MIN_MS);

/**
 * Envia com ritmo humano. Devolve o que sobrou em vez de insistir: a próxima
 * rodada do cron pega os adiados.
 */
export async function enviarComRitmo<T>(
  itens: Array<ItemEnvio<T>>,
  enviar: (item: ItemEnvio<T>) => Promise<boolean>,
  opcoes?: Partial<ConfigRitmo>,
): Promise<ResultadoEnvio> {
  const cfg = { ...RITMO, ...opcoes };
  const comeco = Date.now();

  let enviados = 0;
  let falhados = 0;
  let seguidas = 0;
  let parouPor: ResultadoEnvio["parouPor"];

  for (let i = 0; i < itens.length; i++) {
    if (enviados + falhados >= cfg.MAX_POR_LOTE) { parouPor = "lote"; break; }
    if (Date.now() - comeco > cfg.ORCAMENTO_MS) { parouPor = "tempo"; break; }
    if (seguidas >= cfg.FALHAS_PARA_ABRIR) { parouPor = "disjuntor"; break; }

    try {
      const ok = await enviar(itens[i]);
      if (ok) { enviados++; seguidas = 0; }
      else { falhados++; seguidas++; }
    } catch {
      falhados++; seguidas++;
    }

    const ultimo = i === itens.length - 1;
    if (!ultimo) await pausar(pausaAleatoria(cfg));
  }

  return {
    enviados,
    falhados,
    adiados: itens.slice(enviados + falhados).map((i) => i.destino),
    parouPor,
  };
}

/* -------------------------------------------------------------------------
 * Teto por pessoa: quantas mensagens ela pode receber e de que tipo.
 * ------------------------------------------------------------------------- */

export type Natureza = "transacional" | "cobranca" | "marketing";

/** Transacional não tem teto: é resposta ao que a pessoa está fazendo agora. */
const TETO: Record<Natureza, { vezes: number; emDias: number } | null> = {
  transacional: null,
  cobranca: { vezes: 3, emDias: 60 },
  marketing: { vezes: 1, emDias: 14 },
};

export function podeReceber(
  natureza: Natureza,
  enviosAnteriores: Array<{ natureza: Natureza; quando: Date }>,
  agora = new Date(),
): { pode: boolean; diasAteLiberar?: number } {
  const teto = TETO[natureza];
  if (!teto) return { pode: true };

  const janela = agora.getTime() - teto.emDias * 864e5;
  const recentes = enviosAnteriores
    .filter((e) => e.natureza === natureza && e.quando.getTime() >= janela)
    .sort((a, b) => a.quando.getTime() - b.quando.getTime());

  if (recentes.length < teto.vezes) return { pode: true };

  const maisAntigo = recentes[0].quando.getTime();
  const liberaEm = maisAntigo + teto.emDias * 864e5;
  return {
    pode: false,
    diasAteLiberar: Math.max(1, Math.ceil((liberaEm - agora.getTime()) / 864e5)),
  };
}

/* -------------------------------------------------------------------------
 * Interruptor geral por natureza.
 * ------------------------------------------------------------------------- */

export interface Interruptor {
  transacional?: boolean;
  cobranca?: boolean;
  marketing?: boolean;
  interno?: boolean;
}

/**
 * Ausência de configuração significa TUDO PAUSADO.
 * Se a leitura da configuração falhar, o certo é não disparar nada — o
 * contrário libera o canal justamente quando algo está errado.
 */
export function envioLiberado(
  natureza: Natureza | "interno",
  config: Interruptor | null | undefined,
): boolean {
  if (!config) return false;
  return config[natureza] === true;
}

/* -------------------------------------------------------------------------
 * Desligar quem não quer mais falar com a gente.
 * ------------------------------------------------------------------------- */

export interface SinaisDoCliente {
  pediuParar: boolean;
  enviosSemNenhumaResposta: number;
  entregasFalhadasSeguidas: number;
}

export function deveSilenciar(
  natureza: Natureza, sinais: SinaisDoCliente,
): { silencia: boolean; motivo?: string } {
  // transacional continua: é resposta ao pedido que a própria pessoa fez
  if (natureza === "transacional") return { silencia: false };

  if (sinais.pediuParar) {
    return { silencia: true, motivo: "cliente pediu para parar de receber" };
  }
  if (sinais.enviosSemNenhumaResposta >= 5) {
    return { silencia: true, motivo: "5 mensagens sem nenhuma resposta" };
  }
  if (sinais.entregasFalhadasSeguidas >= 2) {
    return { silencia: true, motivo: "2 entregas seguidas falharam — número provavelmente morto" };
  }
  return { silencia: false };
}
