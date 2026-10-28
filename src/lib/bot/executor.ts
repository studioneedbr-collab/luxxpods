import "server-only";
import { clienteDoSistema } from "../supabase/sistema";
import { STORE_ID } from "../supabase/config";
import { demo } from "../demo";
import { validarChamada } from "./ferramentas";
import type { Contexto } from "./estados";
import type { ItemCatalogo } from "../types";
import { escolherOferta, type RegraAplicavel } from "./upsell";
import { enderecoEmLinha, saborCombina, type PerfilSabor } from "./extrair";
import type { FormaPagamento } from "./estados";

/**
 * O corpo das ferramentas.
 *
 * Aqui é onde o bot toca o sistema — e o único lugar. Preço, sabor e estoque
 * saem SEMPRE de uma consulta, nunca do texto que o modelo escreveu: é o que
 * impede o bot de vender o que não existe pelo preço que inventou.
 */

export interface Ambiente {
  conversationId: string;
  customerId: string | null;
  estado: string;
  contexto: Contexto;
}

export interface Saida {
  ok: boolean;
  /** o que a ferramenta descobriu, para o motor montar a resposta */
  dados?: unknown;
  erro?: string;
  /** mudanças a gravar no contexto da conversa */
  contexto?: Partial<Contexto>;
}

const semAcento = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* ------------------------------------------------------------- CATÁLOGO -- */

async function lerCatalogo(): Promise<ItemCatalogo[]> {
  const c = await clienteDoSistema();
  if (!c) return demo().catalogo;

  const { data, error } = await c.from("v_catalogo")
    .select("*").eq("store_id", STORE_ID);
  if (error) throw new Error(`catálogo indisponível: ${error.message}`);
  return (data ?? []) as unknown as ItemCatalogo[];
}

/** Só o que dá para vender agora — o resto o bot nem menciona. */
const vendaveis = (c: ItemCatalogo[]) => c.filter((x) => x.vendavel);

function acharProduto(catalogo: ItemCatalogo[], termo: string) {
  const t = semAcento(termo);
  const candidatos = vendaveis(catalogo).filter((c) =>
    semAcento(c.produto).includes(t) ||
    semAcento(c.modelo ?? "").includes(t) ||
    t.includes(semAcento(c.modelo ?? "___")));
  return candidatos;
}

/** "cartao" sozinho vira crédito: na maquininha da entrega tanto faz. */
function normalizarForma(bruto: unknown): FormaPagamento {
  const f = semAcento(String(bruto ?? ""));
  if (f.startsWith("cartao_deb") || f.includes("debito")) return "cartao_debito";
  if (f.startsWith("cartao") || f.includes("credito")) return "cartao_credito";
  return f === "dinheiro" ? "dinheiro" : "pix";
}

const lista = (v: unknown) =>
  String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Item novo no carrinho é compra nova: o pedido anterior sai do contexto.
 * Sem isto o PIX da compra seguinte saía com o valor e o número do pedido
 * antigo, que ainda estava guardado na conversa.
 */
const COMPRA_NOVA: Partial<Contexto> = {
  order_id: undefined, order_numero: undefined, pagamento_status: undefined,
};

/* --------------------------------------------------------------- PERFIL -- */

export interface PerfilDoCliente {
  declarado: { marcas: string[]; sabores: string[]; perfil: string[]; puffs: number | null };
  deduzido: {
    marca: string | null; produto: string | null; sabor: string | null;
    puffs: number | null; forma: FormaPagamento | null;
  };
  ultimoPedido: {
    id: string; numero: string;
    itens: Array<{ produto: string; sabor: string; quantidade: number; disponivel: boolean }>;
  } | null;
  endereco: { id: string; linha: string } | null;
  jaComprou: boolean;
}

const PERFIL_VAZIO: PerfilDoCliente = {
  declarado: { marcas: [], sabores: [], perfil: [], puffs: null },
  deduzido: { marca: null, produto: null, sabor: null, puffs: null, forma: null },
  ultimoPedido: null, endereco: null, jaComprou: false,
};

/**
 * Tudo o que se sabe de quem está do outro lado.
 *
 * Tolerante de propósito: sem a migração 0017 aplicada, as colunas de
 * preferência e a view não existem — o perfil volta só com o que dá, e o bot
 * segue vendendo em vez de quebrar a conversa inteira.
 */
export async function lerPerfil(customerId: string | null): Promise<PerfilDoCliente> {
  if (!customerId) return PERFIL_VAZIO;
  const c = await clienteDoSistema();
  if (!c) return PERFIL_VAZIO;

  const perfil: PerfilDoCliente = structuredClone(PERFIL_VAZIO);

  const { data: pref } = await c.from("customers")
    .select("pref_marcas, pref_sabores, pref_perfil_sabor, pref_puffs")
    .eq("id", customerId).maybeSingle();
  if (pref) {
    perfil.declarado = {
      marcas: (pref.pref_marcas as string[]) ?? [],
      sabores: (pref.pref_sabores as string[]) ?? [],
      perfil: (pref.pref_perfil_sabor as string[]) ?? [],
      puffs: (pref.pref_puffs as number | null) ?? null,
    };
  }

  const { data: v } = await c.from("v_perfil_cliente")
    .select("*").eq("customer_id", customerId).maybeSingle();

  let ultimoId = (v?.ultimo_pedido_id as string | null) ?? null;
  if (v) {
    perfil.deduzido = {
      marca: v.marca_mais_comprada ?? null,
      produto: v.produto_mais_comprado ?? null,
      sabor: v.sabor_mais_comprado ?? null,
      puffs: v.puffs_medio ?? null,
      forma: v.forma_pagamento_habitual ?? null,
    };
  } else {
    // sem a view: o último pedido sai direto da tabela
    const { data: o } = await c.from("orders").select("id")
      .eq("customer_id", customerId).neq("status_pedido", "cancelado")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    ultimoId = (o?.id as string | undefined) ?? null;
  }

  if (ultimoId) {
    perfil.jaComprou = true;
    const { data: pedido } = await c.from("orders")
      .select("id, numero_pedido, address_id, order_items(produto_nome, sabor_nome, quantidade, product_flavor_id)")
      .eq("id", ultimoId).maybeSingle();

    if (pedido) {
      const catalogo = await lerCatalogo();
      const itens = ((pedido.order_items as Array<Record<string, unknown>>) ?? []).map((i) => {
        const item = catalogo.find((x) => x.product_flavor_id === i.product_flavor_id);
        return {
          produto: String(i.produto_nome ?? ""), sabor: String(i.sabor_nome ?? ""),
          quantidade: Number(i.quantidade ?? 1),
          disponivel: Boolean(item?.vendavel && item.estoque_disponivel >= Number(i.quantidade ?? 1)),
        };
      });
      perfil.ultimoPedido = { id: String(pedido.id), numero: String(pedido.numero_pedido), itens };
    }
  }

  // o endereço do último pedido, senão o principal
  const enderecoPreferido = (v?.ultimo_endereco_id as string | null) ?? null;
  const { data: enderecos } = await c.from("customer_addresses")
    .select("id, rua, numero, bairro, complemento, referencia, principal")
    .eq("customer_id", customerId).order("principal", { ascending: false });
  const escolhido = (enderecos ?? []).find((e) => e.id === enderecoPreferido) ?? enderecos?.[0];
  if (escolhido) perfil.endereco = { id: escolhido.id, linha: enderecoEmLinha(escolhido) };

  return perfil;
}

/**
 * Cobra o PIX de um pedido que JÁ EXISTE.
 *
 * Antes a cobrança saía antes do pedido: o gateway exige o pedido, e o pedido
 * só nascia com o PIX aprovado — cada um esperando o outro, e nada marcava o
 * pagamento como aprovado na conversa. O cliente pagava e o pedido nunca
 * era criado.
 */
async function cobrarPix(orderId: string, numero: string | undefined, total: number) {
  const { meioAtivo } = await import("../pagamento");
  const meio = meioAtivo();

  if (meio.confirmacaoAutomatica && orderId !== "demo") {
    const { gerarCobranca } = await import("../pix/cobranca");
    const r = await gerarCobranca(orderId, "sistema");
    if (r.ok && (r.cobranca?.copiaECola || r.cobranca?.link)) {
      return {
        chave: null, copiaECola: r.cobranca.copiaECola || null,
        link: r.cobranca.link ?? null, automatico: true,
      };
    }
    // gateway fora do ar não pode travar a venda: cai no estático
    console.error(`[luxx] a cobrança pelo gateway falhou, usando PIX estático: ${r.erro}`);
  }

  // a versão do sistema: o bot não tem sessão, e a de sessão devolvia a
  // configuração padrão — sem chave PIX
  // (sem banco, a demonstração guarda a configuração em memória, que só a
  // leitura do painel enxerga)
  const config = (await clienteDoSistema())
    ? await (await import("../configuracoes-sistema")).lerConfiguracoesDoSistema()
    : await (await import("../actions-config")).lerConfiguracoes();
  const chave = config.pagamentos.chave_pix;
  if (!chave) return { chave: null, copiaECola: null, link: null, automatico: false };

  const { gerarBrCode } = await import("../pix/brcode");
  let copiaECola: string | null = null;
  try {
    copiaECola = gerarBrCode({
      chave,
      nome: config.empresa.nome,
      cidade: config.empresa.endereco.split("-")[0].trim(),
      valor: total,
      // o número do pedido viaja no PIX e volta no comprovante
      identificador: numero ?? undefined,
    });
  } catch {
    copiaECola = null;   // chave malformada: cai para o texto sem código
  }
  return { chave, copiaECola, link: null, automatico: false };
}

/* ------------------------------------------------------------- EXECUÇÃO -- */

export async function executar(
  nome: string,
  argumentos: Record<string, unknown>,
  ambiente: Ambiente,
): Promise<Saida> {
  const validacao = validarChamada(nome, argumentos, ambiente.estado);
  if (!validacao.valida) return { ok: false, erro: validacao.erro };

  try {
    return await despachar(nome, argumentos, ambiente);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falha ao executar";
    console.error(`[luxx] ferramenta ${nome} falhou:`, e);
    return { ok: false, erro };
  }
}

async function despachar(
  nome: string,
  a: Record<string, unknown>,
  amb: Ambiente,
): Promise<Saida> {
  switch (nome) {
    /* ------------------------------------------------------ consultas -- */

    case "buscar_marcas": {
      const catalogo = await lerCatalogo();
      const marcas = [...new Set(vendaveis(catalogo).map((c) => c.marca).filter(Boolean))];
      return { ok: true, dados: { marcas } };
    }

    case "buscar_modelos": {
      const catalogo = await lerCatalogo();
      const marca = semAcento(String(a.marca));
      const daMarca = vendaveis(catalogo).filter((c) => semAcento(c.marca ?? "") === marca);

      if (daMarca.length === 0) {
        const outras = [...new Set(vendaveis(catalogo).map((c) => c.marca))];
        return { ok: true, dados: { modelos: [], marcasDisponiveis: outras } };
      }

      const porModelo = new Map<string, { produto: string; preco: number; sabores: number; puffs: number | null }>();
      daMarca.forEach((c) => {
        const atual = porModelo.get(c.produto);
        if (atual) atual.sabores += 1;
        else porModelo.set(c.produto, {
          produto: c.produto, preco: c.preco, sabores: 1, puffs: c.puffs,
        });
      });

      return {
        ok: true,
        dados: { modelos: [...porModelo.values()] },
        contexto: { marca_interesse: String(a.marca) },
      };
    }

    case "buscar_sabores": {
      const catalogo = await lerCatalogo();
      const achados = acharProduto(catalogo, String(a.produto));

      if (achados.length === 0) {
        return { ok: true, dados: { sabores: [], produto: null } };
      }

      // quando o termo casa com mais de um modelo, devolve o primeiro e
      // avisa: perguntar de novo é melhor que adivinhar
      const produto = achados[0].produto;
      const doProduto = achados.filter((c) => c.produto === produto);
      const outrosModelos = [...new Set(achados.map((c) => c.produto))].filter((p) => p !== produto);

      return {
        ok: true,
        dados: {
          produto,
          preco: doProduto[0].preco,
          puffs: doProduto[0].puffs,
          sabores: doProduto.map((c) => ({
            nome: c.sabor,
            disponivel: c.estoque_disponivel,
            ultimas: c.estoque_disponivel <= 2,
          })),
          outrosModelos,
        },
        contexto: { modelo_interesse: produto },
      };
    }

    /** O cliente disse só o sabor: em quais modelos ele existe agora? */
    case "modelos_com_sabor": {
      const catalogo = vendaveis(await lerCatalogo()).filter((x) => x.estoque_disponivel > 0);
      const termo = semAcento(String(a.sabor));
      const achados = catalogo.filter((x) => semAcento(x.sabor) === termo);
      return {
        ok: true,
        dados: {
          sabor: achados[0]?.sabor ?? null,
          modelos: achados.map((x) => ({ produto: x.produto, preco: x.preco, puffs: x.puffs })),
        },
      };
    }

    case "consultar_estoque": {
      const catalogo = await lerCatalogo();
      const item = catalogo.find((c) =>
        semAcento(c.produto).includes(semAcento(String(a.produto))) &&
        semAcento(c.sabor) === semAcento(String(a.sabor)));

      if (!item) return { ok: true, dados: { existe: false } };
      return {
        ok: true,
        dados: {
          existe: true,
          disponivel: item.estoque_disponivel,
          vendavel: item.vendavel,
          preco: item.preco,
        },
      };
    }

    case "consultar_preco": {
      const catalogo = await lerCatalogo();
      const achados = acharProduto(catalogo, String(a.produto));
      if (achados.length === 0) return { ok: true, dados: { encontrado: false } };

      // o preço vem do que está vendável. Cotar o preço de algo esgotado
      // leva o cliente a pedir e descobrir depois que não tem — pior que
      // dizer na hora que acabou.
      const comEstoque = achados.filter((x) => x.vendavel && x.estoque_disponivel > 0);
      const base = comEstoque[0] ?? achados[0];

      return {
        ok: true,
        dados: {
          encontrado: true,
          produto: base.produto,
          // o menor preço entre os sabores com estoque
          preco: comEstoque.length
            ? Math.min(...comEstoque.map((x) => x.preco))
            : base.preco,
          disponivel: comEstoque.length > 0,
          sabores_disponiveis: comEstoque.length,
        },
      };
    }

    /* -------------------------------------------------------- carrinho -- */

    case "adicionar_carrinho": {
      const catalogo = await lerCatalogo();
      const item = catalogo.find((c) =>
        semAcento(c.produto).includes(semAcento(String(a.produto))) &&
        semAcento(c.sabor) === semAcento(String(a.sabor)));

      if (!item) return { ok: false, erro: "Não achei esse produto com esse sabor." };
      if (!item.vendavel) {
        return { ok: false, erro: `${item.sabor} está esgotado no momento.` };
      }

      const quantidade = Number(a.quantidade);
      if (item.estoque_disponivel < quantidade) {
        return {
          ok: false,
          erro: `Só tenho ${item.estoque_disponivel} unidade(s) de ${item.sabor} agora.`,
        };
      }

      const c = await clienteDoSistema();

      if (c) {
        const { data: cart, error: erroCarrinho } = await c.rpc("abrir_carrinho", {
          p_conversation_id: amb.conversationId,
          p_customer_id: amb.customerId,
          p_store_id: STORE_ID,
        });
        if (erroCarrinho) return { ok: false, erro: erroCarrinho.message };

        const { error } = await c.rpc("adicionar_ao_carrinho", {
          p_cart_id: cart.id,
          p_product_flavor_id: item.product_flavor_id,
          p_quantidade: quantidade,
        });
        if (error) return { ok: false, erro: error.message };

        return {
          ok: true,
          dados: { produto: item.produto, sabor: item.sabor, quantidade, preco: item.preco },
          contexto: {
            cart_id: cart.id,
            product_flavor_id: item.product_flavor_id,
            produto_selecionado: item.produto,
            sabor_selecionado: item.sabor,
            quantidade,
            ...COMPRA_NOVA,
          },
        };
      }

      // demonstração: guarda no contexto, sem reserva no banco
      return {
        ok: true,
        dados: { produto: item.produto, sabor: item.sabor, quantidade, preco: item.preco },
        contexto: {
          cart_id: `cart-demo-${amb.conversationId}`,
          product_flavor_id: item.product_flavor_id,
          produto_selecionado: item.produto,
          sabor_selecionado: item.sabor,
          quantidade,
          ...COMPRA_NOVA,
        },
      };
    }

    case "consultar_carrinho": {
      const c = await clienteDoSistema();

      if (!c || !amb.contexto.cart_id) {
        const ctx = amb.contexto;
        if (!ctx.produto_selecionado) return { ok: true, dados: { vazio: true } };
        const catalogo = await lerCatalogo();
        const item = catalogo.find((x) => x.product_flavor_id === ctx.product_flavor_id);
        const qtd = ctx.quantidade ?? 1;
        const subtotal = (item?.preco ?? 0) * qtd;
        return {
          ok: true,
          dados: {
            vazio: false,
            itens: [{ produto: ctx.produto_selecionado, sabor: ctx.sabor_selecionado, quantidade: qtd, subtotal }],
            subtotal, entrega: subtotal >= 150 ? 0 : 5,
            total: subtotal + (subtotal >= 150 ? 0 : 5),
          },
        };
      }

      const { data: cart } = await c.from("carts")
        .select("subtotal, entrega, desconto, total, cart_items(quantidade, preco_unitario, subtotal, product_flavors(products(nome), flavors(nome)))")
        .eq("id", amb.contexto.cart_id).maybeSingle();

      if (!cart) return { ok: true, dados: { vazio: true } };

      const itens = (cart.cart_items as Array<Record<string, unknown>> ?? []).map((i) => {
        const pf = i.product_flavors as { products?: { nome?: string }; flavors?: { nome?: string } };
        return {
          produto: pf?.products?.nome, sabor: pf?.flavors?.nome,
          quantidade: i.quantidade, subtotal: i.subtotal,
        };
      });

      return {
        ok: true,
        dados: {
          vazio: itens.length === 0, itens,
          subtotal: cart.subtotal, entrega: cart.entrega,
          desconto: cart.desconto, total: cart.total,
        },
      };
    }

    /* -------------------------------------------------------- endereço -- */

    case "buscar_enderecos": {
      if (!amb.customerId) return { ok: true, dados: { enderecos: [] } };
      const c = await clienteDoSistema();
      if (!c) return { ok: true, dados: { enderecos: [] } };

      const { data } = await c.from("customer_addresses")
        .select("id, rua, numero, bairro, complemento, referencia, principal")
        .eq("customer_id", amb.customerId)
        .order("principal", { ascending: false });

      return { ok: true, dados: { enderecos: data ?? [] } };
    }

    case "cadastrar_endereco": {
      if (!amb.customerId) return { ok: false, erro: "Cliente ainda não identificado." };
      const c = await clienteDoSistema();

      const endereco = {
        bairro: String(a.bairro), rua: String(a.rua), numero: String(a.numero),
        complemento: a.complemento ? String(a.complemento) : null,
        referencia: a.referencia ? String(a.referencia) : null,
      };

      if (!c) {
        return { ok: true, dados: endereco, contexto: { endereco_confirmado: true } };
      }

      // o mesmo endereço digitado de novo não vira um segundo cadastro
      const { data: existentes } = await c.from("customer_addresses")
        .select("id, rua, numero").eq("customer_id", amb.customerId);
      const igual = (existentes ?? []).find((e) =>
        semAcento(e.rua ?? "") === semAcento(endereco.rua)
        && semAcento(e.numero ?? "") === semAcento(endereco.numero));

      let id = igual?.id as string | undefined;
      if (igual) {
        await c.from("customer_addresses").update({ ...endereco }).eq("id", igual.id);
      } else {
        const { data, error } = await c.from("customer_addresses")
          .insert({ customer_id: amb.customerId, ...endereco, principal: true })
          .select("id").single();
        if (error) return { ok: false, erro: error.message };
        id = data.id;
      }

      // o último usado passa a ser o principal, que é o oferecido da próxima vez
      await c.from("customer_addresses").update({ principal: false })
        .eq("customer_id", amb.customerId).neq("id", id!);
      await c.from("customer_addresses").update({ principal: true }).eq("id", id!);

      return {
        ok: true, dados: { ...endereco, id, linha: enderecoEmLinha(endereco) },
        contexto: { endereco_id: id, endereco_confirmado: true, endereco_parcial: undefined },
      };
    }

    case "usar_endereco": {
      if (!amb.customerId) return { ok: false, erro: "Cliente ainda não identificado." };
      const c = await clienteDoSistema();
      if (!c) {
        return { ok: true, dados: { id: a.endereco_id }, contexto: { endereco_confirmado: true } };
      }

      // só um endereço DESTE cliente: o id vem do modelo, não é confiável
      const { data } = await c.from("customer_addresses")
        .select("id, rua, numero, bairro, complemento, referencia")
        .eq("id", String(a.endereco_id)).eq("customer_id", amb.customerId).maybeSingle();
      if (!data) return { ok: false, erro: "Não achei esse endereço no cadastro do cliente." };

      return {
        ok: true, dados: { id: data.id, linha: enderecoEmLinha(data) },
        contexto: {
          endereco_id: data.id, endereco_confirmado: true, endereco_sugerido_id: undefined,
        },
      };
    }

    case "calcular_entrega": {
      const c = await clienteDoSistema();
      let taxa = 5, gratisAcima = 150;

      if (c) {
        const { data } = await c.from("settings")
          .select("valor").eq("store_id", STORE_ID).eq("chave", "entrega").maybeSingle();
        const cfg = data?.valor as { taxa_padrao?: number; taxa_gratis_acima?: number } | undefined;
        taxa = cfg?.taxa_padrao ?? 5;
        gratisAcima = cfg?.taxa_gratis_acima ?? 150;
      }

      return { ok: true, dados: { taxa, gratisAcima } };
    }

    /* ------------------------------------------------------- pagamento -- */

    case "criar_pagamento": {
      const forma = normalizarForma(a.forma);
      const trocoPara = a.troco_para != null ? Number(a.troco_para) : null;
      const c = await clienteDoSistema();

      // com o pedido criado, o total é o dele; antes, o do carrinho
      let total: number;
      if (amb.contexto.order_id && c && amb.contexto.order_id !== "demo") {
        const { data: pedido } = await c.from("orders")
          .select("total").eq("id", amb.contexto.order_id).maybeSingle();
        total = Number(pedido?.total ?? 0);
      } else {
        const carrinho = await despachar("consultar_carrinho", {}, amb);
        const dados = carrinho.dados as { total?: number; vazio?: boolean } | undefined;
        if (!dados || dados.vazio) return { ok: false, erro: "O carrinho está vazio." };
        total = Number(dados.total ?? 0);
      }

      if (forma === "dinheiro" && trocoPara != null && trocoPara < total) {
        return {
          ok: false,
          erro: `O valor informado é menor que o total de R$ ${total.toFixed(2).replace(".", ",")}.`,
        };
      }

      if (forma === "pix") {
        // o código só existe para um pedido: antes da confirmação, só anota
        if (!amb.contexto.order_id) {
          return {
            ok: true,
            dados: { forma, total, codigo_sai_apos_confirmar: true },
            contexto: { forma_pagamento: "pix", troco_para: undefined },
          };
        }
        const pix = await cobrarPix(amb.contexto.order_id, amb.contexto.order_numero, total);
        return {
          ok: true,
          dados: { forma, total, ...pix },
          contexto: { forma_pagamento: "pix", pagamento_status: "aguardando" },
        };
      }

      if (forma === "dinheiro") {
        return {
          ok: true,
          dados: { forma, total, troco: trocoPara ? trocoPara - total : 0 },
          contexto: {
            forma_pagamento: "dinheiro",
            troco_para: trocoPara ?? undefined,
            troco_respondido: true,
          },
        };
      }

      // cartão: paga na maquininha, na entrega
      return {
        ok: true,
        dados: { forma, total },
        contexto: { forma_pagamento: forma, troco_para: undefined },
      };
    }

    case "consultar_pagamento": {
      const c = await clienteDoSistema();
      if (!c || !amb.contexto.order_id) {
        return { ok: true, dados: { status: amb.contexto.pagamento_status ?? "aguardando" } };
      }

      const { data } = await c.from("orders")
        .select("status_pagamento").eq("id", amb.contexto.order_id).maybeSingle();
      return { ok: true, dados: { status: data?.status_pagamento ?? "aguardando" } };
    }

    /* ---------------------------------------------------------- pedido -- */

    case "resumir_pedido": {
      const carrinho = await despachar("consultar_carrinho", {}, amb);

      // o cliente confere ONDE vai receber, não só o quê
      let endereco: string | null = null;
      const c = await clienteDoSistema();
      if (c && amb.contexto.endereco_id) {
        const { data } = await c.from("customer_addresses")
          .select("rua, numero, bairro, complemento, referencia")
          .eq("id", amb.contexto.endereco_id).maybeSingle();
        if (data) endereco = enderecoEmLinha(data);
      }

      return {
        ok: true,
        dados: {
          ...(carrinho.dados as object),
          forma_pagamento: amb.contexto.forma_pagamento,
          troco_para: amb.contexto.troco_para,
          endereco_confirmado: amb.contexto.endereco_confirmado,
          endereco,
        },
      };
    }

    case "confirmar_pedido": {
      const ctx = amb.contexto;
      const c = await clienteDoSistema();

      if (!ctx.cart_id) return { ok: false, erro: "Não há carrinho para fechar." };
      // no banco, "confirmado" sem id era o pedido nascendo sem endereço
      if (!ctx.endereco_confirmado || (c && !ctx.endereco_id)) {
        return { ok: false, erro: "Falta confirmar o endereço." };
      }
      if (!ctx.forma_pagamento) return { ok: false, erro: "Falta escolher a forma de pagamento." };

      const forma = normalizarForma(ctx.forma_pagamento);

      // o carrinho virou pedido: a próxima compra começa do zero
      const limpar = {
        cart_id: undefined, product_flavor_id: undefined, produto_selecionado: undefined,
        sabor_selecionado: undefined, quantidade: undefined, endereco_confirmado: undefined,
        endereco_sugerido_id: undefined, troco_respondido: undefined,
        upsell_pendente: undefined, repetir_pedido_id: undefined,
      };

      if (!c) {
        const numero = `LX-${new Date().getFullYear()}-DEMO`;
        const carrinho = await despachar("consultar_carrinho", {}, amb);
        const total = Number((carrinho.dados as { total?: number })?.total ?? 0);
        const pix = forma === "pix" ? await cobrarPix("demo", numero, total) : null;
        return {
          ok: true,
          dados: { numero, total, forma, pix },
          contexto: {
            ...limpar, order_id: "demo", order_numero: numero,
            pagamento_status: forma === "pix" ? "aguardando" : undefined,
          },
        };
      }

      // PIX nasce aguardando pagamento, com o estoque reservado: quem baixa o
      // estoque é a confirmação, quando o dinheiro entrar (webhook ou baixa
      // manual). Dinheiro confirma na própria criação.
      const { data, error } = await c.rpc("criar_pedido", {
        p_cart_id: ctx.cart_id,
        p_address_id: ctx.endereco_id ?? null,
        p_forma_pagamento: forma,
        p_troco_para: forma === "dinheiro" ? ctx.troco_para ?? null : null,
        p_observacoes: null,
        p_atendente_id: null,
        p_origem: "bot",
      });
      if (error) return { ok: false, erro: error.message };

      // cartão é pago na entrega, como o dinheiro: o pedido segue confirmado
      if (forma === "cartao_credito" || forma === "cartao_debito") {
        const { error: erroConfirmacao } = await c.rpc("confirmar_pedido", { p_order_id: data.id });
        if (erroConfirmacao) {
          console.error(`[luxx] pedido ${data.numero_pedido} criado mas não confirmou: ${erroConfirmacao.message}`);
        }
      }

      const pix = forma === "pix"
        ? await cobrarPix(data.id, data.numero_pedido, Number(data.total))
        : null;

      return {
        ok: true,
        dados: { numero: data.numero_pedido, total: Number(data.total), forma, pix },
        contexto: {
          ...limpar, order_id: data.id, order_numero: data.numero_pedido,
          pagamento_status: forma === "pix" ? "aguardando" : undefined,
        },
      };
    }

    case "consultar_pedido": {
      if (!amb.customerId) return { ok: true, dados: { encontrado: false } };
      const c = await clienteDoSistema();

      if (!c) {
        const pedido = demo().pedidos.find((p) => p.customer_id === amb.customerId);
        return pedido
          ? { ok: true, dados: { encontrado: true, numero: pedido.numero_pedido, status: pedido.status_pedido } }
          : { ok: true, dados: { encontrado: false } };
      }

      const { data } = await c.from("orders")
        .select("numero_pedido, status_pedido, total")
        .eq("customer_id", amb.customerId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      return data
        ? { ok: true, dados: { encontrado: true, numero: data.numero_pedido, status: data.status_pedido } }
        : { ok: true, dados: { encontrado: false } };
    }

    /* ----------------------------------------------------------- apoio -- */

    /* --------------------------------------------------------- perfil -- */

    case "perfil_cliente":
      return { ok: true, dados: await lerPerfil(amb.customerId) };

    case "salvar_preferencias": {
      if (!amb.customerId) return { ok: false, erro: "Cliente ainda não identificado." };
      const c = await clienteDoSistema();
      if (!c) return { ok: true, dados: { salvo: true } };

      const { data: atual, error: erroLer } = await c.from("customers")
        .select("pref_marcas, pref_sabores, pref_perfil_sabor, pref_puffs")
        .eq("id", amb.customerId).maybeSingle();
      // sem a migração 0017 as colunas não existem: não é erro do cliente
      if (erroLer) return { ok: true, dados: { salvo: false } };

      const somar = (antes: unknown, novos: string[]) =>
        [...new Set([...((antes as string[]) ?? []), ...novos])].slice(0, 10);
      const perfisValidos: PerfilSabor[] = ["gelado", "menta", "doce", "fruta", "tabaco"];

      const campos = {
        pref_marcas: somar(atual?.pref_marcas, lista(a.marcas)),
        pref_sabores: somar(atual?.pref_sabores, lista(a.sabores)),
        pref_perfil_sabor: somar(atual?.pref_perfil_sabor,
          lista(a.perfil).map(semAcento).filter((p) => perfisValidos.includes(p as PerfilSabor))),
        pref_puffs: a.puffs != null ? Number(a.puffs) : (atual?.pref_puffs ?? null),
        pref_atualizada_em: new Date().toISOString(),
      };
      const { error } = await c.from("customers").update(campos).eq("id", amb.customerId);
      if (error) return { ok: false, erro: error.message };
      return { ok: true, dados: { salvo: true, ...campos } };
    }

    case "sugerir_produtos": {
      const catalogo = vendaveis(await lerCatalogo()).filter((x) => x.estoque_disponivel > 0);
      const perfis = lista(a.perfil).map(semAcento) as PerfilSabor[];
      const marca = a.marca ? semAcento(String(a.marca)) : "";
      const puffs = a.puffs != null ? Number(a.puffs) : null;

      const filtrar = (usarPerfil: boolean, usarMarca: boolean) => catalogo.filter((x) =>
        (!usarMarca || !marca || semAcento(x.marca ?? "").includes(marca))
        // 20% de folga: quem pede "10k" aceita um de 9 mil
        && (puffs == null || (x.puffs ?? 0) >= puffs * 0.8)
        && (!usarPerfil || !perfis.length || saborCombina(x.sabor, perfis)));

      // afrouxa do menos para o mais importante antes de dizer que não tem
      const achados = [filtrar(true, true), filtrar(true, false), filtrar(false, true)]
        .find((r) => r.length > 0) ?? [];

      const porModelo = new Map<string, {
        produto: string; marca: string | null; preco: number; puffs: number | null; sabores: string[];
      }>();
      achados.forEach((x) => {
        const m = porModelo.get(x.produto)
          ?? { produto: x.produto, marca: x.marca, preco: x.preco, puffs: x.puffs, sabores: [] };
        if (m.sabores.length < 5) m.sabores.push(x.sabor);
        porModelo.set(x.produto, m);
      });

      const modelos = [...porModelo.values()]
        .sort((p, q) => q.sabores.length - p.sabores.length).slice(0, 4);
      return { ok: true, dados: { modelos } };
    }

    case "repetir_ultimo_pedido": {
      const perfil = await lerPerfil(amb.customerId);
      const ultimo = perfil.ultimoPedido;
      if (!ultimo?.itens.length) return { ok: false, erro: "Não achei um pedido anterior para repetir." };

      const adicionados: Array<{ produto: string; sabor: string; quantidade: number; preco: number }> = [];
      const faltaram: string[] = [];
      let contexto: Partial<Contexto> = {};

      for (const item of ultimo.itens) {
        const r = await despachar("adicionar_carrinho",
          { produto: item.produto, sabor: item.sabor, quantidade: item.quantidade },
          { ...amb, contexto: { ...amb.contexto, ...contexto } });
        if (r.ok) {
          adicionados.push(r.dados as (typeof adicionados)[number]);
          contexto = { ...contexto, ...r.contexto };
        } else {
          faltaram.push(`${item.produto} ${item.sabor}`);
        }
      }

      if (!adicionados.length) {
        return { ok: false, erro: `O que você levou da última vez acabou agora: ${faltaram.join(", ")}.` };
      }
      return {
        ok: true,
        dados: { adicionados, faltaram },
        contexto: { ...contexto, repetir_pedido_id: undefined },
      };
    }

    case "criar_tarefa": {
      const c = await clienteDoSistema();
      const titulo = String(a.titulo);
      const prioridade = String(a.prioridade ?? "alta");

      if (!c) {
        demo().tarefas.unshift({
          id: `task-${Date.now()}`, titulo,
          descricao: "Aberta pelo bot durante o atendimento",
          prioridade: prioridade as "baixa" | "media" | "alta" | "urgente",
          status: "aberta", vencimento: null, criada_por: "bot",
          created_at: new Date().toISOString(),
        });
        return { ok: true, dados: { titulo } };
      }

      const { error } = await c.from("tasks").insert({
        store_id: STORE_ID, titulo,
        descricao: "Aberta pelo bot durante o atendimento",
        prioridade, status: "aberta", criada_por: "bot",
        conversation_id: amb.conversationId,
        customer_id: amb.customerId,
      });
      if (error) return { ok: false, erro: error.message };
      return { ok: true, dados: { titulo } };
    }

    case "transferir_atendimento": {
      const motivo = String(a.motivo);
      const c = await clienteDoSistema();

      if (c) {
        await c.from("conversations")
          .update({ bot_ativo: false, estado: "HUMAN", nao_lidas: 1 })
          .eq("id", amb.conversationId);
      } else {
        const conversa = demo().conversas.find((x) => x.id === amb.conversationId);
        if (conversa) {
          conversa.bot_ativo = false;
          conversa.estado = "HUMAN";
          conversa.nao_lidas += 1;
        }
      }

      await despachar("criar_tarefa",
        { titulo: `Cliente precisa de atendimento: ${motivo}`, prioridade: "alta" }, amb);

      return { ok: true, dados: { motivo } };
    }

    case "validar_maioridade": {
      const confirmou = Boolean(a.confirmou);
      if (!confirmou) {
        return { ok: true, dados: { confirmou: false } };
      }

      const c = await clienteDoSistema();
      if (c && amb.customerId) {
        await c.from("customers").update({
          maioridade_validada: true,
          maioridade_validada_em: new Date().toISOString(),
        }).eq("id", amb.customerId);
      } else if (amb.customerId) {
        const cliente = demo().clientes.find((x) => x.id === amb.customerId);
        if (cliente) cliente.maioridade_validada = true;
      }

      return {
        ok: true, dados: { confirmou: true },
        contexto: { maioridade_validada: true },
      };
    }

    /* --------------------------------------------------------- upsell -- */

    case "buscar_upsell": {
      const c = await clienteDoSistema();
      const carrinho = await despachar("consultar_carrinho", {}, amb);
      const d = carrinho.dados as {
        vazio?: boolean;
        itens?: Array<{ produto?: string; quantidade?: number; subtotal?: number }>;
      };
      if (d?.vazio || !d.itens?.length) return { ok: true, dados: { oferta: null } };

      const catalogo = await lerCatalogo();
      const itens = d.itens.map((i) => {
        const achado = catalogo.find((x) => x.produto === i.produto);
        return {
          product_id: achado?.product_id ?? "",
          produto: String(i.produto ?? ""),
          preco: achado?.preco ?? 0,
          quantidade: Number(i.quantidade ?? 1),
        };
      });

      const regras = c
        ? ((await c.from("upsell_rules")
            .select("*, destino:products!upsell_rules_produto_destino_fkey(nome)")
            .eq("store_id", STORE_ID).eq("status", "ativo")).data ?? [])
            .map((r: Record<string, unknown>) => ({
              ...r,
              produto_destino_nome: (r.destino as { nome?: string } | null)?.nome ?? null,
            }))
        : (await import("../demo-mvp2")).demo2().upsell;

      // a oferta não pode cair num produto esgotado: o bot ofereceria sozinho
      // algo que não consegue vender, e a conversa trava no melhor momento
      const disponiveis = new Set(
        vendaveis(catalogo).filter((x) => x.estoque_disponivel > 0).map((x) => x.product_id),
      );
      const regrasComEstoque = (regras as RegraAplicavel[]).filter(
        (r) => !r.produto_destino || disponiveis.has(r.produto_destino),
      );

      const oferta = escolherOferta(
        regrasComEstoque,
        itens,
        amb.contexto.upsell_oferecidos ?? [],
      );

      if (!oferta) return { ok: true, dados: { oferta: null } };

      // registra que foi exibida: é o denominador da taxa de conversão
      if (c) {
        await c.from("upsell_events").insert({
          store_id: STORE_ID,
          rule_id: oferta.regra.id,
          customer_id: amb.customerId,
          conversation_id: amb.conversationId,
          exibida: true,
        });
      }

      return {
        ok: true,
        dados: {
          oferta: {
            mensagem: oferta.mensagem,
            desconto: oferta.descontoEmReais,
            produto: oferta.regra.produto_destino_nome,
          },
        },
        contexto: {
          upsell_pendente: oferta.regra.id,
          upsell_oferecidos: [...(amb.contexto.upsell_oferecidos ?? []), oferta.regra.id],
        },
      };
    }

    case "responder_upsell": {
      const regraId = amb.contexto.upsell_pendente;
      if (!regraId) return { ok: true, dados: { registrado: false } };

      const aceita = Boolean(a.aceita);
      const c = await clienteDoSistema();

      if (c) {
        await c.from("upsell_events")
          .update({ aceita })
          .eq("rule_id", regraId)
          .eq("conversation_id", amb.conversationId)
          .is("aceita", null);
      }

      return {
        ok: true,
        dados: { registrado: true, aceita },
        contexto: { upsell_pendente: undefined },
      };
    }

    case "enviar_catalogo":
      // quem envia é o motor, que tem acesso à fila
      return { ok: true, dados: { enviar: true } };

    /**
     * O catálogo inteiro numa mensagem, montado agora.
     *
     * O caminho progressivo (marca → modelo → sabor) é melhor para quem já
     * sabe o que quer; este serve para quem pede "manda o catálogo". Em
     * qualquer um dos dois, o que não tem estoque não aparece.
     */
    case "catalogo_completo": {
      const catalogo = await lerCatalogo();
      const { catalogoEmTexto } = await import("../catalogo-texto");

      const texto = catalogoEmTexto(
        catalogo.map((c) => ({
          marca: c.marca, produto: c.produto, puffs: c.puffs, preco: c.preco,
          sabor: c.sabor, estoque_disponivel: c.estoque_disponivel,
          vendavel: c.vendavel,
        })),
        // no WhatsApp a mensagem gigante não é lida; o resto sai quando o
        // cliente disser o modelo
        { limiteSabores: 6 },
      );

      return {
        ok: true,
        dados: {
          texto,
          vazio: catalogo.every((c) => !c.vendavel || c.estoque_disponivel <= 0),
        },
      };
    }

    case "remover_carrinho": {
      const c = await clienteDoSistema();
      if (!c || !amb.contexto.cart_id) {
        return { ok: true, dados: { removido: true }, contexto: { product_flavor_id: undefined } };
      }

      const catalogo = await lerCatalogo();
      const item = catalogo.find((x) =>
        semAcento(x.produto).includes(semAcento(String(a.produto))) &&
        semAcento(x.sabor) === semAcento(String(a.sabor)));
      if (!item) return { ok: false, erro: "Esse item não está no carrinho." };

      const { error } = await c.rpc("remover_do_carrinho", {
        p_cart_id: amb.contexto.cart_id,
        p_product_flavor_id: item.product_flavor_id,
        p_quantidade: null,
      });
      if (error) return { ok: false, erro: error.message };

      return { ok: true, dados: { removido: true } };
    }

    default:
      return { ok: false, erro: `Ferramenta "${nome}" não tem implementação.` };
  }
}
