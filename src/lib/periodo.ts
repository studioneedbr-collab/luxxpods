import { FUSO, fimDoDiaSP, hojeSP, inicioDoDiaSP, somarDias } from "./data-hora";

export type PeriodoChave =
  | "hoje" | "ontem" | "semana" | "mes" | "mes_anterior" | "ano" | "custom";

export interface Periodo {
  chave: PeriodoChave;
  inicio: Date;
  fim: Date;
  rotulo: string;
}

// o dia é o de Brasília: em UTC o "hoje" do servidor começava às 21h
const deYmd = (ymd: string) => inicioDoDiaSP(ymd);

export const PERIODOS: Array<{ chave: PeriodoChave; rotulo: string }> = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "ontem", rotulo: "Ontem" },
  { chave: "semana", rotulo: "Esta semana" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "ano", rotulo: "Este ano" },
];

export function resolverPeriodo(
  chave: string | undefined,
  de?: string,
  ate?: string,
  offsetMes = 0,
): Periodo {
  const agora = new Date();
  const hoje = hojeSP(agora);
  const [ano, mes] = hoje.split("-").map(Number);
  const k = (chave ?? "mes") as PeriodoChave;
  const br = (ymd: string) => deYmd(ymd).toLocaleDateString("pt-BR", { timeZone: FUSO });

  if (k === "custom" && de && ate) {
    const ini = de.slice(0, 10), fim = ate.slice(0, 10);
    return {
      chave: "custom", inicio: inicioDoDiaSP(ini), fim: fimDoDiaSP(fim),
      rotulo: `${br(ini)} — ${br(fim)}`,
    };
  }

  switch (k) {
    case "hoje":
      return { chave: k, inicio: inicioDoDiaSP(hoje), fim: fimDoDiaSP(hoje), rotulo: "Hoje" };
    case "ontem": {
      const o = somarDias(hoje, -1);
      return { chave: k, inicio: inicioDoDiaSP(o), fim: fimDoDiaSP(o), rotulo: "Ontem" };
    }
    case "semana": {
      // domingo da semana, no calendário de Brasília
      const diaDaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
      const i = somarDias(hoje, -diaDaSemana);
      return { chave: k, inicio: inicioDoDiaSP(i), fim: fimDoDiaSP(hoje), rotulo: "Esta semana" };
    }
    case "ano":
      return {
        chave: k, inicio: inicioDoDiaSP(`${ano}-01-01`),
        fim: fimDoDiaSP(hoje), rotulo: String(ano),
      };
    case "mes":
    default: {
      const base = new Date(Date.UTC(ano, mes - 1 + offsetMes, 1));
      const ymdBase = base.toISOString().slice(0, 10);
      const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
        .toISOString().slice(0, 10);
      const ehMesAtual = offsetMes === 0;
      return {
        chave: "mes",
        inicio: inicioDoDiaSP(ymdBase),
        fim: fimDoDiaSP(ehMesAtual ? hoje : ultimo),
        rotulo: new Date(`${ymdBase}T12:00:00Z`)
          .toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: FUSO }),
      };
    }
  }
}

export const nomeMes = (offset: number) =>
  new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "")
    .toUpperCase();
