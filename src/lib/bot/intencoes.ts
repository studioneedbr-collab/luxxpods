/**
 * Intenções que o bot precisa reconhecer (§25 do escopo).
 *
 * A classificação por palavra-chave roda ANTES do modelo de linguagem: o que
 * dá para resolver com certeza — "quero pagar no pix", "cancela" — não
 * precisa de inferência, e resposta determinística é mais rápida e barata.
 * O modelo entra só no que sobra.
 */

export type Intencao =
  | "saudacao" | "comprar" | "marca" | "modelo" | "sabor" | "preco" | "estoque"
  | "catalogo" | "endereco" | "pagamento" | "pix" | "dinheiro" | "troco"
  | "confirmar" | "alterar_pedido" | "cancelar" | "prazo_entrega"
  | "problema" | "troca" | "falar_humano" | "maioridade" | "desconhecida";

interface Regra {
  intencao: Intencao;
  termos: RegExp;
  /** quando duas regras casam, a de maior peso vence */
  peso: number;
}

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const REGRAS: Regra[] = [
  // pedidos explícitos de gente têm prioridade sobre tudo
  { intencao: "falar_humano", peso: 100,
    termos: /\b(atendente|humano|pessoa|alguem|gerente|dono|responsavel|falar com|nao (e|eh) robo)\b/ },
  { intencao: "problema", peso: 95,
    termos: /\b(problema|defeito|quebrou|nao funciona|nao liga|vazando|vazou|estragado|reclamacao|ruim)\b/ },
  { intencao: "troca", peso: 94, termos: /\b(troca|trocar|devolver|devolucao|garantia)\b/ },
  { intencao: "cancelar", peso: 93, termos: /\b(cancela|cancelar|desisti|nao quero mais|deixa pra la)\b/ },

  { intencao: "pix", peso: 80, termos: /\b(pix|qr ?code|copia e cola|chave pix)\b/ },
  { intencao: "dinheiro", peso: 80, termos: /\b(dinheiro|especie|na entrega|pago na hora)\b/ },
  { intencao: "troco", peso: 82, termos: /\b(troco|trocado)\b/ },
  { intencao: "pagamento", peso: 70, termos: /\b(pagar|pagamento|forma de pagamento|cartao|credito|debito)\b/ },

  { intencao: "confirmar", peso: 75,
    termos: /^(sim|isso|ok|confirmo|confirmado|pode ser|fechado|fechou|blz|beleza|perfeito|ta certo|tudo certo|vamos|manda)\b/ },
  { intencao: "alterar_pedido", peso: 76,
    termos: /\b(alterar|mudar|trocar o sabor|adicionar|tirar|remover|errado)\b/ },

  { intencao: "catalogo", peso: 72,
    termos: /\b(catalogo|cardapio|lista|o que (voces )?tem|quais tem|opcoes|tabela)\b/ },
  { intencao: "sabor", peso: 68, termos: /\b(sabor|sabores|gosto)\b/ },
  { intencao: "preco", peso: 68, termos: /\b(preco|valor|quanto (custa|fica|(e|eh)|sai)|quanto)\b/ },
  { intencao: "estoque", peso: 66, termos: /\b(tem|disponivel|em estoque|acabou|chegou)\b/ },
  { intencao: "prazo_entrega", peso: 71,
    termos: /\b(quanto tempo|demora|prazo|chega quando|entrega hoje|hoje ainda|demora quanto)\b/ },
  { intencao: "endereco", peso: 69,
    termos: /\b(endereco|entregar em|rua|bairro|numero|cep|entrega em|meu endereco)\b/ },

  { intencao: "comprar", peso: 60,
    termos: /\b(quero|vou querer|comprar|pedido|me ve|manda|separa|leva)\b/ },
  { intencao: "maioridade", peso: 55, termos: /\b(\d{2} anos|maior de idade|sou de maior|tenho \d{2})\b/ },
  { intencao: "saudacao", peso: 20,
    termos: /^(oi+|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|salve|fala|hey|alo)\b/ },
];

/** Marcas e modelos são lidos do catálogo, nunca fixados aqui. */
export function classificar(
  texto: string,
  catalogo?: { marcas: string[]; modelos: string[]; sabores: string[] },
): { intencao: Intencao; confianca: number; termo?: string } {
  const t = normalizar(texto);
  if (!t) return { intencao: "desconhecida", confianca: 0 };

  let melhor: { intencao: Intencao; peso: number } | null = null;
  for (const regra of REGRAS) {
    if (regra.termos.test(t) && (!melhor || regra.peso > melhor.peso)) {
      melhor = { intencao: regra.intencao, peso: regra.peso };
    }
  }

  // o que o cliente escreveu é o nome de um produto nosso?
  if (catalogo) {
    const achar = (lista: string[]) =>
      lista.find((item) => item && t.includes(normalizar(item)));

    const modelo = achar(catalogo.modelos);
    if (modelo) return { intencao: "modelo", confianca: 0.95, termo: modelo };

    const marca = achar(catalogo.marcas);
    if (marca) return { intencao: "marca", confianca: 0.9, termo: marca };

    const sabor = achar(catalogo.sabores);
    if (sabor) return { intencao: "sabor", confianca: 0.88, termo: sabor };
  }

  if (!melhor) return { intencao: "desconhecida", confianca: 0 };
  return { intencao: melhor.intencao, confianca: Math.min(0.85, melhor.peso / 100) };
}

/** Sim/não do português falado, para confirmação de pedido. */
export function ehSim(texto: string): boolean {
  return /^(sim|s|isso|ok|confirmo|confirmado|pode|pode ser|claro|fechado|fechou|blz|beleza|perfeito|certo|tudo certo|aham|uhum|bora|manda|quero)\b/
    .test(normalizar(texto));
}

export function ehNao(texto: string): boolean {
  return /^(nao|n|nop|negativo|ainda nao|agora nao|deixa|espera|peraí|pera)\b/
    .test(normalizar(texto));
}
