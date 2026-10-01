import "server-only";
import { clienteDoSistema } from "../supabase/sistema";
import { STORE_ID } from "../supabase/config";
import { demo } from "../demo";
import { validarChamada } from "./ferramentas";
import type { Contexto } from "./estados";
import type { ItemCatalogo } from "../types";
import { escolherOferta, type RegraAplicavel } from "./upsell";

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
      return {
        ok: true,
        dados: { encontrado: true, produto: achados[0].produto, preco: achados[0].preco },
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

      const { data, error } = await c.from("customer_addresses")
        .insert({ customer_id: amb.customerId, ...endereco, principal: true })
        .select("id").single();
      if (error) return { ok: false, erro: error.message };

      return {
        ok: true, dados: { ...endereco, id: data.id },
        contexto: { endereco_id: data.id, endereco_confirmado: true },
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
      const forma = String(a.forma).toLowerCase() as "pix" | "dinheiro";
      const trocoPara = a.troco_para != null ? Number(a.troco_para) : null;

      const carrinho = await despachar("consultar_carrinho", {}, amb);
      const dados = carrinho.dados as { total?: number; vazio?: boolean } | undefined;
      if (!dados || dados.vazio) return { ok: false, erro: "O carrinho está vazio." };

      const total = Number(dados.total ?? 0);
      if (forma === "dinheiro" && trocoPara != null && trocoPara < total) {
        return { ok: false, erro: `O valor informado é menor que o total de R$ ${total.toFixed(2)}.` };
      }

      // A cobrança sai pelo meio que estiver no ar. Isso precisa passar pelo
      // mesmo `meioAtivo()` do painel: se o bot mandasse sempre o PIX
      // estático com o gateway ligado, o cliente pagaria um código que o
      // gateway nunca vê — e o pedido ficaria parado esperando baixa manual
      // de um pagamento que já entrou.
      if (forma === "pix") {
        const { meioAtivo } = await import("../pagamento");
        const meio = meioAtivo();

        if (meio.confirmacaoAutomatica && amb.contexto.order_id) {
          const { gerarCobranca } = await import("../pix/cobranca");
          const r = await gerarCobranca(amb.contexto.order_id);

          // o gateway devolve o copia e cola; link existe só se algum
          // provedor futuro trabalhar assim. O que não pode é o bot inventar.
          if (r.ok && (r.cobranca?.copiaECola || r.cobranca?.link)) {
            return {
              ok: true,
              dados: {
                forma, total,
                chave: null,
                copiaECola: r.cobranca.copiaECola || null,
                link: r.cobranca.link ?? null,
                automatico: true,
              },
              contexto: { forma_pagamento: "pix", pagamento_status: "aguardando" },
            };
          }
          // gateway fora do ar não pode travar a venda: cai no estático
          console.error(`[luxx] a cobrança pelo gateway falhou, usando PIX estático: ${r.erro}`);
        }

        const { lerConfiguracoes } = await import("../actions-config");
        const config = await lerConfiguracoes();

        if (!config.pagamentos.chave_pix) {
          return {
            ok: true,
            dados: { forma, total, chave: null, copiaECola: null },
            contexto: { forma_pagamento: "pix", pagamento_status: "aguardando" },
          };
        }

        const { gerarBrCode } = await import("../pix/brcode");
        let copiaECola: string | null = null;
        try {
          copiaECola = gerarBrCode({
            chave: config.pagamentos.chave_pix,
            nome: config.empresa.nome,
            cidade: config.empresa.endereco.split("-")[0].trim(),
            valor: total,
            identificador: amb.contexto.order_id ?? undefined,
          });
        } catch {
          copiaECola = null;   // chave malformada: cai para o texto sem código
        }

        return {
          ok: true,
          dados: {
            forma, total,
            chave: config.pagamentos.chave_pix,
            copiaECola,
            automatico: Boolean(config.pagamentos.gateway),
          },
          contexto: { forma_pagamento: "pix", pagamento_status: "aguardando" },
        };
      }

      return {
        ok: true,
        dados: { forma, total, troco: trocoPara ? trocoPara - total : 0 },
        contexto: {
          forma_pagamento: "dinheiro",
          troco_para: trocoPara ?? undefined,
          pagamento_status: "aguardando",
        },
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
      return {
        ok: true,
        dados: {
          ...(carrinho.dados as object),
          forma_pagamento: amb.contexto.forma_pagamento,
          troco_para: amb.contexto.troco_para,
          endereco_confirmado: amb.contexto.endereco_confirmado,
        },
      };
    }

    case "confirmar_pedido": {
      const ctx = amb.contexto;
      if (!ctx.cart_id) return { ok: false, erro: "Não há carrinho para fechar." };
      if (!ctx.endereco_confirmado) return { ok: false, erro: "Falta confirmar o endereço." };
      if (!ctx.forma_pagamento) return { ok: false, erro: "Falta escolher a forma de pagamento." };

      // a trava que protege o estoque: PIX só fecha com o dinheiro na conta
      if (ctx.forma_pagamento === "pix" && ctx.pagamento_status !== "aprovado") {
        return { ok: false, erro: "O PIX ainda não caiu." };
      }

      const c = await clienteDoSistema();
      if (!c) {
        return {
          ok: true,
          dados: { numero: `LX-${new Date().getFullYear()}-DEMO` },
          contexto: { order_id: "demo" },
        };
      }

      const { data, error } = await c.rpc("criar_pedido", {
        p_cart_id: ctx.cart_id,
        p_address_id: ctx.endereco_id ?? null,
        p_forma_pagamento: ctx.forma_pagamento,
        p_troco_para: ctx.troco_para ?? null,
        p_observacoes: null,
        p_atendente_id: null,
        p_origem: "bot",
      });
      if (error) return { ok: false, erro: error.message };

      return {
        ok: true,
        dados: { numero: data.numero_pedido, total: data.total },
        contexto: { order_id: data.id },
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

      const oferta = escolherOferta(
        regras as RegraAplicavel[],
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
