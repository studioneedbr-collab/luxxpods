export type PeriodoChave =
  | "hoje" | "ontem" | "semana" | "mes" | "mes_anterior" | "ano" | "custom";

export interface Periodo {
  chave: PeriodoChave;
  inicio: Date;
  fim: Date;
  rotulo: string;
}

const inicioDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fimDia = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

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
  const hoje = new Date();
  const k = (chave ?? "mes") as PeriodoChave;

  if (k === "custom" && de && ate) {
    return {
      chave: "custom", inicio: inicioDia(new Date(de)), fim: fimDia(new Date(ate)),
      rotulo: `${new Date(de).toLocaleDateString("pt-BR")} — ${new Date(ate).toLocaleDateString("pt-BR")}`,
    };
  }

  switch (k) {
    case "hoje":
      return { chave: k, inicio: inicioDia(hoje), fim: fimDia(hoje), rotulo: "Hoje" };
    case "ontem": {
      const o = new Date(hoje); o.setDate(o.getDate() - 1);
      return { chave: k, inicio: inicioDia(o), fim: fimDia(o), rotulo: "Ontem" };
    }
    case "semana": {
      const i = new Date(hoje); i.setDate(i.getDate() - i.getDay());
      return { chave: k, inicio: inicioDia(i), fim: fimDia(hoje), rotulo: "Esta semana" };
    }
    case "ano":
      return {
        chave: k, inicio: new Date(hoje.getFullYear(), 0, 1),
        fim: fimDia(hoje), rotulo: String(hoje.getFullYear()),
      };
    case "mes":
    default: {
      const base = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMes, 1);
      const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      const ehMesAtual = offsetMes === 0;
      return {
        chave: "mes",
        inicio: inicioDia(base),
        fim: fimDia(ehMesAtual ? hoje : fim),
        rotulo: base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      };
    }
  }
}

export const nomeMes = (offset: number) =>
  new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "")
    .toUpperCase();
