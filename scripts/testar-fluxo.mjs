/**
 * Testa a cadeia do dinheiro e do estoque contra o banco de verdade.
 *
 * Existe porque os defeitos mais caros deste sistema não apareceram em teste
 * unitário nem em revisão de código: apareceram quando alguém vendeu. O
 * `ON CONFLICT` que derrubava toda confirmação, a reserva que vazava em venda
 * de balcão, o webhook que o RLS negava — todos passavam no build e no lint.
 *
 * Cada passo cria o mínimo, confere o efeito e DESFAZ. No fim imprime o que
 * passou e o que quebrou, e confirma que não sobrou linha de teste.
 *
 * Uso:  npm run testar-fluxo
 *       npm run testar-fluxo -- --manter   (não apaga, para investigar)
 */

const U = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")}/rest/v1`;
const CHAVE = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOJA = process.env.NEXT_PUBLIC_STORE_ID ?? "22222222-2222-2222-2222-222222222222";
const MANTER = process.argv.includes("--manter");

if (!CHAVE || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY no .env.local.");
  process.exit(1);
}

const H = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "content-type": "application/json" };

async function req(metodo, caminho, corpo, prefer) {
  const r = await fetch(`${U}${caminho}`, {
    method: metodo,
    headers: prefer ? { ...H, Prefer: prefer } : H,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  const dados = texto.trim() ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(dados?.message ?? `HTTP ${r.status}`);
  return dados;
}

const rpc = (nome, args) => req("POST", `/rpc/${nome}`, args);
const ler = (caminho) => req("GET", caminho);
const estoque = async (pf) =>
  (await ler(`/inventory?product_flavor_id=eq.${pf}&select=quantidade_total,quantidade_reservada,custo_medio`))[0];

const resultados = [];
const lixo = [];

function conferir(nome, condicao, detalhe = "") {
  resultados.push({ nome, ok: Boolean(condicao), detalhe });
  console.log(`  ${condicao ? "✓" : "✗"} ${nome}${detalhe && !condicao ? ` — ${detalhe}` : ""}`);
}

try {
  // ------------------------------------------------- preparação
  const [sku] = await ler("/v_catalogo?select=product_flavor_id,produto,sabor,preco&limit=1");
  if (!sku) throw new Error("Nenhum produto+sabor cadastrado: não há o que testar.");
  const PF = sku.product_flavor_id;
  const inicial = await estoque(PF);

  console.log(`\nSKU: ${sku.produto} · ${sku.sabor} · R$ ${sku.preco}`);
  console.log(`Estoque no começo: ${inicial.quantidade_total} (reservado ${inicial.quantidade_reservada})\n`);

  // ------------------------------------------------- entrada
  console.log("ENTRADA DE ESTOQUE");
  await rpc("mover_estoque", {
    p_product_flavor_id: PF, p_tipo: "entrada", p_quantidade: 10,
    p_referencia_tipo: "teste_fluxo", p_referencia_id: "entrada",
    p_usuario_id: null, p_observacao: "teste de fluxo", p_custo_unitario: 40,
  });
  const apos = await estoque(PF);
  conferir("entrada soma ao total", apos.quantidade_total === inicial.quantidade_total + 10);
  conferir("entrada registra movimentação",
    (await ler("/inventory_movements?referencia_tipo=eq.teste_fluxo&select=id")).length > 0);

  // ------------------------------------------------- venda
  console.log("\nVENDA (dinheiro, confirma na hora)");
  const [cliente] = await req("POST", "/customers",
    { store_id: LOJA, nome: "TESTE FLUXO", telefone: "33900000000", status: "ativo" },
    "return=representation");
  lixo.push(["customers", cliente.id]);

  const carrinho = await rpc("abrir_carrinho",
    { p_conversation_id: null, p_customer_id: cliente.id, p_store_id: LOJA });
  lixo.push(["carts", carrinho.id]);

  await rpc("adicionar_ao_carrinho",
    { p_cart_id: carrinho.id, p_product_flavor_id: PF, p_quantidade: 3 });
  const reservado = await estoque(PF);
  conferir("carrinho reserva sem mexer no total",
    reservado.quantidade_reservada === apos.quantidade_reservada + 3
    && reservado.quantidade_total === apos.quantidade_total);

  const pedido = await rpc("criar_pedido", {
    p_cart_id: carrinho.id, p_address_id: null, p_forma_pagamento: "dinheiro",
    p_troco_para: null, p_observacoes: "teste de fluxo",
    p_atendente_id: null, p_origem: "operador",
  });
  lixo.push(["orders", pedido.id]);

  conferir("pedido em dinheiro confirma na hora", pedido.status_pedido === "confirmado",
    `ficou ${pedido.status_pedido}`);
  conferir("pedido guarda o carrinho de origem", Boolean(pedido.cart_id),
    "cart_id vazio — a 0013 não foi aplicada");

  const vendido = await estoque(PF);
  conferir("venda baixa do total", vendido.quantidade_total === reservado.quantidade_total - 3);
  conferir("venda LIBERA a reserva",
    vendido.quantidade_reservada === apos.quantidade_reservada,
    `sobrou ${vendido.quantidade_reservada} reservado — reserva vazando`);

  const contas = await ler(`/accounts_receivable?order_id=eq.${pedido.id}&select=valor,status`);
  conferir("gera UMA conta a receber", contas.length === 1, `gerou ${contas.length}`);
  conferir("conta a receber com o valor do pedido",
    contas[0] && Number(contas[0].valor) === Number(pedido.total));
  conferir("comanda entra na fila de impressão",
    (await ler("/jobs?tipo=eq.imprimir_pedido&select=payload"))
      .some((j) => j.payload?.order_id === pedido.id));
  conferir("item guarda o retrato comercial",
    (await ler(`/order_items?order_id=eq.${pedido.id}&select=custo_unitario,preco_unitario`))
      .every((i) => i.custo_unitario != null && i.preco_unitario != null));

  // ------------------------------------------------- cancelamento
  console.log("\nCANCELAMENTO (devolve estoque e resolve o financeiro)");
  await rpc("cancelar_pedido",
    { p_order_id: pedido.id, p_motivo: "teste de fluxo", p_usuario_id: null });
  const cancelado = await estoque(PF);
  conferir("cancelamento devolve o estoque",
    cancelado.quantidade_total === vendido.quantidade_total + 3);
  const arDepois = await ler(`/accounts_receivable?order_id=eq.${pedido.id}&select=status`);
  conferir("conta a receber não fica pendente",
    arDepois.every((a) => a.status !== "pendente"),
    `ficou ${arDepois.map((a) => a.status).join(", ")}`);

  // ------------------------------------------------- PIX sem pagamento
  console.log("\nPIX NÃO CONFIRMA SEM PAGAMENTO");
  const c2 = await rpc("abrir_carrinho",
    { p_conversation_id: null, p_customer_id: cliente.id, p_store_id: LOJA });
  lixo.push(["carts", c2.id]);
  await rpc("adicionar_ao_carrinho",
    { p_cart_id: c2.id, p_product_flavor_id: PF, p_quantidade: 1 });
  const pedidoPix = await rpc("criar_pedido", {
    p_cart_id: c2.id, p_address_id: null, p_forma_pagamento: "pix",
    p_troco_para: null, p_observacoes: "teste pix",
    p_atendente_id: null, p_origem: "operador",
  });
  lixo.push(["orders", pedidoPix.id]);
  conferir("PIX nasce aguardando pagamento",
    pedidoPix.status_pedido === "aguardando_pagamento", `ficou ${pedidoPix.status_pedido}`);

  let recusou = false;
  try { await rpc("confirmar_pedido", { p_order_id: pedidoPix.id, p_usuario_id: null }); }
  catch { recusou = true; }
  conferir("confirmar PIX sem pagamento é RECUSADO", recusou,
    "confirmou sem o dinheiro entrar");

  await rpc("cancelar_pedido",
    { p_order_id: pedidoPix.id, p_motivo: "teste", p_usuario_id: null });

} catch (e) {
  console.error(`\n✗ o teste parou: ${e.message}`);
  resultados.push({ nome: "execução", ok: false, detalhe: e.message });
}

// ------------------------------------------------- limpeza
if (!MANTER) {
  console.log("\nLIMPEZA");
  for (const [tabela, id] of lixo.reverse()) {
    try {
      if (tabela === "orders") {
        await req("DELETE", `/accounts_receivable?order_id=eq.${id}`);
        await req("DELETE", `/order_status_history?order_id=eq.${id}`);
        await req("DELETE", `/order_items?order_id=eq.${id}`);
      }
      if (tabela === "carts") await req("DELETE", `/cart_items?cart_id=eq.${id}`);
      await req("DELETE", `/${tabela}?id=eq.${id}`);
    } catch (e) { console.log(`  ⚠ ${tabela} ${id}: ${e.message}`); }
  }
  try {
    await req("DELETE", "/jobs?tipo=eq.imprimir_pedido");
    await req("DELETE", "/inventory_movements?referencia_tipo=in.(teste_fluxo,order,cart)");
    const sobrou = await ler("/customers?nome=eq.TESTE FLUXO&select=id");
    console.log(`  ${sobrou.length === 0 ? "✓" : "✗"} nada de teste sobrou no banco`);
  } catch (e) { console.log(`  ⚠ ${e.message}`); }
  console.log("  ⚠ o estoque de teste NÃO é zerado automaticamente — confira em Estoque");
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} conferências passaram`);
if (falhas.length) {
  console.log("\nFALHOU:");
  for (const f of falhas) console.log(`  · ${f.nome}${f.detalhe ? ` — ${f.detalhe}` : ""}`);
  process.exit(1);
}
