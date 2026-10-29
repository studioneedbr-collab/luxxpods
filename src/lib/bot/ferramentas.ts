/**
 * Ferramentas do bot (§24 do escopo).
 *
 * O modelo de linguagem NUNCA escreve no banco. Ele escolhe uma destas
 * funções e passa argumentos; cada uma valida o que recebeu e só então
 * chama a regra de negócio. Estoque, preço e sabor saem daqui — nunca do
 * texto gerado — para o bot não conseguir inventar o que não existe.
 */

export interface ParametroFerramenta {
  nome: string;
  tipo: "string" | "number" | "boolean";
  descricao: string;
  obrigatorio: boolean;
}

export interface Ferramenta {
  nome: string;
  descricao: string;
  parametros: ParametroFerramenta[];
  /** só lê (pode rodar à vontade) ou escreve (exige estado e validação) */
  escreve: boolean;
  /** estados em que faz sentido chamar */
  estados?: string[];
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "buscar_marcas",
    descricao: "Lista as marcas que têm ao menos um sabor disponível agora.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "buscar_modelos",
    descricao: "Modelos de uma marca, com preço e quantos sabores estão disponíveis.",
    parametros: [
      { nome: "marca", tipo: "string", descricao: "Nome da marca", obrigatorio: true },
    ],
    escreve: false,
  },
  {
    nome: "buscar_sabores",
    descricao:
      "Sabores DISPONÍVEIS de um modelo. Só devolve o que dá para vender agora — " +
      "o que está esgotado não aparece.",
    parametros: [
      { nome: "produto", tipo: "string", descricao: "Nome ou modelo do produto", obrigatorio: true },
    ],
    escreve: false,
  },
  {
    nome: "modelos_com_sabor",
    descricao: "Em quais modelos um sabor está disponível agora, com preço e puffs.",
    parametros: [
      { nome: "sabor", tipo: "string", descricao: "Nome do sabor", obrigatorio: true },
    ],
    escreve: false,
  },
  {
    nome: "consultar_estoque",
    descricao: "Quantas unidades de um produto + sabor estão disponíveis.",
    parametros: [
      { nome: "produto", tipo: "string", descricao: "Produto", obrigatorio: true },
      { nome: "sabor", tipo: "string", descricao: "Sabor", obrigatorio: true },
    ],
    escreve: false,
  },
  {
    nome: "consultar_preco",
    descricao: "Preço atual de um produto. Nunca estime: consulte sempre.",
    parametros: [
      { nome: "produto", tipo: "string", descricao: "Produto", obrigatorio: true },
    ],
    escreve: false,
  },
  {
    nome: "enviar_catalogo",
    descricao: "Envia a imagem do catálogo e agenda o follow-up de 5 minutos.",
    parametros: [],
    escreve: true,
    estados: ["INITIAL", "CATALOG_SENT", "PRODUCT_SELECTION"],
  },
  {
    nome: "catalogo_completo",
    descricao:
      "Monta o catálogo inteiro em texto, com marca, modelo, puffs, preço e "
      + "os sabores DISPONÍVEIS agora. Só leitura, montado na hora: nunca "
      + "mostra sabor esgotado nem reservado por outro cliente.",
    parametros: [],
    escreve: false,
    estados: ["INITIAL", "CATALOG_SENT", "PRODUCT_SELECTION", "CART", "HUMAN"],
  },
  {
    nome: "adicionar_carrinho",
    descricao:
      "Põe um produto + sabor no carrinho e RESERVA o estoque. Falha se não " +
      "houver unidade disponível — é o que impede vender o que não existe.",
    parametros: [
      { nome: "produto", tipo: "string", descricao: "Produto", obrigatorio: true },
      { nome: "sabor", tipo: "string", descricao: "Sabor", obrigatorio: true },
      { nome: "quantidade", tipo: "number", descricao: "Quantas unidades", obrigatorio: true },
    ],
    escreve: true,
    estados: ["PRODUCT_SELECTION", "CART"],
  },
  {
    nome: "consultar_carrinho",
    descricao: "O que está no carrinho, com subtotal, entrega e total.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "remover_carrinho",
    descricao: "Tira um item do carrinho e devolve a reserva ao estoque.",
    parametros: [
      { nome: "produto", tipo: "string", descricao: "Produto a remover", obrigatorio: true },
      { nome: "sabor", tipo: "string", descricao: "Sabor a remover", obrigatorio: true },
    ],
    escreve: true,
    estados: ["CART", "ORDER_REVIEW"],
  },
  {
    nome: "buscar_enderecos",
    descricao: "Endereços que o cliente já usou, para oferecer em vez de perguntar tudo de novo.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "usar_endereco",
    descricao:
      "Usa para este pedido um endereço que o cliente JÁ TEM cadastrado (id vindo " +
      "de buscar_enderecos). Chame depois que ele disser que é o mesmo endereço.",
    parametros: [
      { nome: "endereco_id", tipo: "string", descricao: "id devolvido por buscar_enderecos", obrigatorio: true },
    ],
    escreve: true,
    estados: ["ADDRESS"],
  },
  {
    nome: "cadastrar_endereco",
    descricao: "Grava um endereço novo de entrega e usa neste pedido.",
    parametros: [
      { nome: "bairro", tipo: "string", descricao: "Bairro", obrigatorio: true },
      { nome: "rua", tipo: "string", descricao: "Rua", obrigatorio: true },
      { nome: "numero", tipo: "string", descricao: "Número", obrigatorio: true },
      { nome: "complemento", tipo: "string", descricao: "Complemento", obrigatorio: false },
      { nome: "referencia", tipo: "string", descricao: "Ponto de referência", obrigatorio: false },
    ],
    escreve: true,
    estados: ["ADDRESS"],
  },
  {
    nome: "calcular_entrega",
    descricao: "Taxa de entrega para o endereço escolhido.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "criar_pagamento",
    descricao:
      "Registra a forma de pagamento escolhida (e o troco, no dinheiro). No PIX, " +
      "o copia e cola só sai DEPOIS que o cliente confirmar o resumo: é o " +
      "confirmar_pedido que cria o pedido e devolve o código daquele pedido. " +
      "Com o pedido já criado, chamar de novo reenvia o código.",
    parametros: [
      { nome: "forma", tipo: "string", descricao: "pix, dinheiro ou cartao", obrigatorio: true },
      { nome: "troco_para", tipo: "number", descricao: "Valor com que o cliente vai pagar", obrigatorio: false },
    ],
    escreve: true,
    estados: ["PAYMENT", "ORDER_REVIEW"],
  },
  {
    nome: "consultar_pagamento",
    descricao: "Se o PIX já caiu. Nunca diga que caiu sem consultar.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "resumir_pedido",
    descricao: "Monta o resumo para o cliente conferir antes de confirmar.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "confirmar_pedido",
    descricao:
      "Cria o pedido de verdade depois do cliente confirmar o resumo. Dinheiro " +
      "e cartão confirmam na hora (baixa o estoque, gera o financeiro, manda " +
      "imprimir). PIX cria o pedido aguardando pagamento, com o estoque " +
      "reservado, e devolve o copia e cola: o pedido confirma sozinho quando " +
      "o pagamento cair.",
    parametros: [],
    escreve: true,
    estados: ["ORDER_REVIEW"],
  },
  {
    nome: "consultar_pedido",
    descricao: "Situação do último pedido do cliente (separação, rota, entregue).",
    parametros: [],
    escreve: false,
  },
  {
    nome: "buscar_upsell",
    descricao:
      "Verifica se há uma oferta para o carrinho atual. Use uma vez, antes de " +
      "pedir o endereço. Devolve nulo quando não há nada a oferecer.",
    parametros: [],
    escreve: true,
    estados: ["CART"],
  },
  {
    nome: "responder_upsell",
    descricao: "Registra se o cliente aceitou ou recusou a oferta apresentada.",
    parametros: [
      { nome: "aceita", tipo: "boolean", descricao: "true se aceitou", obrigatorio: true },
    ],
    escreve: true,
    estados: ["CART", "ADDRESS"],
  },
  {
    nome: "perfil_cliente",
    descricao:
      "O que se sabe do cliente: preferências que ele declarou, o que mais " +
      "compra, quantos puffs costuma levar, como costuma pagar, o último " +
      "pedido e o endereço salvo. Consulte antes de sugerir para quem já comprou.",
    parametros: [],
    escreve: false,
  },
  {
    nome: "salvar_preferencias",
    descricao:
      "Anota no cadastro o que o cliente disse que gosta. Só o que ele disse — " +
      "não deduza. Os campos são somados ao que já existe.",
    parametros: [
      { nome: "marcas", tipo: "string", descricao: "marcas separadas por vírgula", obrigatorio: false },
      { nome: "sabores", tipo: "string", descricao: "sabores separados por vírgula", obrigatorio: false },
      { nome: "perfil", tipo: "string", descricao: "gelado, menta, doce, fruta ou tabaco, separados por vírgula", obrigatorio: false },
      { nome: "puffs", tipo: "number", descricao: "quantos puffs procura, aproximado", obrigatorio: false },
    ],
    escreve: true,
  },
  {
    nome: "sugerir_produtos",
    descricao:
      "Modelos e sabores DISPONÍVEIS que combinam com uma preferência (perfil " +
      "de sabor, marca, puffs). Use para indicar algo ao indeciso.",
    parametros: [
      { nome: "perfil", tipo: "string", descricao: "gelado, menta, doce, fruta ou tabaco, separados por vírgula", obrigatorio: false },
      { nome: "marca", tipo: "string", descricao: "marca preferida", obrigatorio: false },
      { nome: "puffs", tipo: "number", descricao: "puffs mínimos", obrigatorio: false },
    ],
    escreve: false,
  },
  {
    nome: "repetir_ultimo_pedido",
    descricao:
      "Põe no carrinho os mesmos itens do último pedido do cliente, com o que " +
      "ainda tiver estoque. Use quando ele disser que quer o mesmo da última vez.",
    parametros: [],
    escreve: true,
    estados: ["INITIAL", "CATALOG_SENT", "PRODUCT_SELECTION", "CART"],
  },
  {
    nome: "criar_tarefa",
    descricao: "Abre uma pendência para a equipe, vinculada a esta conversa.",
    parametros: [
      { nome: "titulo", tipo: "string", descricao: "O que precisa ser resolvido", obrigatorio: true },
      { nome: "prioridade", tipo: "string", descricao: "baixa, media, alta ou urgente", obrigatorio: false },
    ],
    escreve: true,
  },
  {
    nome: "transferir_atendimento",
    descricao:
      "Passa a conversa para uma pessoa e pausa o bot. Use quando não souber " +
      "responder — nunca invente.",
    parametros: [
      { nome: "motivo", tipo: "string", descricao: "Por que está transferindo", obrigatorio: true },
    ],
    escreve: true,
  },
  {
    nome: "validar_maioridade",
    descricao: "Registra que o cliente confirmou ser maior de 18 anos.",
    parametros: [
      { nome: "confirmou", tipo: "boolean", descricao: "true se disse que é maior", obrigatorio: true },
    ],
    escreve: true,
  },
];

export const POR_NOME = new Map(FERRAMENTAS.map((f) => [f.nome, f]));

/** "cartao" sozinho vira crédito: a maquininha da entrega aceita os dois. */
export const FORMAS_DO_BOT = ["pix", "dinheiro", "cartao", "cartao_credito", "cartao_debito"];

export interface Validacao {
  valida: boolean;
  erro?: string;
}

/**
 * Antes de executar: a ferramenta existe? cabe neste estado? os argumentos
 * obrigatórios vieram? Recusa com motivo — nunca em silêncio.
 */
export function validarChamada(
  nome: string,
  argumentos: Record<string, unknown>,
  estado: string,
): Validacao {
  const ferramenta = POR_NOME.get(nome);
  if (!ferramenta) return { valida: false, erro: `Ferramenta "${nome}" não existe` };

  if (ferramenta.estados && !ferramenta.estados.includes(estado)) {
    return {
      valida: false,
      erro: `"${nome}" não pode ser usada em ${estado} (vale em: ${ferramenta.estados.join(", ")})`,
    };
  }

  for (const p of ferramenta.parametros) {
    const valor = argumentos[p.nome];
    if (p.obrigatorio && (valor === undefined || valor === null || valor === "")) {
      return { valida: false, erro: `Falta "${p.nome}" para chamar ${nome}` };
    }
    if (valor !== undefined && valor !== null && typeof valor !== p.tipo) {
      return {
        valida: false,
        erro: `"${p.nome}" deveria ser ${p.tipo}, veio ${typeof valor}`,
      };
    }
  }

  if (nome === "adicionar_carrinho") {
    const q = Number(argumentos.quantidade);
    if (!Number.isInteger(q) || q < 1 || q > 20) {
      return { valida: false, erro: "Quantidade tem que ser um inteiro entre 1 e 20" };
    }
  }

  if (nome === "criar_pagamento") {
    const forma = String(argumentos.forma ?? "").toLowerCase();
    if (!FORMAS_DO_BOT.includes(forma)) {
      return { valida: false, erro: 'Forma de pagamento tem que ser "pix", "dinheiro" ou "cartao"' };
    }
  }

  return { valida: true };
}

/** Formato de tool para a API da Anthropic. */
export function paraFormatoAnthropic() {
  return FERRAMENTAS.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: {
      type: "object" as const,
      properties: Object.fromEntries(
        f.parametros.map((p) => [p.nome, { type: p.tipo, description: p.descricao }]),
      ),
      required: f.parametros.filter((p) => p.obrigatorio).map((p) => p.nome),
    },
  }));
}

/**
 * Formato de tool do protocolo da OpenAI — é o que a DeepSeek fala.
 *
 * Recebe a lista em vez de usar FERRAMENTAS inteira porque quem chama é a
 * política (src/lib/ia/politica.ts): o modelo só enxerga o que pode usar.
 */
export function paraFormatoOpenAI(lista: Ferramenta[] = FERRAMENTAS) {
  return lista.map((f) => ({
    type: "function" as const,
    function: {
      name: f.nome,
      description: f.descricao,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(
          f.parametros.map((p) => [p.nome, { type: p.tipo, description: p.descricao }]),
        ),
        required: f.parametros.filter((p) => p.obrigatorio).map((p) => p.nome),
      },
    },
  }));
}
