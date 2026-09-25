/**
 * Regras de upsell, sem I/O.
 *
 * O bot oferece UMA vez, antes de pedir o endereço (ETAPA 08), e só quando
 * faz sentido: insistir ou empilhar oferta é o que faz o cliente abandonar
 * o carrinho na hora de fechar.
 */

export interface RegraAplicavel {
  id: string;
  nome: string;
  produto_origem: string | null;
  produto_destino: string | null;
  produto_destino_nome: string | null;
  mensagem: string;
  tipo_desconto: "valor" | "percentual";
  desconto: number;
  prioridade: number;
  status: "ativo" | "inativo";
  inicio?: string | null;
  fim?: string | null;
}

export interface ItemNoCarrinho {
  product_id: string;
  produto: string;
  preco: number;
  quantidade: number;
}

export interface OfertaEscolhida {
  regra: RegraAplicavel;
  /** quanto o cliente economiza se aceitar */
  descontoEmReais: number;
  mensagem: string;
}

/**
 * Escolhe a oferta certa para este carrinho — ou nenhuma.
 *
 * Nenhuma é uma resposta legítima: oferta fora de hora custa a venda que já
 * estava fechada.
 */
export function escolherOferta(
  regras: RegraAplicavel[],
  carrinho: ItemNoCarrinho[],
  jaOferecidas: string[],
  agora = new Date(),
): OfertaEscolhida | null {
  if (carrinho.length === 0) return null;

  const candidatas = regras
    .filter((r) => r.status === "ativo")
    .filter((r) => !jaOferecidas.includes(r.id))
    .filter((r) => dentroDoPrazo(r, agora))
    .filter((r) => {
      // sem produto de origem, vale para qualquer carrinho
      if (!r.produto_origem) return true;
      return carrinho.some((i) => i.product_id === r.produto_origem);
    })
    .sort((a, b) => a.prioridade - b.prioridade);

  const regra = candidatas[0];
  if (!regra) return null;

  // o desconto se calcula sobre o preço do item que disparou a regra
  const base = regra.produto_origem
    ? carrinho.find((i) => i.product_id === regra.produto_origem)
    : carrinho[0];
  if (!base) return null;

  const descontoEmReais = regra.tipo_desconto === "percentual"
    ? Number((base.preco * regra.desconto / 100).toFixed(2))
    : Math.min(regra.desconto, base.preco);

  // desconto que zera o preço não é oferta, é erro de cadastro
  if (descontoEmReais <= 0 || descontoEmReais >= base.preco) return null;

  return { regra, descontoEmReais, mensagem: regra.mensagem };
}

function dentroDoPrazo(r: RegraAplicavel, agora: Date): boolean {
  if (r.inicio && new Date(r.inicio) > agora) return false;
  if (r.fim && new Date(r.fim) < agora) return false;
  return true;
}

/**
 * O cliente aceitou? Só "sim" claro conta.
 *
 * Silêncio ou dúvida não é aceite: cobrar por uma oferta que a pessoa não
 * pediu é o tipo de erro que se paga com reclamação e troca.
 */
export function aceitouOferta(resposta: string): boolean {
  const t = resposta.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (/\b(nao|nem|deixa|so isso|so esse|obrigad|ta bom assim|tudo bem assim)\b/.test(t)) {
    return false;
  }
  return /^(sim|isso|quero|pode|bora|manda|aceito|vamos|claro|fechado|blz|beleza|ok|adiciona|poe|bota)\b/.test(t);
}
