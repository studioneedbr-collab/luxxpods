/**
 * O que o bot fala.
 *
 * O escopo é explícito: curto, comercial, direto, pouco robotizado (§3.2).
 * O mercado é de compra rápida — cada frase a mais é uma chance do cliente
 * desistir. Nada aqui inventa dado: o texto só formata o que a ferramenta
 * devolveu.
 */

const dinheiro = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Primeiro nome, que é como se fala com gente. */
export function primeiroNome(nome?: string | null): string {
  const limpo = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return limpo.length > 1 ? limpo : "";
}

const comNome = (nome: string, frase: string) =>
  nome ? `${nome}, ${frase}` : frase.charAt(0).toUpperCase() + frase.slice(1);

/* ------------------------------------------------------------- ABERTURA -- */

export function saudacao(nome: string, jaComprou: boolean): string {
  if (jaComprou && nome) {
    return `Opa ${nome}, que bom te ver de novo 🖤 O que vai ser hoje?`;
  }
  return "Fala! Aqui é da Luxx Pods 🖤 Como posso te ajudar?";
}

export function perguntarMaioridade(nome: string): string {
  return comNome(nome, "antes de seguir: você é maior de 18 anos?");
}

export const recusaMenor =
  "Desculpa, só vendemos para maiores de 18 anos. Qualquer coisa estamos por aqui 🖤";

export const foraDeHorario = (abre: string) =>
  `No momento estamos fechados. Voltamos a atender às ${abre} — me chama que eu te respondo 🖤`;

/* -------------------------------------------------------------- CATÁLOGO -- */

export function listarMarcas(marcas: string[], nome: string): string {
  if (marcas.length === 0) {
    return "Estamos repondo o estoque agora. Me chama daqui a pouco que já te mostro as opções!";
  }
  return comNome(nome, `temos ${marcas.join(", ")}. Qual marca te interessa?`);
}

export function listarModelos(
  modelos: Array<{ produto: string; preco: number; sabores: number; puffs: number | null }>,
  marca: string,
  marcasDisponiveis?: string[],
): string {
  if (modelos.length === 0) {
    const outras = marcasDisponiveis?.length
      ? ` Agora tenho ${marcasDisponiveis.join(", ")}.`
      : "";
    return `${marca} está em falta no momento.${outras} Quer ver?`;
  }

  const linhas = modelos.map((m) => {
    const puffs = m.puffs ? ` · ${(m.puffs / 1000).toFixed(0)}k puffs` : "";
    return `• ${m.produto} — ${dinheiro(m.preco)}${puffs}`;
  });

  return `Da ${marca} eu tenho:\n${linhas.join("\n")}\n\nQual você quer ver os sabores?`;
}

export function listarSabores(dados: {
  produto: string;
  preco: number;
  sabores: Array<{ nome: string; disponivel: number; ultimas: boolean }>;
  outrosModelos?: string[];
}, nome: string): string {
  if (dados.sabores.length === 0) {
    return comNome(nome, "esse modelo está sem sabor disponível agora. Quer ver outro?");
  }

  const linhas = dados.sabores.map((s) =>
    s.ultimas ? `• ${s.nome} (últimas ${s.disponivel})` : `• ${s.nome}`);

  let texto = `${dados.produto} — ${dinheiro(dados.preco)}\n\n${linhas.join("\n")}`;

  // §4.8: poucos sabores, oferece alternativa sem o cliente pedir
  if (dados.sabores.length <= 2 && dados.outrosModelos?.length) {
    texto += `\n\nDesse modelo tenho poucas opções agora. Se quiser, te mostro os sabores do ${dados.outrosModelos[0]} também.`;
  } else {
    texto += "\n\nQual você quer?";
  }

  return texto;
}

export const semEstoque = (sabor: string) =>
  `${sabor} acabou 😕 Quer escolher outro sabor?`;

/* -------------------------------------------------------------- CARRINHO -- */

export function itemAdicionado(
  produto: string, sabor: string, quantidade: number, preco: number,
): string {
  const unidades = quantidade > 1 ? `${quantidade} unidades` : "1 unidade";
  return `Anotado: ${unidades} de ${produto} ${sabor} — ${dinheiro(preco * quantidade)}.\n\nQuer adicionar mais alguma coisa ou já fechamos?`;
}

export function resumoCarrinho(dados: {
  itens: Array<{ produto?: string; sabor?: string; quantidade?: number; subtotal?: number }>;
  subtotal: number; entrega: number; total: number;
}): string {
  const linhas = dados.itens.map((i) =>
    `${i.quantidade}x ${i.produto} ${i.sabor} — ${dinheiro(Number(i.subtotal ?? 0))}`);

  return [
    ...linhas,
    "",
    `Produtos: ${dinheiro(dados.subtotal)}`,
    `Entrega: ${dados.entrega === 0 ? "grátis" : dinheiro(dados.entrega)}`,
    `Total: ${dinheiro(dados.total)}`,
  ].join("\n");
}

/* -------------------------------------------------------------- ENDEREÇO -- */

export const pedirEndereco =
  "Show! Me passa o endereço da entrega: rua, número, bairro e um ponto de referência 🛵";

export function confirmarEnderecoAnterior(endereco: string, nome: string): string {
  return comNome(nome, `podemos entregar no mesmo endereço da última vez?\n\n${endereco}`);
}

/* ------------------------------------------------------------- PAGAMENTO -- */

export const perguntarPagamento = "Como prefere pagar: PIX ou dinheiro na entrega?";

export const perguntarTroco = "Vai precisar de troco? Me fala o valor que você vai usar.";

/**
 * O PIX vai em duas mensagens na cabeça do cliente: o valor e o código.
 * O copia e cola sai sozinho numa linha, para o cliente conseguir selecionar
 * sem levar junto o resto do texto.
 */
export function pixParaPagar(
  total: number, chave: string | null, copiaECola?: string | null,
  link?: string | null,
): string {
  // com gateway, o que existe é o link: o copia e cola e o QR nascem na
  // página dele. Mandar um link chamando de "copia e cola" faria o cliente
  // colar uma URL no banco e achar que o sistema está quebrado.
  if (link) {
    return [
      `Total: ${dinheiro(total)}`,
      "",
      "É só abrir aqui para pagar por PIX ou cartão:",
      link,
      "",
      "O pedido confirma sozinho assim que o pagamento cair 🖤",
    ].join("\n");
  }

  if (copiaECola) {
    return [
      `Total: ${dinheiro(total)}`,
      "",
      "Copia e cola do PIX:",
      copiaECola,
      "",
      "Assim que cair eu confirmo seu pedido 🖤",
    ].join("\n");
  }

  if (chave) {
    return `Total: ${dinheiro(total)}\n\nChave PIX: ${chave}\n\nMe manda o comprovante que eu confirmo seu pedido 🖤`;
  }

  return `Total: ${dinheiro(total)}\n\nJá te passo a chave PIX. Assim que o pagamento cair eu confirmo seu pedido 🖤`;
}

export function trocoAnotado(troco: number): string {
  return troco > 0
    ? `Certo, vou levar ${dinheiro(troco)} de troco.`
    : "Certo, sem troco então.";
}

/* ---------------------------------------------------------------- PEDIDO -- */

export function resumoParaConfirmar(dados: {
  itens: Array<{ produto?: string; sabor?: string; quantidade?: number; subtotal?: number }>;
  subtotal: number; entrega: number; total: number;
  forma_pagamento?: string; troco_para?: number;
}): string {
  const pagamento = dados.forma_pagamento === "pix" ? "PIX" : "Dinheiro na entrega";
  const troco = dados.troco_para
    ? `\nTroco para ${dinheiro(dados.troco_para)}` : "";

  return [
    "*RESUMO DO PEDIDO*",
    "",
    resumoCarrinho(dados),
    `Pagamento: ${pagamento}${troco}`,
    "",
    "Está tudo certo para confirmar?",
  ].join("\n");
}

export function pedidoConfirmado(numero: string, nome: string): string {
  return comNome(nome, `pedido confirmado ✅\n\nNúmero: ${numero}\n\nJá vou preparar e te aviso quando sair para entrega 🛵`);
}

export function situacaoPedido(numero: string, status: string): string {
  const frases: Record<string, string> = {
    confirmado: "está confirmado e vai entrar em separação",
    em_separacao: "já está sendo separado ✅",
    saiu_para_entrega: "saiu para entrega 🛵",
    entregue: "foi entregue",
    aguardando_pagamento: "está aguardando o pagamento cair",
    cancelado: "foi cancelado",
  };
  return `Seu pedido ${numero} ${frases[status] ?? "está em andamento"}.`;
}

/* ----------------------------------------------------------- NÃO ENTENDI -- */

/**
 * O bot não inventa (§3.4): quando não sabe, diz que vai chamar alguém.
 * Insistir com "não entendi" é o que faz o cliente desistir.
 */
export const naoEntendi = [
  "Não peguei essa. Você quer ver os modelos, saber preço ou fechar um pedido?",
  "Me ajuda aqui: você procura algum modelo específico?",
];

export const chamandoHumano =
  "Vou chamar alguém da equipe para te ajudar, só um minutinho 🖤";

export const problemaRelatado =
  "Poxa, sinto muito. Já estou passando para alguém da equipe resolver isso com você 🖤";
