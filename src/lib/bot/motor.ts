import "server-only";
import { clienteDoSistema } from "../supabase/sistema";
import { STORE_ID } from "../supabase/config";
import { enfileirar } from "../fila/worker";
import { demo, demoEnviarMensagem } from "../demo";
import { classificar, confirmouMaioridade, ehNao, idadeDeclarada, type Intencao } from "./intencoes";
import { aceitouOferta } from "./upsell";
import { deveChamarHumano, proximoEstado, type Contexto, type FormaPagamento } from "./estados";
import { executar, lerCatalogo, lerPerfil, type Ambiente, type PerfilDoCliente } from "./executor";
import {
  enderecoEmLinha, extrairEndereco, extrairPreferencias, preferenciasEmTexto,
  quantidadeNoTexto, semPreferencia,
} from "./extrair";
import { linhasDoPerfil } from "../ia/prompt";
import type { Configuracoes } from "../configuracoes";
import { agendarFollowup } from "./recepcao";
import * as fala from "./respostas";
import { atenderComIa, iaLigada } from "../ia/atender";
import { lerConfiguracoesDoSistema } from "../configuracoes-sistema";
import type { TermosDoCatalogo } from "../ia/conferir";
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

  const resposta = await decidir(
    intencao, textoDoCliente, ambiente, nome, conversa, catalogo);

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
    /falta confirmar/i, /falta escolher/i, /acabou/i, /não achei esse endereço/i,
  ];
  if (doCliente.some((r) => r.test(erro))) return erro;

  // o resto é problema nosso: registra e responde como gente
  console.error(`[luxx] o bot escondeu um erro técnico do cliente: ${erro}`);
  return alternativa;
}

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "sim" curto, para responder a uma oferta do bot — mais estrito que `ehSim`. */
const SIM_CURTO =
  /^(sim|s|ss|isso|isso mesmo|pode|pode ser|manda|bora|claro|fechou|fechado|beleza|blz|show|uhum|aham|ok|okay|exato|esse mesmo|quero sim|o mesmo|a mesma)\b/;
const QUER_O_MESMO = /\b(o mesmo|a mesma|mesma coisa|de novo|igual|repete|repetir)\b/;
const PAGUEI = /\b(paguei|ja paguei|fiz o pix|fiz o pagamento|transferi|comprovante|ja caiu|caiu ai|ja foi|mandei o pix|enviei o pix)\b/;

/**
 * O sabor do catálogo que aparece na frase — "quero 2 watermelon ice" é o
 * Watermelon Ice. O mais longo ganha: "Ice" sozinho não pode vencer "Mango Ice".
 */
function saborNoTexto(texto: string, catalogo: TermosDoCatalogo): string {
  const t = normalizar(texto);
  const achado = [...catalogo.sabores]
    .sort((a, b) => b.length - a.length)
    .find((s) => s && t.includes(normalizar(s)));
  return achado ?? texto;
}

/** A forma dita no texto, se houver. */
function formaNoTexto(t: string): FormaPagamento | null {
  if (/\bpix\b/.test(t)) return "pix";
  if (/\bdebito\b/.test(t)) return "cartao_debito";
  if (/\b(cartao|credito|maquininha|maquina)\b/.test(t)) return "cartao_credito";
  if (/\b(dinheiro|especie|na mao|cash)\b/.test(t)) return "dinheiro";
  return null;
}

/** "50", "R$ 100", "100,00", "cinquenta não": só número. */
function valorEmReais(t: string): number | null {
  const m = t.match(/(?:r\$\s*)?(\d{1,4}(?:[.,]\d{2})?)/);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return v > 0 ? v : null;
}

/** O que a loja aceita, na ordem em que o bot oferece. */
function formasAtivas(cfg: Configuracoes): FormaPagamento[] {
  return [
    cfg.pagamentos.pix_ativo ? "pix" : null,
    cfg.pagamentos.dinheiro_ativo ? "dinheiro" : null,
    cfg.pagamentos.cartao_ativo ? "cartao_credito" : null,
  ].filter((f): f is FormaPagamento => f !== null);
}

function formaAceita(forma: FormaPagamento, cfg: Configuracoes): boolean {
  if (forma === "pix") return cfg.pagamentos.pix_ativo;
  if (forma === "dinheiro") return cfg.pagamentos.dinheiro_ativo;
  return cfg.pagamentos.cartao_ativo;
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
  /** já carregado em `processar` para classificar; reaproveitado aqui */
  catalogo: TermosDoCatalogo,
): Promise<Decisao> {
  const d = await decidirFluxo(intencao, texto, amb, nome, conversa, catalogo);

  // a oferta "vai o mesmo?" vale só para a resposta seguinte: se o cliente
  // seguiu por outro caminho, um "sim" lá na frente não pode repetir o pedido
  if (amb.contexto.repetir_pedido_id && !("repetir_pedido_id" in d.contexto)) {
    d.contexto = { ...d.contexto, repetir_pedido_id: undefined };
  }
  return d;
}

async function decidirFluxo(
  intencao: Intencao,
  texto: string,
  amb: Ambiente,
  nome: string,
  conversa: ConversaLida,
  catalogo: TermosDoCatalogo,
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

  /** Lido uma vez por mensagem, e só quando alguém precisa. */
  let perfilLido: PerfilDoCliente | null = null;
  const perfil = async () => (perfilLido ??= await lerPerfil(amb.customerId));

  /** O carrinho fechou: endereço salvo vira pergunta de sim ou não. */
  const pedirEnderecoAntes = async (prefixo: string, extra: Partial<Contexto> = {}): Promise<Decisao> => {
    const salvo = (await perfil()).endereco;
    const pre = prefixo ? `${prefixo}\n\n` : "";
    if (salvo) {
      return { texto: pre + fala.confirmarEnderecoAnterior(salvo.linha, nome), estado: "ADDRESS",
               contexto: { ...extra, endereco_sugerido_id: salvo.id, endereco_confirmado: undefined } };
    }
    return { texto: pre + fala.pedirEndereco, estado: "ADDRESS",
             contexto: { ...extra, endereco_confirmado: undefined } };
  };


  /**
   * A IA, nos pontos em que o caminho determinístico desiste.
   *
   * Devolve `null` quando ela está desligada, falha, demora ou escreve algo
   * que o conferidor recusa — e aí o chamador segue com a resposta genérica
   * que já tinha. Nada depende de ela funcionar.
   *
   * Chamada em quatro lugares: quando a intenção não foi reconhecida, e nos
   * três casos em que a busca não achou o produto que o cliente citou. Esses
   * três respondiam listando as marcas ou pedindo o modelo de novo, o que
   * ignora a pergunta — é onde "tem como pagar depois?" virava "me fala qual
   * modelo que eu confiro".
   */
  const tentarIa = async (): Promise<Decisao | null> => {
    const cfg = await lerConfiguracoesDoSistema();
    if (!iaLigada(cfg)) return null;

    const r = await atenderComIa(texto, amb, {
      estado: estadoAtual,
      nomeDoCliente: conversa.cliente_nome,
      jaComprou: conversa.ja_comprou,
      maioridadeValidada: conversa.maioridade_validada,
      // o que o cliente gosta, compra e onde recebe — antes a IA sabia só
      // "já comprou: sim ou não"
      perfil: linhasDoPerfil(await perfil()),
    }, cfg, catalogo);

    if (!r.ok) return null;

    if (r.transferir) {
      return { texto: fala.chamandoHumano, estado: "HUMAN",
               contexto: { ...r.mudancasDeContexto, falhas_seguidas: 0 },
               transferir: r.transferir };
    }

    if (!r.texto) return null;

    // entendeu: zera o contador, senão uma conversa boa acabaria
    // transferida por falhas antigas
    return manter(r.texto, { ...r.mudancasDeContexto, falhas_seguidas: 0 });
  };

  /* ---- oferta esperando resposta: é dela que a mensagem trata ---- */

  if (ctx.upsell_pendente && estadoAtual === "CART"
      && intencao !== "falar_humano" && intencao !== "problema") {
    const aceita = aceitouOferta(texto);
    await executar("responder_upsell", { aceita }, { ...amb, estado: "CART" });

    if (aceita) {
      const carrinho = await executar("consultar_carrinho", {}, amb);
      const d = carrinho.dados as Parameters<typeof fala.resumoCarrinho>[0];
      return pedirEnderecoAntes(`Boa! Adicionei 🖤\n\n${fala.resumoCarrinho(d)}`,
        { upsell_pendente: undefined });
    }

    // a oferta sai do contexto: senão o endereço digitado em seguida era lido
    // como resposta a ela, e um "sim" depois punha o item no carrinho
    return pedirEnderecoAntes("Sem problema!", { upsell_pendente: undefined });
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

  // quem já se declarou menor não passa a ser maior na mensagem seguinte
  if (conversa.declarou_menor) {
    return { texto: fala.recusaMenor, estado: "ABANDONED", contexto: {} };
  }

  if (!conversa.maioridade_validada) {
    // o "não" primeiro: "tenho 16 anos" casava com a intenção maioridade e
    // era aceito como confirmação
    if (ehNao(texto)) {
      const idade = idadeDeclarada(texto);
      if ((idade !== null && idade < 18) || /\bmenor\b/i.test(texto)) {
        await marcarMenor(conversa.customer_id);
      }
      return { texto: fala.recusaMenor, estado: "ABANDONED", contexto: {} };
    }
    if (confirmouMaioridade(texto)) {
      await executar("validar_maioridade", { confirmou: true }, amb);
      const marcas = await executar("buscar_marcas", {}, amb);
      const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];

      // primeira vez: pergunta o gosto junto, sem travar quem já sabe o que quer
      const perguntar = !conversa.ja_comprou && lista.length > 0;
      // sai de INITIAL: a próxima mensagem já é escolha de produto
      return {
        texto: perguntar
          ? `${fala.listarMarcas(lista, nome)}\n\n${fala.perguntarPreferencia}`
          : fala.listarMarcas(lista, nome),
        estado: "PRODUCT_SELECTION",
        contexto: { maioridade_validada: true, ...(perguntar ? { pref_perguntada: true } : {}) },
      };
    }
    // a etapa não anda antes da idade: "quero ver os pods" aqui não é catálogo
    return { texto: fala.perguntarMaioridade(nome), estado: estadoAtual, contexto: {} };
  }

  /* ---- o fluxo de venda ---- */

  const cfg = await lerConfiguracoesDoSistema();
  const formas = formasAtivas(cfg);
  const t = normalizar(texto);

  /** Resumo para o sim final, com o contexto que acabou de mudar. */
  const resumir = async (prefixo: string, novo: Partial<Contexto>): Promise<Decisao> => {
    const r = await executar("resumir_pedido", {}, { ...amb, contexto: { ...ctx, ...novo } });
    return {
      texto: `${prefixo ? `${prefixo}\n\n` : ""}${fala.resumoParaConfirmar(r.dados as never)}`,
      estado: "ORDER_REVIEW",
      contexto: novo,
    };
  };

  /** A forma escolhida: dinheiro pergunta o troco; PIX e cartão vão ao resumo. */
  const escolherForma = async (
    forma: FormaPagamento, extra: Partial<Contexto> = {}, prefixo = "",
  ): Promise<Decisao> => {
    const pre = prefixo ? `${prefixo}\n\n` : "";
    const limpo = { ...extra, pagamento_sugerido: undefined };

    if (!formaAceita(forma, cfg)) {
      return { texto: pre + fala.formaIndisponivel(formas), estado: "PAYMENT",
               contexto: { ...limpo, forma_pagamento: undefined } };
    }
    if (forma === "dinheiro") {
      return { texto: pre + fala.perguntarTroco, estado: "PAYMENT",
               contexto: { ...limpo, forma_pagamento: "dinheiro", troco_respondido: undefined } };
    }

    const r = await executar("criar_pagamento", { forma },
      { ...amb, estado: "PAYMENT", contexto: { ...ctx, ...extra } });
    if (!r.ok) return manter(falarErro(r.erro, "Vamos escolher os produtos primeiro?"));
    return resumir(prefixo, { ...limpo, ...r.contexto });
  };

  /** Endereço resolvido: pergunta o pagamento, oferecendo o de costume. */
  const irParaPagamento = async (linha: string, novo: Partial<Contexto>): Promise<Decisao> => {
    const base = `Anotado 📍 ${linha}`;

    // a forma já foi dita antes ("vou pagar no pix", ainda no carrinho)
    if (ctx.forma_pagamento) return escolherForma(ctx.forma_pagamento, novo, base);

    const habitual = (await perfil()).deduzido.forma;
    if (habitual && formaAceita(habitual, cfg)) {
      return { texto: `${base}\n\n${fala.sugerirFormaHabitual(habitual)}`, estado: "PAYMENT",
               contexto: { ...novo, pagamento_sugerido: habitual } };
    }
    return { texto: `${base}\n\n${fala.perguntarPagamento(formas)}`, estado: "PAYMENT", contexto: novo };
  };

  const cadastrarEndereco = async (e: {
    rua: string; numero: string; bairro: string; complemento: string | null; referencia: string | null;
  }): Promise<Decisao> => {
    const r = await executar("cadastrar_endereco", { ...e }, amb);
    if (!r.ok) return manter(falarErro(r.erro, fala.naoLiEndereco));
    const d = r.dados as { linha?: string } & Parameters<typeof enderecoEmLinha>[0];
    return irParaPagamento(d.linha ?? enderecoEmLinha(d), r.contexto ?? {});
  };

  /* ---- PIX do pedido já criado, esperando o dinheiro ---- */

  if (estadoAtual === "PAYMENT" && ctx.order_id && ctx.pagamento_status === "aguardando") {
    if (/\b(codigo|copia|chave|qr|manda o pix|pix de novo|nao chegou)\b/.test(t)) {
      const r = await executar("criar_pagamento", { forma: "pix" }, amb);
      if (r.ok) {
        const d = r.dados as { total: number; chave: string | null; copiaECola?: string | null; link?: string | null };
        return manter(fala.pixParaPagar(d.total, d.chave, d.copiaECola, d.link));
      }
    }

    if (PAGUEI.test(t) || /^\[(imagem|documento)/.test(t)) {
      const st = await executar("consultar_pagamento", {}, amb);
      if ((st.dados as { status?: string })?.status === "aprovado") {
        return { texto: `Já caiu ✅ Seu pedido ${ctx.order_numero ?? ""} está confirmado 🖤`,
                 estado: "ORDER_CONFIRMED", contexto: { pagamento_status: "aprovado" } };
      }
      const { meioAtivo } = await import("../pagamento");
      if (meioAtivo().confirmacaoAutomatica) {
        return manter("Assim que o banco confirmar, o pedido confirma sozinho e eu te aviso aqui 🖤");
      }
      // PIX estático: alguém precisa olhar o extrato
      await executar("criar_tarefa", {
        titulo: `Conferir PIX do pedido ${ctx.order_numero ?? ""} — cliente diz que pagou`,
        prioridade: "urgente",
      }, amb);
      return manter("Recebi! Já vou conferir e te confirmo o pedido rapidinho 🖤");
    }

    if (intencao === "cancelar") {
      return { texto: fala.chamandoHumano, estado: "HUMAN", contexto: {},
               transferir: `cliente quer cancelar o pedido ${ctx.order_numero ?? ""}` };
    }
  }

  /* ---- endereço: o texto do cliente É o endereço ---- */

  if (estadoAtual === "ADDRESS" && !ctx.endereco_confirmado
      && intencao !== "cancelar" && intencao !== "alterar_pedido") {
    const lido = extrairEndereco(texto);
    const recusou = ehNao(texto) || /\b(outro|outra|novo|nova|diferente|mudei|mudou)\b/.test(t);

    if (ctx.endereco_sugerido_id && !lido) {
      if (SIM_CURTO.test(t) && !recusou) {
        const r = await executar("usar_endereco", { endereco_id: ctx.endereco_sugerido_id }, amb);
        if (r.ok) return irParaPagamento((r.dados as { linha: string }).linha, r.contexto ?? {});
      }
      if (recusou) return manter(fala.pedirEnderecoNovo, { endereco_sugerido_id: undefined });
    }

    // só faltava o bairro
    if (ctx.endereco_parcial && !lido) {
      const bairro = texto.trim().replace(/^bairro\s*:?\s*/i, "");
      if (/\p{L}{3,}/u.test(bairro) && bairro.length <= 60 && !/\d{3,}/.test(bairro)) {
        return cadastrarEndereco({ ...ctx.endereco_parcial, bairro });
      }
    }

    if (lido) {
      if (!lido.bairro) {
        return manter(fala.pedirBairro(lido.rua, lido.numero), {
          endereco_parcial: {
            rua: lido.rua, numero: lido.numero,
            complemento: lido.complemento, referencia: lido.referencia,
          },
          endereco_sugerido_id: undefined,
        });
      }
      return cadastrarEndereco(lido);
    }

    // não era endereço: produto segue o fluxo; pagamento espera o endereço
    const forma = formaNoTexto(t);
    if (forma) return manter(fala.enderecoAntesDoPagamento, { forma_pagamento: forma });
    if (!["modelo", "marca", "sabor", "catalogo", "preco", "estoque", "prazo_entrega"].includes(intencao)) {
      const ia = await tentarIa();
      if (ia) return ia;
      return manter(fala.naoLiEndereco);
    }
  }

  /* ---- pagamento, antes do pedido existir ---- */

  if (estadoAtual === "PAYMENT" && !ctx.order_id && ctx.endereco_confirmado) {
    // dinheiro: a pergunta pendente é o troco
    if (ctx.forma_pagamento === "dinheiro" && !ctx.troco_respondido) {
      const valor = valorEmReais(t);
      const semTroco = /\b(sem troco|nao precisa|nao preciso|certinho|trocado|exato)\b/.test(t) || ehNao(texto);
      if (!valor && !semTroco && SIM_CURTO.test(t)) {
        return manter("Pra quanto? Me fala o valor da nota que você vai usar.");
      }
      if (valor || semTroco) {
        const r = await executar("criar_pagamento",
          { forma: "dinheiro", ...(valor && !semTroco ? { troco_para: valor } : {}) },
          { ...amb, estado: "PAYMENT" });
        if (!r.ok) return manter(falarErro(r.erro, "Me fala o valor que você vai usar."));
        const troco = (r.dados as { troco: number }).troco;
        return resumir(fala.trocoAnotado(troco), r.contexto ?? {});
      }
    }

    const forma = formaNoTexto(t);
    if (forma) return escolherForma(forma);

    if (ctx.pagamento_sugerido) {
      if (SIM_CURTO.test(t)) return escolherForma(ctx.pagamento_sugerido);
      if (ehNao(texto)) return manter(fala.perguntarPagamento(formas), { pagamento_sugerido: undefined });
    }
  }

  if (estadoAtual === "ORDER_REVIEW" && ehNao(texto)) {
    return manter("Sem problema! O que você quer mudar?");
  }

  /* ---- preferência declarada: anota, e indica a partir dela ---- */

  const prefs = extrairPreferencias(texto, catalogo, Boolean(ctx.pref_perguntada));
  if (!semPreferencia(prefs)) {
    await executar("salvar_preferencias", {
      marcas: prefs.marcas.join(","), sabores: prefs.sabores.join(","),
      perfil: prefs.perfil.join(","), ...(prefs.puffs ? { puffs: prefs.puffs } : {}),
    }, amb);

    // quem já disse o produto segue comprando; quem só disse o gosto recebe indicação
    // "gosto de gelado" casa com sabor do catálogo que tem "gelado" no nome:
    // com perfil ou puffs declarados, é gosto, não escolha de produto
    const soNomes = !prefs.perfil.length && !prefs.puffs;
    const disseProduto = intencao === "modelo"
      || (soNomes && (intencao === "marca" || intencao === "sabor"));
    const escolhendo = ["INITIAL", "CATALOG_SENT", "PRODUCT_SELECTION"].includes(estadoAtual);

    if (!disseProduto && escolhendo) {
      const r = await executar("sugerir_produtos", {
        perfil: prefs.perfil.join(","), marca: prefs.marcas[0] ?? "",
        ...(prefs.puffs ? { puffs: prefs.puffs } : {}),
      }, amb);
      const modelos = (r.dados as { modelos?: Parameters<typeof fala.sugestoes>[0] })?.modelos ?? [];
      return {
        texto: fala.sugestoes(modelos, preferenciasEmTexto(prefs)),
        estado: "PRODUCT_SELECTION",
        // um modelo só: o próximo sabor dito já cai nele
        contexto: { pref_perguntada: undefined,
                    ...(modelos.length === 1 ? { modelo_interesse: modelos[0].produto } : {}) },
      };
    }
  }

  /* ---- "vai o mesmo?" respondido ---- */

  if (ctx.repetir_pedido_id
      && ["INITIAL", "CATALOG_SENT", "PRODUCT_SELECTION"].includes(estadoAtual)
      && (SIM_CURTO.test(t) || QUER_O_MESMO.test(t)) && !ehNao(texto)) {
    const r = await executarEm("repetir_ultimo_pedido", {}, "CART");
    if (r.ok) {
      const d = r.dados as {
        adicionados: Array<{ produto: string; sabor: string; quantidade: number }>;
        faltaram: string[];
      };
      return { texto: fala.repetido(d.adicionados, d.faltaram), estado: "CART",
               contexto: { ...r.contexto, repetir_pedido_id: undefined } };
    }
    return manter(`${falarErro(r.erro, "Não consegui separar o mesmo pedido.")} Quer ver o que tem?`,
                  { repetir_pedido_id: undefined });
  }

  switch (intencao) {
    case "saudacao": {
      if (conversa.ja_comprou) {
        const ultimo = (await perfil()).ultimoPedido;
        const disponiveis = ultimo?.itens.filter((i) => i.disponivel) ?? [];
        if (ultimo && disponiveis.length) {
          return manter(fala.ofertaRepetir(nome, disponiveis), { repetir_pedido_id: ultimo.id });
        }
      }
      return manter(fala.saudacao(nome, conversa.ja_comprou));
    }

    case "catalogo": {
      // "manda o catálogo" quer a lista inteira, não uma pergunta de volta.
      // O texto é montado agora, do estoque: sabor esgotado não aparece.
      if (ctx.product_flavor_id && estadoAtual === "CART") {
        return decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa, catalogo);
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
        return decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa, catalogo);
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
          { produto: ctx.modelo_interesse, sabor: saborNoTexto(texto, catalogo),
            quantidade: quantidadeNoTexto(texto) ?? 1 }, "CART");

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

      // sem modelo em vista: o sabor diz qual é, ou em quais ele existe
      const procurado = saborNoTexto(texto, catalogo);
      const r = await executar("modelos_com_sabor", { sabor: procurado }, amb);
      const ms = r.dados as { sabor: string | null; modelos: Array<{ produto: string; preco: number }> };

      if (ms.modelos.length === 1) {
        const add = await executarEm("adicionar_carrinho",
          { produto: ms.modelos[0].produto, sabor: ms.sabor!,
            quantidade: quantidadeNoTexto(texto) ?? 1 }, "CART");
        if (add.ok) {
          const dd = add.dados as { produto: string; sabor: string; quantidade: number; preco: number };
          return { texto: fala.itemAdicionado(dd.produto, dd.sabor, dd.quantidade, dd.preco),
                   estado: "CART", contexto: add.contexto ?? {} };
        }
        return manter(falarErro(add.erro, fala.semEstoque(ms.sabor!)));
      }
      if (ms.modelos.length > 1) {
        return manter(fala.saborEmModelos(ms.sabor!, ms.modelos), { sabor_procurado: ms.sabor! });
      }

      return decidir("modelo" as Intencao, texto, amb, nome, conversa, catalogo);
    }

    case "modelo": {
      const r = await executar("buscar_sabores", { produto: texto }, amb);
      const d = r.dados as Parameters<typeof fala.listarSabores>[0] & { produto: string | null };
      if (!d.produto) {
        const ia = await tentarIa();
        if (ia) return ia;

        const marcas = await executar("buscar_marcas", {}, amb);
        const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
        return manter(fala.listarMarcas(lista, nome));
      }

      // o cliente já disse o sabor junto com o modelo? então já reserva
      const saborPedido = d.sabores.find((s) =>
        texto.toLowerCase().includes(s.nome.toLowerCase())
        || (ctx.sabor_procurado && s.nome === ctx.sabor_procurado));

      if (saborPedido) {
        const add = await executarEm("adicionar_carrinho",
          { produto: d.produto, sabor: saborPedido.nome,
            quantidade: quantidadeNoTexto(texto) ?? 1 }, "CART");
        if (add.ok) {
          const dd = add.dados as { produto: string; sabor: string; quantidade: number; preco: number };
          return {
            texto: fala.itemAdicionado(dd.produto, dd.sabor, dd.quantidade, dd.preco),
            estado: "CART",
            contexto: { ...add.contexto, sabor_procurado: undefined },
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
        // "quanto sai a entrega?" cai aqui, e listar marcas não responde
        const ia = await tentarIa();
        if (ia) return ia;

        const marcas = await executar("buscar_marcas", {}, amb);
        const lista = (marcas.dados as { marcas: string[] })?.marcas ?? [];
        return manter(fala.listarMarcas(lista, nome));
      }
      return manter(`${d.produto} sai por R$ ${Number(d.preco).toFixed(2).replace(".", ",")}. Quer ver os sabores?`);
    }

    case "endereco": {
      // endereço dito ainda no carrinho: fecha o carrinho e segue para ele
      if (ctx.cart_id && estadoAtual === "CART") {
        return decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa, catalogo);
      }
      return manter("Vamos escolher os produtos primeiro? Depois eu anoto o endereço 🛵");
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

      return pedirEnderecoAntes(fala.resumoCarrinho(d));
    }

    case "pix": case "dinheiro": case "troco": case "pagamento": {
      const forma = formaNoTexto(t);
      if (!ctx.cart_id) return manter("Vamos escolher os produtos primeiro?");

      // ainda no carrinho: guarda a forma e fecha; o endereço vem antes
      if (!ctx.endereco_confirmado) {
        if (estadoAtual === "CART") {
          const d = await decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa, catalogo);
          return { ...d, contexto: { ...d.contexto, ...(forma ? { forma_pagamento: forma } : {}) } };
        }
        return manter(fala.enderecoAntesDoPagamento, forma ? { forma_pagamento: forma } : {});
      }

      // trocando a forma depois do resumo
      if (forma) return escolherForma(forma);
      return { texto: fala.perguntarPagamento(formas), estado: "PAYMENT", contexto: {} };
    }

    case "confirmar": {
      // "fechou", "ok" com o carrinho aberto é fechar o carrinho
      if (estadoAtual === "CART" && ctx.cart_id) {
        return decidir("fechar_carrinho" as Intencao, texto, amb, nome, conversa, catalogo);
      }

      if (estadoAtual !== "ORDER_REVIEW") {
        if (!ctx.cart_id) return manter("Vamos escolher os produtos primeiro?");
        if (!ctx.endereco_confirmado) return pedirEnderecoAntes("");
        if (!ctx.forma_pagamento) {
          return { texto: fala.perguntarPagamento(formas), estado: "PAYMENT", contexto: {} };
        }
        return resumir("", {});
      }

      const r = await executarEm("confirmar_pedido", {}, "ORDER_REVIEW");
      if (!r.ok) return manter(falarErro(r.erro, "Ainda falta algo para fechar o pedido."));
      const d = r.dados as {
        numero: string; total: number; forma: string;
        pix: { chave: string | null; copiaECola: string | null; link: string | null } | null;
      };

      // PIX: o pedido existe, o estoque está reservado, falta o dinheiro
      if (d.forma === "pix") {
        return { texto: fala.pedidoAguardandoPix(d.numero, d.total, d.pix),
                 estado: "PAYMENT", contexto: r.contexto ?? {} };
      }
      return { texto: fala.pedidoConfirmado(d.numero, nome),
               estado: "ORDER_CONFIRMED", contexto: r.contexto ?? {} };
    }

    case "prazo_entrega":
      return manter(fala.prazoEntrega(cfg.entrega.prazo_minutos || 45));

    case "estoque": {
      const r = await executar("buscar_sabores", { produto: texto }, amb);
      const d = r.dados as Parameters<typeof fala.listarSabores>[0] & { produto: string | null };
      if (!d.produto) {
        // a regra de palavra-chave manda qualquer "tem ..." para cá
        const ia = await tentarIa();
        if (ia) return ia;
        return manter("Me fala qual modelo que eu confiro pra você.");
      }
      return manter(fala.listarSabores(d, nome), r.contexto ?? {});
    }

    case "cancelar":
      return { texto: "Sem problema! Se mudar de ideia é só chamar 🖤",
               estado: "ABANDONED", contexto: {} };

    case "alterar_pedido":
      return manter("Claro! O que você quer mudar no pedido?");

    default: {
      /**
       * O que a palavra-chave não resolveu.
       *
       * É aqui, e só aqui, que a IA entra — como o comentário em
       * intencoes.ts sempre dizia. Todo o resto do fluxo continua
       * determinístico, e por isso continua previsível.
       *
       * Se a IA não estiver ligada, falhar, demorar ou escrever algo que o
       * conferidor recusa, o caminho abaixo é o mesmo de antes: conta a
       * falha e na terceira chama gente. Nada depende de ela funcionar.
       */
      const ia = await tentarIa();
      if (ia) return ia;

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
  /** tag gravada quando o cliente disse a idade e ela é menor de 18 */
  declarou_menor: boolean;
}

const TAG_MENOR = "menor de idade";

/** Fica no cadastro: a recusa vale para as próximas conversas também. */
async function marcarMenor(customerId: string | null) {
  if (!customerId) return;
  const c = await clienteDoSistema();
  if (!c) return;
  const { data } = await c.from("customers").select("tags").eq("id", customerId).maybeSingle();
  const tags = (data?.tags as string[] | null) ?? [];
  if (tags.includes(TAG_MENOR)) return;
  await c.from("customers").update({ tags: [...tags, TAG_MENOR] }).eq("id", customerId);
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
      declarou_menor: (cliente?.tags ?? []).includes(TAG_MENOR),
    };
  }

  const { data } = await c.from("conversations")
    .select("customer_id, estado, bot_ativo, contexto, customers(nome, maioridade_validada, total_pedidos, tags)")
    .eq("id", id).maybeSingle();
  if (!data) return null;

  const cliente = data.customers as {
    nome?: string; maioridade_validada?: boolean; total_pedidos?: number; tags?: string[];
  } | null;

  return {
    customer_id: data.customer_id as string | null,
    cliente_nome: cliente?.nome ?? null,
    estado: data.estado as ConversaEstado,
    bot_ativo: data.bot_ativo as boolean,
    contexto: (data.contexto ?? {}) as Contexto,
    maioridade_validada: cliente?.maioridade_validada ?? false,
    ja_comprou: (cliente?.total_pedidos ?? 0) > 0,
    declarou_menor: (cliente?.tags ?? []).includes(TAG_MENOR),
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
  // a mesma leitura que as ferramentas usam, reaproveitada
  const itens = await lerCatalogo();
  return {
    marcas: [...new Set(itens.map((i) => String(i.marca ?? "")).filter(Boolean))],
    modelos: [...new Set(itens.map((i) => String(i.produto ?? "")).filter(Boolean))],
    sabores: [...new Set(itens.map((i) => String(i.sabor ?? "")).filter(Boolean))],
  };
}

async function dentroDoHorario(): Promise<boolean> {
  if (!(await clienteDoSistema())) return true;
  const { horario_inicio, horario_fim } = (await lerConfiguracoesDoSistema()).atendimento;
  if (!horario_inicio || !horario_fim) return true;

  const agora = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
  return agora >= horario_inicio && agora <= horario_fim;
}

async function horarioDeAbertura(): Promise<string> {
  if (!(await clienteDoSistema())) return "10h";
  return (await lerConfiguracoesDoSistema()).atendimento.horario_inicio || "10h";
}
