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

/**
 * De onde um valor em reais pode ter vindo, além das consultas.
 *
 * Rodando ao vivo, duas respostas CERTAS foram barradas por eu só aceitar
 * número de consulta:
 *
 * - "a entrega fica R$ 5,00" — a taxa está na configuração da loja, que o
 *   próprio sistema pôs no prompt. É fato nosso, não invenção dele.
 * - "troco pra 100" → "você paga com R$ 100" — o valor é do cliente. Repetir
 *   o que a pessoa acabou de escrever não é afirmar preço.
 *
 * A segunda abre uma brecha: "faz R$ 60?" e o bot concordando com os R$ 60
 * também é repetir o cliente. Por isso o valor do cliente vale em qualquer
 * frase MENOS numa que afirma preço — ver `afirmaPreco`.
 */
export interface OrigensValidas {
  catalogo?: TermosDoCatalogo;
  /** taxa de entrega e limite de frete grátis, da configuração */
  valoresDaLoja?: number[];
  /** a mensagem do cliente desta rodada */
  textoDoCliente?: string;
}

/**
 * Os nomes do catálogo da loja, para a regra de disponibilidade ser exata.
 *
 * Sem eles a regra era um chute e me mordeu: o cliente perguntou "vocês
 * fazem fiado?", o bot respondeu corretamente falando das formas de
 * pagamento — "temos PIX e dinheiro" — e o "temos" bateu na regra de
 * disponibilidade de PRODUTO. Resposta certa recusada.
 *
 * Com a lista, "temos" só conta como afirmação de estoque quando a frase
 * cita uma marca, modelo ou sabor que existe nesta loja. Vem de
 * `termosDoCatalogo()`, que o motor já carrega para classificar a intenção.
 */
export interface TermosDoCatalogo {
  marcas: string[];
  modelos: string[];
  sabores: string[];
}

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

/** Os valores que o texto do bot afirma em reais, com o trecho de origem. */
export function valoresNoTexto(texto: string): Array<{ valor: string; bruto: string }> {
  const achados: Array<{ valor: string; bruto: string }> = [];

  const padroes = [
    /R\$\s*([\d.]+,\d{1,2}|\d+(?:[.,]\d{1,2})?)/gi,
    /([\d.]+,\d{1,2}|\d+)\s*reais\b/gi,
  ];

  for (const padrao of padroes) {
    for (const m of texto.matchAll(padrao)) {
      const bruto = m[1];
      const v = bruto ? normalizar(bruto) : null;
      if (v && bruto) achados.push({ valor: v, bruto });
    }
  }

  return achados;
}

/** Todo número em reais que o cliente escreveu — "troco pra 100". */
function valoresDoCliente(texto?: string): Set<string> {
  const conjunto = new Set<string>();
  if (!texto) return conjunto;

  for (const m of texto.matchAll(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)) {
    const v = normalizar(m[0]);
    if (v) conjunto.add(v);
  }
  return conjunto;
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
 * A frase fala de um produto desta loja?
 *
 * Sem a lista do catálogo responde `false`: melhor deixar passar uma frase
 * duvidosa que barrar uma resposta certa. Quem barra preço inventado é a
 * regra 1, que não depende disto.
 */
function citaProduto(texto: string, catalogo?: TermosDoCatalogo): boolean {
  if (!catalogo) return false;
  const t = SEM_ACENTO(texto);
  const nomes = [...catalogo.marcas, ...catalogo.modelos, ...catalogo.sabores];
  return nomes.some((n) => n && t.includes(SEM_ACENTO(n)));
}

/**
 * As ferramentas que tornam verdadeira a frase "já está no carrinho".
 *
 * A política hoje deixa o modelo chamá-las (§24 do escopo), então a frase
 * pode ser legítima — mas só depois de a ferramenta rodar e dar certo. Antes
 * disso é promessa sem lastro, e é isso que esta lista separa.
 */
const ESCREVEU_NO_CARRINHO = ["adicionar_carrinho", "remover_carrinho"];

/** O que torna verdadeira a frase "seu pedido está confirmado". */
const ANDOU_O_PEDIDO = ["consultar_pedido", "consultar_pagamento", "confirmar_pedido"];

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
  /\badicionei\b|\bcoloquei\b|\bbotei\b|\bseparei\b|\breservei\b|\bja esta no carrinho\b|\bja ta no carrinho\b|\banotei (seu|o) pedido\b|\bpode considerar (fechado|separado)\b/g;

/**
 * O que a frase precisa mencionar para "separei" ser sobre o carrinho.
 *
 * Duas recusas falsas ao vivo vieram daqui. "Vou separar", "já separo" e
 * "já reservo" são OFERTA — é o que o bot deve dizer antes de agir — e
 * estavam na lista como se fossem coisa feita. E "coloquei" pega "coloquei
 * seu endereço", que não tem nada a ver com estoque.
 *
 * Então o verbo só conta quando a frase fala de carrinho, pedido ou unidade,
 * ou cita um produto desta loja. Mesma ideia da regra de disponibilidade.
 */
const CONTEXTO_DE_CARRINHO = /\bcarrinho\b|\bpedido\b|\bunidade/;

const PEDIDO_ANDOU =
  /\bpedido (foi )?confirmad|\bpix (caiu|aprovad|confirmad)|\bpagamento (caiu|aprovad|confirmad)|\bsaiu para entrega\b|\besta separad|\bja esta a caminho\b/g;

/**
 * A frase afirma um PREÇO, em vez de só repetir um número?
 *
 * É o que separa "você paga com R$ 100" de "faço por R$ 60". Na primeira o
 * valor do cliente é legítimo; na segunda ele está virando preço.
 */
const AFIRMA_PRECO =
  /\bsai (por|a)\b|\bcusta\b|\bfica (por|em|r\$)\b|\bfaco por\b|\bfaco\b|\bpreco\b|\bpor r\$|\bta r\$|\be r\$/;

function afirmaPreco(frase: string): boolean {
  return AFIRMA_PRECO.test(SEM_ACENTO(frase));
}

/** A frase em que o valor aparece — não o texto todo. */
function fraseDoValor(texto: string, bruto: string): string {
  for (const frase of texto.split(/[.!?\n]+/)) {
    if (frase.includes(bruto)) return frase;
  }
  return texto;
}

/* -------------------------------------------------------------- VEREDITO -- */

export function conferirResposta(
  texto: string,
  leituras: LeituraFeita[],
  origens: OrigensValidas = {},
): Conferencia {
  if (!texto.trim()) {
    return { ok: false, motivo: "o modelo não escreveu nada" };
  }

  const comSucesso = leituras.filter((l) => l.ok);

  /* 1. dinheiro que não veio de nenhuma das três origens válidas */
  const afirmados = valoresNoTexto(texto);
  if (afirmados.length > 0) {
    const daConsulta = valoresNasLeituras(comSucesso);
    for (const n of origens.valoresDaLoja ?? []) {
      const v = normalizar(String(n));
      if (v) daConsulta.add(v);
    }

    const doCliente = valoresDoCliente(origens.textoDoCliente);

    for (const { valor, bruto } of afirmados) {
      if (daConsulta.has(valor)) continue;

      // o valor é do cliente: vale, menos quando está virando preço
      if (doCliente.has(valor) && !afirmaPreco(fraseDoValor(texto, bruto))) continue;

      return {
        ok: false,
        motivo: `afirmou R$ ${valor.replace(".", ",")}, que não saiu de nenhuma consulta`,
      };
    }
  }

  /* 2. disse que tem PRODUTO sem ter consultado nada */
  if (
    comSucesso.length === 0
    && citaProduto(texto, origens.catalogo)
    && afirmaSemNegacao(texto, TEM_PRODUTO)
  ) {
    return { ok: false, motivo: "afirmou disponibilidade sem consultar o estoque" };
  }

  /* 3. disse que mexeu no carrinho, coisa que ele não consegue fazer */
  const escreveu = comSucesso.some((l) => ESCREVEU_NO_CARRINHO.includes(l.nome));
  const sobreOCarrinho =
    CONTEXTO_DE_CARRINHO.test(SEM_ACENTO(texto)) || citaProduto(texto, origens.catalogo);

  if (!escreveu && sobreOCarrinho && afirmaSemNegacao(texto, DISSE_QUE_FEZ)) {
    return {
      ok: false,
      motivo: "disse que separou ou reservou, e nada foi reservado",
    };
  }

  /* 4. deu andamento de pedido ou pagamento por conta própria */
  const podeFalarDisso = comSucesso.some((l) => ANDOU_O_PEDIDO.includes(l.nome));
  if (!podeFalarDisso && afirmaSemNegacao(texto, PEDIDO_ANDOU)) {
    return { ok: false, motivo: "falou de pedido ou pagamento sem consultar a situação" };
  }

  return { ok: true };
}
