/**
 * O que dá para tirar do texto do cliente sem modelo de linguagem.
 *
 * Funções puras, testadas em extrair.test.ts. Cada uma devolve `null` quando
 * não tem certeza: o motor pergunta de novo em vez de gravar um endereço
 * errado ou vender três unidades de quem pediu uma.
 */

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* ------------------------------------------------------------ QUANTIDADE -- */

const POR_EXTENSO: Record<string, number> = {
  dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10,
};

/**
 * "quero 2 watermelon", "3x", "duas unidades". Antes o motor punha sempre 1.
 *
 * O número precisa estar solto: "V300", "10k" e "30 mil puffs" são nome de
 * modelo e quantidade de puffs, não de unidades.
 */
export function quantidadeNoTexto(texto: string): number | null {
  const t = ` ${normalizar(texto)} `;

  const numero = t.match(/\s(\d{1,2})\s*(?:x|un|und|unid|unidades?|pods?)?(?=[\s,.!?])(?!\s*(?:k|mil|puffs?)\b)/);
  if (numero) {
    const n = Number(numero[1]);
    if (n >= 1 && n <= 20) return n;
  }

  for (const [palavra, n] of Object.entries(POR_EXTENSO)) {
    if (new RegExp(`\\s${palavra}(?=[\\s,.!?])`).test(t)) return n;
  }
  return null;
}

/* -------------------------------------------------------------- ENDEREÇO -- */

export interface EnderecoLido {
  rua: string;
  numero: string;
  bairro: string;
  complemento: string | null;
  referencia: string | null;
}

/** "rua das flores" → "Rua das Flores": preposição fica minúscula. */
const capitalizar = (v: string) =>
  v.trim().replace(/\s+/g, " ").split(" ")
    .map((p, i) => (i > 0 && /^(d[aeo]s?|e)$/i.test(p)
      ? p.toLowerCase()
      : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");

/**
 * "Rua das Flores, 120, Centro", "av brasil 230 centro apto 3 perto da
 * padaria". Antes o motor respondia "Anotado!" e não gravava nada: o pedido
 * nascia sem endereço.
 *
 * Exige rua e número. Bairro pode faltar — aí o motor pergunta só ele.
 */
export function extrairEndereco(texto: string): EnderecoLido | null {
  let t = texto.replace(/\s+/g, " ").trim();
  if (t.length < 5) return null;

  let referencia: string | null = null;
  const ref = t.match(/\b(perto d[aoe]s?|pr[oó]ximo (?:a|ao|à|d[aoe]s?)|ao lado d[aoe]s?|em frente (?:a|ao|à|d[aoe]s?)|na frente d[aoe]s?|refer[eê]ncia:?|ref\.?:?)\s.+$/i);
  if (ref) {
    referencia = ref[0].replace(/^(refer[eê]ncia|ref)\.?:?\s*/i, "").trim();
    t = t.slice(0, ref.index).trim();
  }

  const complementos: string[] = [];
  t = t.replace(
    /[,-]?\s*\b(ap(?:to|artamento)?\.?|casa|bloco|bl\.?|fundos|sala|lote|qd\.?|quadra)\s*(\d+[a-z]?|[a-z]\b)?/gi,
    (m) => { complementos.push(m.replace(/^[,\s-]+/, "").trim()); return " "; },
  ).replace(/\s+/g, " ").trim();

  const num = t.match(/(?:,\s*|\s)(?:n[º°o]\.?\s*|n[uú]mero\s*)?(\d{1,5}[a-z]?|s\/n)\b/i);
  if (!num || num.index === undefined) return null;

  const rua = t.slice(0, num.index).replace(/[,\s-]+$/, "").trim();
  if (rua.replace(/[^\p{L}]/gu, "").length < 3) return null;

  const resto = t.slice(num.index + num[0].length)
    .replace(/^[,\s-]+/, "")
    .replace(/^bairro\s*:?\s*/i, "");
  const bairro = resto.split(/\s*[,–-]\s*/)[0]?.trim() ?? "";

  return {
    rua: capitalizar(rua),
    numero: num[1].toUpperCase(),
    bairro: bairro ? capitalizar(bairro) : "",
    complemento: complementos.length ? complementos.join(", ") : null,
    referencia,
  };
}

/** Uma linha para o cliente conferir. */
export function enderecoEmLinha(e: {
  rua?: string | null; numero?: string | null; bairro?: string | null;
  complemento?: string | null; referencia?: string | null;
}): string {
  const base = [e.rua, e.numero].filter(Boolean).join(", ");
  const partes = [base, e.complemento, e.bairro].filter(Boolean).join(" — ");
  return e.referencia ? `${partes} (${e.referencia})` : partes;
}

/* ----------------------------------------------------------- PREFERÊNCIA -- */

export type PerfilSabor = "gelado" | "menta" | "doce" | "fruta" | "tabaco";

/** Como o cliente descreve o gosto, e como reconhecer isso no nome do sabor. */
export const PERFIS: Record<PerfilSabor, { fala: RegExp; noSabor: RegExp }> = {
  gelado: { fala: /\b(gelad[oa]s?|ice|geladinho|refrescante|frio)\b/,
            noSabor: /\b(ice|iced|gelad|frost|cool|freeze|menthol|mint|menta)/ },
  menta:  { fala: /\b(menta|mentolad[oa]|hortela|mint|menthol)\b/,
            noSabor: /\b(menta|mint|menthol|hortela)/ },
  doce:   { fala: /\b(doces?|docinho|adocicad[oa])\b/,
            noSabor: /\b(doce|candy|bubble|gum|chiclete|cream|vanilla|baunilha|caramel|chocolate|cotton|cake|donut|cookie|mel|honey)/ },
  fruta:  { fala: /\b(frutas?|frutad[oa]s?|frutinha)\b/,
            noSabor: /\b(watermelon|melancia|grape|uva|strawberry|morango|mango|manga|passion|maracuja|blueberry|mirtilo|pineapple|abacaxi|peach|pessego|banana|lemon|limao|lime|kiwi|apple|maca|berry|berries|cherry|cereja|lychee|lichia|coco|coconut|acai|guava|goiaba|orange|laranja|melon|melao|tangerina|pitaya|fruit)/ },
  tabaco: { fala: /\b(tabaco|cigarro|tobacco)\b/,
            noSabor: /\b(tabac|tobacco|cigar)/ },
};

export interface PreferenciasLidas {
  marcas: string[];
  sabores: string[];
  perfil: PerfilSabor[];
  puffs: number | null;
}

export const semPreferencia = (p: PreferenciasLidas) =>
  !p.marcas.length && !p.sabores.length && !p.perfil.length && p.puffs == null;

/**
 * "gosto de gelado", "curto ignite", "uns 10k puffs".
 *
 * Sem `respondendo`, só conta frase de gosto explícita: quem pede "1
 * watermelon ice" está comprando, não declarando que só gosta de gelado. Com
 * `respondendo` (o bot acabou de perguntar a preferência), a resposta seca
 * "gelado" já vale.
 */
export function extrairPreferencias(
  texto: string,
  catalogo: { marcas: string[]; sabores: string[] },
  respondendo = false,
): PreferenciasLidas {
  const t = normalizar(texto);
  const vazio: PreferenciasLidas = { marcas: [], sabores: [], perfil: [], puffs: null };
  if (!t) return vazio;

  const declarando = respondendo
    || /\b(gosto|curto|prefiro|preferencia|costumo|sou mais|amo|adoro|uso|fumo|procuro|quero algo|algo mais|tipo)\b/.test(t);
  if (!declarando) return vazio;

  const contem = (termo: string) => {
    const n = normalizar(termo);
    return n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t);
  };

  const perfil = (Object.keys(PERFIS) as PerfilSabor[]).filter((p) => PERFIS[p].fala.test(t));

  let puffs: number | null = null;
  const k = t.match(/\b(\d{1,3}(?:[.,]\d)?)\s*(?:k|mil)\b/);
  const cheio = t.match(/\b(\d{3,6})\s*puffs?\b/);
  if (k) puffs = Math.round(Number(k[1].replace(",", ".")) * 1000);
  else if (cheio) puffs = Number(cheio[1]);

  return {
    marcas: catalogo.marcas.filter(contem),
    sabores: catalogo.sabores.filter(contem),
    perfil,
    puffs: puffs && puffs >= 500 && puffs <= 100_000 ? puffs : null,
  };
}

/** O sabor combina com algum dos perfis pedidos? */
export function saborCombina(sabor: string, perfis: PerfilSabor[]): boolean {
  const s = normalizar(sabor);
  return perfis.some((p) => PERFIS[p].noSabor.test(s));
}

const ROTULO_PERFIL: Record<PerfilSabor, string> = {
  gelado: "gelado", menta: "menta", doce: "doce", fruta: "frutado", tabaco: "tabaco",
};

/** "gelado e frutado, Ignite, uns 10k puffs" — para o bot repetir o que anotou. */
export function preferenciasEmTexto(p: {
  marcas?: string[]; sabores?: string[]; perfil?: string[]; puffs?: number | null;
}): string {
  const partes = [
    ...(p.perfil ?? []).map((x) => ROTULO_PERFIL[x as PerfilSabor] ?? x),
    ...(p.sabores ?? []),
    ...(p.marcas ?? []),
    p.puffs ? `uns ${Math.round(p.puffs / 1000)}k puffs` : null,
  ].filter(Boolean) as string[];
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}
