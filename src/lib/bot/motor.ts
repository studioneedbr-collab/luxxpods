import "server-only";
import { clienteDoSistema } from "../supabase/sistema";
import { STORE_ID } from "../supabase/config";
import { enfileirar } from "../fila/worker";
import { demo, demoEnviarMensagem } from "../demo";
import { classificar, ehNao, ehSim, type Intencao } from "./intencoes";
import { aceitouOferta } from "./upsell";
import { deveChamarHumano, proximoEstado, type Contexto } from "./estados";
import { executar, type Ambiente } from "./executor";
import { agendarFollowup } from "./recepcao";
import * as fala from "./respostas";
import type { ConversaEstado } from "../types";

/**
 * O motor de conversa.
 *
 * Roda depois que a mensagem já está gravada. A sequência é sempre a mesma:
 * ler o estado, entender a intenção, executar a ferramenta, responder com o
 * que ela devolveu. O texto nunca carrega dado que não veio de consulta.
 */

export interface Resultado {
  respondeu: boolean;
  motivo?: string;
  estado?: ConversaEstado;
  texto?: string;
}

export async function processar(
  conversationId: string,
  textoDoCliente: string,
): Promise<Resultado> {
  const conversa = await lerConversa(conversationId);
  if (!conversa) return { respondeu: false, motivo: "conversa não encontrada" };

  // atendente no comando: o bot não fala por cima
  if (!conversa.bot_ativo) {
    return { respondeu: false, motivo: "bot pausado nesta conversa" };
  }

  if (!(await dentroDoHorario())) {
    const abre = await horarioDeAbertura();
    await responder(conversationId, fala.foraDeHorario(abre));
    return { respondeu: true, motivo: "fora do horário" };
  }

  const ambiente: Ambiente = {
    conversationId,
    customerId: conversa.customer_id,
    estado: conversa.estado,
    contexto: conversa.contexto,
  };

  const nome = fala.primeiroNome(conversa.cliente_nome);
  const catalogo = await termosDoCatalogo();
  const { intencao } = classificar(textoDoCliente, catalogo);

  const resposta = await decidir(intencao, textoDoCliente, ambiente, nome, conversa);

  if (resposta.transferir) {
    await executar("transferir_atendimento",
      { motivo: resposta.transferir }, ambiente);
    await responder(conversationId, resposta.texto);
    return { respondeu: true, motivo: `transferido: ${resposta.transferir}` };
  }

  await salvarContexto(conversationId, resposta.contexto, resposta.estado);
  await responder(conversationId, resposta.texto);

  if (resposta.enviarCatalogo) await agendarFollowup(conversationId);

  return { respondeu: true, estado: resposta.estado, texto: resposta.texto };
}

/**
 * O cliente nunca lê erro técnico.
 *
 * "adicionar_carrinho não pode ser usada em INITIAL" é informação para o log,
 * não para quem está comprando. Aqui o erro vira uma frase humana — e, se não
 * houver tradução, vira pedido de ajuda em vez de despejo de mensagem interna.
 */
function falarErro(erro: string | undefined, alternativa: string): string {
  if (!erro) return alternativa;

  // erros que o cliente PRECISA entender, porque são sobre o pedido dele
  const doCliente = [
    /esgotad/i, /só tenho/i, /só tem/i, /não achei/i, /não está disponível/i,
    /carrinho está vazio/i, /menor que o total/i, /ainda não caiu/i,
    /falta confirmar/i, /falta escolher/i,
  ];
  if (doCliente.some((r) => r.test(erro))) return erro;

  // o resto é problema nosso: registra e responde como gente
  console.error(`[luxx] o bot escondeu um erro técnico do cliente: ${erro}`);
  return alternativa;
}

/* --------------------------------------------------------------- DECISÃO -- */

interface Decisao {
  texto: string;
  estado: ConversaEstado;
  contexto: Partial<Contexto>;
  transferir?: string;
  enviarCatalogo?: boolean;
}

async function decidir(
  intencao: Intencao,
  texto: string,
  amb: Ambiente,
  nome: string,
  conversa: ConversaLida,
): Promise<Decisao> {
  const ctx = amb.contexto;
  const estadoAtual = amb.estado as ConversaEstado;
  const proximo = proximoEstado(estadoAtual, intencao, ctx);

  /**
   * Executa considerando o estado para onde a conversa está indo.
   * Validar contra o estado anterior recusava a própria transição que o
   * cliente acabou de pedir.
   */
  const executarEm = (
    nomeFerramenta: string,
    argumentos: Record<string, unknown>,
    estadoAlvo: ConversaEstado = proximo,
  ) => executar(nomeFerramenta, argumentos, { ...amb, estado: estadoAlvo });

  const manter = (texto: string, novoContexto: Partial<Contexto> = {}): Decisao =>
    ({ texto, estado: proximo, contexto: novoContexto });

  /* ---- oferta esperando resposta: é dela que a mensagem trata ---- */

  if (ctx.upsell_pendente && intencao !== "falar_humano" && intencao !== "problema") {
    const aceita = aceitouOferta(texto);
    await executar("responder_upsell", { aceita }, { ...amb, estado: "CART" });

    if (aceita) {
      const carrinho = await executar("consultar_carrinho", {}, amb);
      const d = carrinho.dados as Parameters<typeof fala.resumoCarrinho>[0];
      return {
        texto: `Boa! Adicionei 🖤\n\n${fala.resumoCarrinho(d)}\n\n${fala.pedirEndereco}`,
        estado: "ADDRESS",
        contexto: { upsell_pendente: undefined },
      };
    }

    return {
      texto: `Sem problema!\n\n${fala.pedirEndereco}`,
      estado: "ADDRESS",
      contexto: { upsell_pendente: undefined },
    };
  }

  /* ---- o que interrompe qualquer fluxo ---- */

  if (intencao === "falar_humano") {
    return { texto: fala.chamandoHumano, estado: "HUMAN", contexto: {},
             transferir: "cliente pediu atendente" };
  }
  if (intencao === "problema" || intencao === "troca") {
    return { texto: fala.problemaRelatado, estado: "HUMAN", contexto: {},
             transferir: intencao === "troca" ? "pedido de troca" : "problema com produto" };
  }
  if (deveChamarHumano(ctx)) {
    return { texto: fala.chamandoHumano, estado: "HUMAN", contexto: {},
             transferir: "o bot não entendeu três vezes seguidas" };
  }

  /* ---- maioridade antes de vender (§3.3) ---- */

  if (!conversa.maioridade_validada) {
    if (ehSim(texto) || intencao === "maioridade") {
      await executar("validar_maioridade", { confirmou: true }, amb);
      const marcas = await executar("buscar_marcas", {}, amb);
      const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
      // sai de INITIAL: a próxima mensagem já é escolha de produto
      return {
        texto: fala.listarMarcas(lista, nome),
        estado: "PRODUCT_SELECTION",
        contexto: { maioridade_validada: true },
      };
    }
    if (ehNao(texto)) {
      return { texto: fala.recusaMenor, estado: "ABANDONED", contexto: {} };
    }
    return manter(fala.perguntarMaioridade(nome));
  }

  /* ---- o fluxo de venda ---- */

  switch (intencao) {
    case "saudacao":
      return manter(fala.saudacao(nome, conversa.ja_comprou));

    case "catalogo": {
      // "manda o catálogo" quer a lista inteira, não uma pergunta de volta.
      // O texto é montado agora, do estoque: sabor esgotado não aparece.
      if (ctx.product_flavor_id && estadoAtual === "CART") {
        return decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa);
      }

      const r = await executar("catalogo_completo", {}, amb);
      const d = r.dados as { texto?: string; vazio?: boolean };

      if (!r.ok || !d?.texto || d.vazio) {
        // sem estoque nenhum não há catálogo para mandar
        const marcas = await executar("buscar_marcas", {}, amb);
        const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
        return {
          texto: fala.listarMarcas(lista, nome),
          estado: "PRODUCT_SELECTION",
          contexto: {},
        };
      }

      return {
        texto: d.texto,
        estado: "CATALOG_SENT",
        contexto: {},
        enviarCatalogo: true,
      };
    }

    case "comprar": {
      // quem diz "quero comprar" está pronto para escolher: perguntar a
      // marca é mais rápido que mandar tudo e esperar ele ler
      if (ctx.product_flavor_id && estadoAtual === "CART") {
        return decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa);
      }
      const marcas = await executar("buscar_marcas", {}, amb);
      const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
      return {
        texto: fala.listarMarcas(lista, nome),
        estado: "PRODUCT_SELECTION",
        contexto: {},
        enviarCatalogo: true,
      };
    }

    case "marca": {
      const r = await executar("buscar_modelos", { marca: texto }, amb);
      const d = r.dados as {
        modelos: Array<{ produto: string; preco: number; sabores: number; puffs: number | null }>;
        marcasDisponiveis?: string[];
      };
      return manter(
        fala.listarModelos(d.modelos, texto, d.marcasDisponiveis),
        r.contexto ?? {},
      );
    }

    case "sabor": {
      /**
       * O cliente respondeu só o sabor — "Watermelon Ice" — depois de ver a
       * lista de um modelo. É o caminho mais comum da conversa, e procurar um
       * PRODUTO com esse nome não acharia nada: o modelo está no contexto.
       */
      if (ctx.modelo_interesse) {
        const add = await executarEm("adicionar_carrinho",
          { produto: ctx.modelo_interesse, sabor: texto, quantidade: 1 }, "CART");

        if (add.ok) {
          const dd = add.dados as { produto: string; sabor: string; quantidade: number; preco: number };
          return {
            texto: fala.itemAdicionado(dd.produto, dd.sabor, dd.quantidade, dd.preco),
            estado: "CART",
            contexto: add.contexto ?? {},
          };
        }

        // sabor que não existe nesse modelo: mostra o que existe, sem erro seco
        const lista = await executar("buscar_sabores", { produto: ctx.modelo_interesse }, amb);
        const ld = lista.dados as Parameters<typeof fala.listarSabores>[0] & { produto: string | null };
        if (ld.produto) {
          return manter(`${falarErro(add.erro, "Esse sabor eu não tenho nesse modelo.")}\n\n${fala.listarSabores(ld, nome)}`);
        }
        return manter(falarErro(add.erro, "Esse sabor eu não tenho agora."));
      }

      return decidir("modelo" as Intencao, texto, amb, nome, conversa);
    }

    case "modelo": {
      const r = await executar("buscar_sabores", { produto: texto }, amb);
      const d = r.dados as Parameters<typeof fala.listarSabores>[0] & { produto: string | null };
      if (!d.produto) {
        const marcas = await executar("buscar_marcas", {}, amb);
        const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
        return manter(fala.listarMarcas(lista, nome));
      }

      // o cliente já disse o sabor junto com o modelo? então já reserva
      const saborPedido = d.sabores.find((s) =>
        texto.toLowerCase().includes(s.nome.toLowerCase()));

      if (saborPedido) {
        const add = await executarEm("adicionar_carrinho",
          { produto: d.produto, sabor: saborPedido.nome, quantidade: 1 }, "CART");
        if (add.ok) {
          const dd = add.dados as { produto: string; sabor: string; quantidade: number; preco: number };
          return {
            texto: fala.itemAdicionado(dd.produto, dd.sabor, dd.quantidade, dd.preco),
            estado: "CART",
            contexto: add.contexto ?? {},
          };
        }
        return manter(falarErro(add.erro, fala.semEstoque(saborPedido.nome)));
      }

      return manter(fala.listarSabores(d, nome), r.contexto ?? {});
    }

    case "preco": {
      const r = await executar("consultar_preco", { produto: texto }, amb);
      const d = r.dados as { encontrado: boolean; produto?: string; preco?: number };
      if (!d.encontrado) {
        const marcas = await executar("buscar_marcas", {}, amb);
        const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
        return manter(fala.listarMarcas(lista, nome));
      }
      return manter(`${d.produto} sai por R$ ${Number(d.preco).toFixed(2).replace(".", ",")}. Quer ver os sabores?`);
    }

    case "endereco": {
      // o texto do cliente é o endereço em si; o atendente confere depois
      return manter(
        "Anotado! Só confirma pra mim: qual a forma de pagamento, PIX ou dinheiro?",
        { endereco_confirmado: true },
      );
    }

    case "fechar_carrinho": {
      // ETAPA 08: a oferta acontece aqui, uma vez, antes do endereço
      const up = await executarEm("buscar_upsell", {}, "CART");
      const oferta = (up.dados as { oferta: { mensagem: string } | null })?.oferta;

      if (oferta) {
        return { texto: oferta.mensagem, estado: "CART", contexto: up.contexto ?? {} };
      }

      const carrinho = await executar("consultar_carrinho", {}, amb);
      const d = carrinho.dados as Parameters<typeof fala.resumoCarrinho>[0] & { vazio?: boolean };
      if (d?.vazio) return manter("Vamos escolher os produtos primeiro?");

      return {
        texto: `${fala.resumoCarrinho(d)}\n\n${fala.pedirEndereco}`,
        estado: "ADDRESS",
        contexto: {},
      };
    }

    case "pix": {
      const r = await executarEm("criar_pagamento", { forma: "pix" }, "PAYMENT");
      if (!r.ok) return manter(falarErro(r.erro, "Vamos escolher os produtos primeiro?"));
      const d = r.dados as {
        total: number; chave: string | null;
        copiaECola?: string | null; link?: string | null;
      };
      return {
        texto: fala.pixParaPagar(d.total, d.chave, d.copiaECola, d.link),
        estado: "PAYMENT",
        contexto: r.contexto ?? {},
      };
    }

    case "dinheiro":
      return { texto: fala.perguntarTroco, estado: "PAYMENT",
               contexto: { forma_pagamento: "dinheiro" } };

    case "troco": {
      const valor = Number((texto.match(/\d+([.,]\d{2})?/) ?? ["0"])[0].replace(",", "."));
      const r = await executarEm("criar_pagamento",
        { forma: "dinheiro", troco_para: valor }, "PAYMENT");
      if (!r.ok) return manter(falarErro(r.erro, "Me fala o valor que você vai usar."));
      const d = r.dados as { troco: number };
      const resumo = await executar("resumir_pedido", {}, amb);
      return {
        texto: `${fala.trocoAnotado(d.troco)}\n\n${fala.resumoParaConfirmar(resumo.dados as never)}`,
        estado: "ORDER_REVIEW",
        contexto: r.contexto ?? {},
      };
    }

    case "pagamento":
      return manter(fala.perguntarPagamento);

    case "confirmar": {
      if (estadoAtual !== "ORDER_REVIEW") {
        const resumo = await executar("resumir_pedido", {}, amb);
        const d = resumo.dados as { vazio?: boolean };
        if (d?.vazio) return manter(fala.perguntarPagamento);
        return { texto: fala.resumoParaConfirmar(resumo.dados as never),
                 estado: "ORDER_REVIEW", contexto: {} };
      }

      const r = await executarEm("confirmar_pedido", {}, "ORDER_REVIEW");
      if (!r.ok) return manter(falarErro(r.erro, "Ainda falta algo para fechar o pedido."));
      const d = r.dados as { numero: string };
      return { texto: fala.pedidoConfirmado(d.numero, nome),
               estado: "ORDER_CONFIRMED", contexto: r.contexto ?? {} };
    }

    case "prazo_entrega":
      return manter("A entrega leva cerca de 45 minutos depois de confirmado 🛵");

    case "estoque": {
      const r = await executar("buscar_sabores", { produto: texto }, amb);
      const d = r.dados as Parameters<typeof fala.listarSabores>[0] & { produto: string | null };
      if (!d.produto) return manter("Me fala qual modelo que eu confiro pra você.");
      return manter(fala.listarSabores(d, nome), r.contexto ?? {});
    }

    case "cancelar":
      return { texto: "Sem problema! Se mudar de ideia é só chamar 🖤",
               estado: "ABANDONED", contexto: {} };

    case "alterar_pedido":
      return manter("Claro! O que você quer mudar no pedido?");

    default: {
      // não entendeu: conta a falha, e na terceira chama gente
      const falhas = (ctx.falhas_seguidas ?? 0) + 1;
      if (falhas >= 3) {
        return { texto: fala.chamandoHumano, estado: "HUMAN", contexto: { falhas_seguidas: 0 },
                 transferir: "o bot não entendeu três vezes seguidas" };
      }
      return manter(fala.naoEntendi[falhas - 1] ?? fala.naoEntendi[0],
                    { falhas_seguidas: falhas });
    }
  }
}

/* ----------------------------------------------------------------- APOIO -- */

interface ConversaLida {
  customer_id: string | null;
  cliente_nome: string | null;
  estado: ConversaEstado;
  bot_ativo: boolean;
  contexto: Contexto;
  maioridade_validada: boolean;
  ja_comprou: boolean;
}

async function lerConversa(id: string): Promise<ConversaLida | null> {
  const c = await clienteDoSistema();

  if (!c) {
    const conversa = demo().conversas.find((x) => x.id === id);
    if (!conversa) return null;
    const cliente = conversa.cliente;
    return {
      customer_id: conversa.customer_id,
      cliente_nome: cliente?.nome ?? null,
      estado: conversa.estado,
      bot_ativo: conversa.bot_ativo,
      contexto: (conversa as { contexto?: Contexto }).contexto ?? {},
      maioridade_validada: cliente?.maioridade_validada ?? false,
      ja_comprou: (cliente?.total_pedidos ?? 0) > 0,
    };
  }

  const { data } = await c.from("conversations")
    .select("customer_id, estado, bot_ativo, contexto, customers(nome, maioridade_validada, total_pedidos)")
    .eq("id", id).maybeSingle();
  if (!data) return null;

  const cliente = data.customers as {
    nome?: string; maioridade_validada?: boolean; total_pedidos?: number;
  } | null;

  return {
    customer_id: data.customer_id as string | null,
    cliente_nome: cliente?.nome ?? null,
    estado: data.estado as ConversaEstado,
    bot_ativo: data.bot_ativo as boolean,
    contexto: (data.contexto ?? {}) as Contexto,
    maioridade_validada: cliente?.maioridade_validada ?? false,
    ja_comprou: (cliente?.total_pedidos ?? 0) > 0,
  };
}

async function salvarContexto(
  conversationId: string,
  contexto: Partial<Contexto>,
  estado: ConversaEstado,
) {
  const c = await clienteDoSistema();

  if (!c) {
    const conversa = demo().conversas.find((x) => x.id === conversationId);
    if (conversa) {
      conversa.estado = estado;
      conversa.contexto = { ...(conversa.contexto ?? {}), ...contexto };
    }
    return;
  }

  const { data } = await c.from("conversations")
    .select("contexto").eq("id", conversationId).maybeSingle();

  await c.from("conversations").update({
    estado,
    contexto: { ...((data?.contexto ?? {}) as object), ...contexto },
    ultima_interacao_sistema: new Date().toISOString(),
  }).eq("id", conversationId);
}

/** Grava a resposta do bot e enfileira a entrega. */
async function responder(conversationId: string, texto: string) {
  const c = await clienteDoSistema();

  let messageId = "";
  if (!c) {
    messageId = demoEnviarMensagem(conversationId, texto, "bot").id;
  } else {
    const { data } = await c.from("messages").insert({
      conversation_id: conversationId,
      store_id: STORE_ID,
      sender_type: "bot",
      tipo: "texto",
      conteudo: texto,
      status: "pendente",
    }).select("id").single();
    messageId = data?.id ?? "";

    await c.from("conversations").update({
      ultima_mensagem: texto,
      ultima_mensagem_em: new Date().toISOString(),
    }).eq("id", conversationId);
  }

  await enfileirar(
    "enviar_mensagem",
    { conteudo: texto, message_id: messageId, natureza: "transacional" },
    { conversationId },
  );
}

/** Marcas, modelos e sabores reais — para a classificação não chutar. */
async function termosDoCatalogo() {
  const c = await clienteDoSistema();
  const itens = c
    ? ((await c.from("v_catalogo").select("marca, produto, modelo, sabor")
        .eq("store_id", STORE_ID)).data ?? [])
    : demo().catalogo;

  return {
    marcas: [...new Set(itens.map((i) => String(i.marca ?? "")).filter(Boolean))],
    modelos: [...new Set(itens.map((i) => String(i.produto ?? "")).filter(Boolean))],
    sabores: [...new Set(itens.map((i) => String(i.sabor ?? "")).filter(Boolean))],
  };
}

async function dentroDoHorario(): Promise<boolean> {
  const c = await clienteDoSistema();
  if (!c) return true;

  const { data } = await c.from("settings")
    .select("valor").eq("store_id", STORE_ID).eq("chave", "atendimento").maybeSingle();
  const cfg = data?.valor as { horario_inicio?: string; horario_fim?: string } | undefined;
  if (!cfg?.horario_inicio || !cfg?.horario_fim) return true;

  const agora = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
  return agora >= cfg.horario_inicio && agora <= cfg.horario_fim;
}

async function horarioDeAbertura(): Promise<string> {
  const c = await clienteDoSistema();
  if (!c) return "10h";
  const { data } = await c.from("settings")
    .select("valor").eq("store_id", STORE_ID).eq("chave", "atendimento").maybeSingle();
  return (data?.valor as { horario_inicio?: string } | undefined)?.horario_inicio ?? "10h";
}
