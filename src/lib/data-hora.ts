/**
 * Datas no fuso da loja.
 *
 * O servidor da Vercel roda em UTC: `new Date().setHours(0)` e
 * `toISOString().slice(0, 10)` faziam o "hoje" começar às 21h de Brasília —
 * a entrega das 22h contava como amanhã e sumia do painel, e a baixa feita
 * à noite saía com a data do dia seguinte.
 */
export const FUSO = "America/Sao_Paulo";

/** "2026-10-28", no calendário de Brasília. */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/** Quanto o relógio de Brasília está atrás do UTC naquele instante, em ms. */
function deslocamento(instante: Date): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(instante).map((p) => [p.type, p.value]),
  );
  const comoUtc = Date.UTC(
    Number(partes.year), Number(partes.month) - 1, Number(partes.day),
    Number(partes.hour), Number(partes.minute), Number(partes.second));
  return comoUtc - instante.getTime() + instante.getMilliseconds();
}

/** 00:00:00.000 de Brasília do dia `ymd`, como instante. */
export function inicioDoDiaSP(ymd: string): Date {
  const [a, m, d] = ymd.split("-").map(Number);
  const meiaNoiteUtc = new Date(Date.UTC(a, m - 1, d));
  return new Date(meiaNoiteUtc.getTime() - deslocamento(meiaNoiteUtc));
}

/** 23:59:59.999 de Brasília do dia `ymd`. */
export function fimDoDiaSP(ymd: string): Date {
  return new Date(inicioDoDiaSP(ymd).getTime() + 86_400_000 - 1);
}

/** Soma dias a um "AAAA-MM-DD" sem passar por fuso nenhum. */
export function somarDias(ymd: string, dias: number): string {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** O mesmo instante é "hoje" em Brasília? */
export function ehHojeSP(data: string | Date | null | undefined, agora = new Date()): boolean {
  if (!data) return false;
  return hojeSP(new Date(data)) === hojeSP(agora);
}
