/**
 * A última peneira antes de a frase do modelo virar mensagem no WhatsApp.
 *
 * O prompt pede para não inventar; isto verifica. São coisas diferentes, e a
 * segunda é a que vale quando o modelo erra — porque ele erra.
 *
 * Função pura: recebe o texto e o que as consultas devolveram, e diz se dá
 * para mandar. Quando recusa, o motor cai no caminho determinístico, que no
 * pior caso chama uma pessoa. Calar e chamar gente é sempre melhor que
 * mandar um preço que não existe.
 *
 * O QUE ISTO NÃO PEGA, para ninguém confiar além da conta: um sabor
 * inventado SEM preço passa. Não há como separar com segurança "Watermelon
 * Ice" de qualquer outro par de palavras no meio de uma frase. Contra isso o
 * que existe é a regra 5 do prompt e o fato de o sabor sempre sair de
 * consulta no caminho determinístico.
 */

export interface LeituraFeita {
  nome: string;
  ok: boolean;
  dados?: unknown;
}

export type Conferencia =
  | { ok: true }
  | { ok: false; motivo: string };

/* ----------------------------------------------------------- DINHEIRO -- */

/** "1.234,56" e "45" viram "1234.56" e "45.00" — dos dois lados. */
function normalizar(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;

  const brasileiro = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(t);
  const comVirgula = /^\d+,\d{1,2}$/.test(t);

  const limpo = brasileiro
    ? t.replace(/\./g, "").replace(",", ".")
    : comVirgula
      ? t.replace(",", ".")
      : t;

  const n = Number(limpo);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Os valores que o texto do bot afirma em reais. */
export function valoresNoTexto(texto: string): string[] {
  const achados: string[] = [];

  const padroes = [
    /R\$\s*([\d.]+,\d{1,2}|\d+(?:[.,]\d{1,2})?)/gi,
    /([\d.]+,\d{1,2}|\d+)\s*reais\b/gi,
  ];

  for (const padrao of padroes) {
    for (const m of texto.matchAll(padrao)) {
      const v = normalizar(m[1]);
      if (v) achados.push(v);
    }
  }

  return achados;
}

/**
 * Todo número que apareceu nas consultas.
 *
 * Varre o JSON inteiro, inclusive os números escritos DENTRO de strings:
 * `catalogo_completo` devolve o catálogo já formatado, com "R$ 45,00" no
 * meio do texto, e esses valores são legítimos.
 */
export function valoresNasLeituras(leituras: LeituraFeita[]): Set<string> {
  const blob = JSON.stringify(leituras.map((l) => l.dados ?? null));
  const conjunto = new Set<string>();

  const padroes = [
    /\d{1,3}(?:\.\d{3})+,\d{1,2}/g, // 1.234,56
    /\d+,\d{1,2}/g,                 // 45,90
    /\d+(?:\.\d+)?/g,               // 45 e 45.9, como o JSON escreve
  ];

  for (const padrao of padroes) {
    for (const m of blob.matchAll(padrao)) {
      const v = normalizar(m[0]);
      if (v) conjunto.add(v);
    }
  }

  return conjunto;
}

/* ------------------------------------------------------------ AFIRMAÇÕES -- */

const SEM_ACENTO = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "não tenho" é afirmação segura; "tenho" não é. */
function afirmaSemNegacao(texto: string, padrao: RegExp): boolean {
  const t = SEM_ACENTO(texto);
  for (const m of t.matchAll(padrao)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (!/\bn[ao]o?\b|\bnem\b|\bsem\b/.test(antes)) return true;
  }
  return false;
}

const TEM_PRODUTO = /\btenho\b|\btemos\b|\btem sim\b|\bem estoque\b|\bdisponive(l|is)\b|\bchegou\b/g;

/**
 * "Fechou, 2 Watermelon Ice 👌" — dito sem nada ter sido reservado.
 *
 * Aconteceu no teste contra a API de verdade, e é a pior falha possível na
 * cabeça do cliente: ele desliga o celular achando que tem duas unidades
 * guardadas, e não tem nenhuma. Não há preço nem afirmação de estoque na
 * frase, então as regras de cima não pegam.
 *
 * A política nunca entrega ferramenta de escrita de carrinho ao modelo, logo
 * esta afirmação é sempre falsa quando parte dele.
 */
const DISSE_QUE_FEZ =
  /\badicionei\b|\bja adicionei\b|\bcoloquei\b|\bbotei\b|\bseparei\b|\breservei\b|\bja separo\b|\bvou separar\b|\bja reservo\b|\bja esta no carrinho\b|\bja ta no carrinho\b|\banotei (seu|o) pedido\b|\bpode considerar (fechado|separado)\b/g;

const PEDIDO_ANDOU =
  /\bpedido (foi )?confirmad|\bpix (caiu|aprovad|confirmad)|\bpagamento (caiu|aprovad|confirmad)|\bsaiu para entrega\b|\besta separad|\bja esta a caminho\b/g;

/* -------------------------------------------------------------- VEREDITO -- */

export function conferirResposta(
  texto: string,
  leituras: LeituraFeita[],
): Conferencia {
  if (!texto.trim()) {
    return { ok: false, motivo: "o modelo não escreveu nada" };
  }

  const comSucesso = leituras.filter((l) => l.ok);

  /* 1. dinheiro que não veio de consulta nenhuma */
  const afirmados = valoresNoTexto(texto);
  if (afirmados.length > 0) {
    const conhecidos = valoresNasLeituras(comSucesso);
    const inventado = afirmados.find((v) => !conhecidos.has(v));
    if (inventado) {
      return {
        ok: false,
        motivo: `afirmou R$ ${inventado.replace(".", ",")}, que não saiu de nenhuma consulta`,
      };
    }
  }

  /* 2. disse que tem produto sem ter consultado nada */
  if (comSucesso.length === 0 && afirmaSemNegacao(texto, TEM_PRODUTO)) {
    return { ok: false, motivo: "afirmou disponibilidade sem consultar o estoque" };
  }

  /* 3. disse que mexeu no carrinho, coisa que ele não consegue fazer */
  const escreveu = comSucesso.some((l) =>
    l.nome === "adicionar_carrinho" || l.nome === "remover_carrinho");
  if (!escreveu && afirmaSemNegacao(texto, DISSE_QUE_FEZ)) {
    return {
      ok: false,
      motivo: "disse que separou ou reservou, e nada foi reservado",
    };
  }

  /* 4. deu andamento de pedido ou pagamento por conta própria */
  const podeFalarDisso = comSucesso.some((l) =>
    l.nome === "consultar_pedido" || l.nome === "consultar_pagamento");
  if (!podeFalarDisso && afirmaSemNegacao(texto, PEDIDO_ANDOU)) {
    return { ok: false, motivo: "falou de pedido ou pagamento sem consultar a situação" };
  }

  return { ok: true };
}
