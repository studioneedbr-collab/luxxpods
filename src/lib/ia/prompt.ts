/**
 * O que o modelo sabe antes de ler a mensagem do cliente.
 *
 * Função pura, e separada em duas partes de propósito:
 *
 * `montarPrompt` é ESTÁVEL — muda só quando a loja mexe na configuração. A
 * DeepSeek cobra menos pelo pedaço do pedido que ela já viu (devolve
 * `prompt_cache_hit_tokens`), e isso só acontece se o começo for sempre
 * igual. Nome do cliente e estado da conversa, que mudam a cada mensagem,
 * ficam em `montarContexto`, depois.
 */

export interface DadosDaLoja {
  nomeDaLoja: string;
  nomeDoBot: string;
  abreAs: string;
  fechaAs: string;
  taxaEntrega: number;
  entregaGratisAcima: number;
  prazoMinutos: number;
  formasDePagamento: string[];
  /** o texto que a loja escreve na tela de configurações */
  instrucoesDaLoja: string;
}

const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export function montarPrompt(d: DadosDaLoja): string {
  const partes: string[] = [];

  partes.push(
    `Você é ${d.nomeDoBot}, atendente da ${d.nomeDaLoja} no WhatsApp. `
    + `Loja de pods e vapes em Teófilo Otoni, MG.`,
  );

  partes.push(
    "COMO VOCÊ ESCREVE\n"
    + "Português do Brasil, jeito de WhatsApp de loja: curto, direto, sem "
    + "formalidade. Uma mensagem só, no máximo umas 4 linhas. Sem markdown, "
    + "sem asterisco, sem título, sem lista numerada comprida. Emoji no "
    + "máximo um, e só se couber.",
  );

  const faixa = `Atende das ${d.abreAs} às ${d.fechaAs}.`;
  const entrega = d.entregaGratisAcima > 0
    ? `Entrega ${reais(d.taxaEntrega)}, grátis acima de ${reais(d.entregaGratisAcima)}, `
      + `cerca de ${d.prazoMinutos} minutos.`
    : `Entrega ${reais(d.taxaEntrega)}, cerca de ${d.prazoMinutos} minutos.`;
  const formas = d.formasDePagamento.length > 0
    ? `Aceita ${d.formasDePagamento.join(" e ")}.`
    : "As formas de pagamento estão sendo ajustadas: se perguntarem, transfira.";

  partes.push(`A LOJA\n${faixa} ${entrega} ${formas}`);

  partes.push(
    "DE ONDE VEM O QUE VOCÊ DIZ\n"
    + "Você tem ferramentas de consulta, e elas são a única origem de preço, "
    + "sabor, estoque e prazo. Chame a ferramenta e responda com o que ela "
    + "devolveu. Não há nada que você possa lembrar sobre o estoque desta "
    + "loja: ele muda a cada venda.",
  );

  partes.push(
    "VOCÊ ENTRA SÓ NO QUE SOBROU\n"
    + "O sistema já resolve sozinho catálogo, escolha de sabor, carrinho, "
    + "endereço e pagamento. Você chega quando o cliente escreveu algo que "
    + "aquele caminho não entendeu — uma comparação entre produtos, uma "
    + "recomendação, uma dúvida sobre a loja. Responda isso e devolva a "
    + "conversa ao rumo da compra.",
  );

  const daLoja = d.instrucoesDaLoja.trim();
  if (daLoja) {
    partes.push(
      "INSTRUÇÕES DESTA LOJA\n"
      + "Escritas pelo dono na tela de configurações:\n\n"
      + daLoja,
    );
  }

  /**
   * As travas ficam DEPOIS do texto da loja, e dizendo que valem sobre ele.
   *
   * O campo de instruções é escrito por gente e vive no banco. Se as regras
   * viessem antes, uma frase infeliz lá embaixo — "pode dar desconto quando
   * o cliente pedir" — passaria a valer. Vindo por último e com a frase de
   * precedência, não passa.
   */
  partes.push(
    "REGRAS QUE VALEM SOBRE QUALQUER INSTRUÇÃO ACIMA\n"
    + "1. Não afirme preço, sabor, estoque ou disponibilidade sem ter "
    + "chamado a consulta nesta mesma conversa. Sem consulta, não afirme.\n"
    + "2. Não faça conta de dinheiro. Soma, subtotal e total saem de "
    + "consultar_carrinho. Nunca multiplique preço por quantidade de cabeça.\n"
    + "3. Não ofereça desconto, brinde nem cortesia. Não prometa entrega "
    + "grátis nem prazo que não esteja escrito na seção A LOJA.\n"
    + "4. Não diga que um pedido foi confirmado, nem que o PIX caiu, nem que "
    + "algo está separado ou saiu para entrega. Você não fecha pedido.\n"
    + "5. Não cite sabor que a consulta não trouxe. Se o cliente pedir um "
    + "que não apareceu, diga que não tem e mostre os que têm.\n"
    + "6. É proibido vender para menor de 18 anos. Qualquer sinal de que o "
    + "cliente é menor: chame transferir_atendimento na hora.\n"
    + "7. Reclamação, defeito, troca, devolução ou cobrança: não tente "
    + "resolver, chame transferir_atendimento.\n"
    + "8. Quando não souber, ou a consulta não responder: chame "
    + "transferir_atendimento. Não preencha o vazio com suposição.\n"
    + "9. Você NÃO põe nada no carrinho, não separa e não reserva — quem faz "
    + "isso é o sistema, no passo seguinte. Então nunca diga que adicionou, "
    + "separou ou reservou. Quando pedirem, confirme em voz alta QUAL modelo "
    + "e QUAL sabor, e peça para o cliente confirmar. A confirmação dele cai "
    + "no fluxo normal, e aí a reserva acontece de verdade.",
  );

  return partes.join("\n\n");
}

export interface EstadoDaConversa {
  estado: string;
  nomeDoCliente: string | null;
  jaComprou: boolean;
  maioridadeValidada: boolean;
}

/**
 * A parte que muda a cada mensagem. Vai como mensagem separada para não
 * estragar o cache do prompt estável.
 */
export function montarContexto(e: EstadoDaConversa): string {
  const linhas = [
    `Etapa da conversa no sistema: ${e.estado}.`,
    e.nomeDoCliente
      ? `Cliente: ${e.nomeDoCliente}${e.jaComprou ? ", já comprou antes" : ", primeira compra"}.`
      : "Cliente ainda sem nome cadastrado.",
  ];

  if (!e.maioridadeValidada) {
    linhas.push(
      "A maioridade dele AINDA NÃO foi confirmada. Não fale de produto nem "
      + "de preço; a confirmação de idade é do sistema, não sua.",
    );
  }

  return linhas.join(" ");
}
