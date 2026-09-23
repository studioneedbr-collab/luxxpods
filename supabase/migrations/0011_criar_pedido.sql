-- =====================================================================
-- LUXX PODS — 0011 CRIAR PEDIDO
--
-- Até aqui o sistema sabia confirmar, separar, entregar e cobrar um pedido,
-- mas não existia nenhum caminho que CRIASSE um. Esta função é esse caminho:
-- uma transação só, do carrinho ao pedido, com reserva de estoque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CARRINHO: abrir, adicionar item (reservando), remover, limpar.
-- ---------------------------------------------------------------------

create or replace function abrir_carrinho(
  p_conversation_id uuid default null,
  p_customer_id uuid default null,
  p_store_id uuid default null
) returns carts
language plpgsql security definer as $$
declare
  v_cart carts;
  v_store uuid;
  v_customer uuid;
  v_minutos integer;
begin
  -- reaproveita o carrinho aberto desta conversa, se houver
  if p_conversation_id is not null then
    select * into v_cart from carts
     where conversation_id = p_conversation_id and status = 'ativo'
     order by created_at desc limit 1;
    if v_cart.id is not null then return v_cart; end if;
  end if;

  select store_id, customer_id into v_store, v_customer
    from conversations where id = p_conversation_id;
  v_store := coalesce(p_store_id, v_store);
  v_customer := coalesce(p_customer_id, v_customer);
  if v_store is null then raise exception 'Loja não identificada'; end if;

  -- o tempo de reserva é configurável, não fixo no código
  select coalesce((valor ->> 'reserva_minutos')::integer, 15) into v_minutos
    from settings where store_id = v_store and chave = 'estoque';

  insert into carts (store_id, customer_id, conversation_id, status, expires_at)
  values (v_store, v_customer, p_conversation_id, 'ativo',
          now() + make_interval(mins => coalesce(v_minutos, 15)))
  returning * into v_cart;

  return v_cart;
end $$;

/**
 * Põe o item no carrinho E reserva a unidade.
 * Reservar aqui é o que impede dois clientes fecharem a última peça: se o
 * estoque não der, esta função levanta erro e nada é gravado.
 */
create or replace function adicionar_ao_carrinho(
  p_cart_id uuid,
  p_product_flavor_id uuid,
  p_quantidade integer default 1
) returns cart_items
language plpgsql security definer as $$
declare
  v_cart  carts;
  v_item  cart_items;
  v_preco numeric(12,2);
  v_minutos integer;
begin
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_cart from carts where id = p_cart_id for update;
  if v_cart.id is null then raise exception 'Carrinho não encontrado'; end if;
  if v_cart.status <> 'ativo' then raise exception 'Carrinho já fechado'; end if;

  select coalesce(pf.preco_override, p.preco) into v_preco
    from product_flavors pf
    join products p on p.id = pf.product_id
   where pf.id = p_product_flavor_id and pf.ativo and p.status = 'ativo';

  if v_preco is null then
    raise exception 'Este produto não está disponível para venda';
  end if;

  -- reserva primeiro: se faltar estoque, a transação inteira volta atrás
  perform mover_estoque(
    p_product_flavor_id, 'reserva', p_quantidade,
    'cart', p_cart_id::text, null, 'Reserva por item no carrinho');

  select * into v_item from cart_items
   where cart_id = p_cart_id and product_flavor_id = p_product_flavor_id;

  if v_item.id is null then
    insert into cart_items (
      cart_id, product_flavor_id, quantidade, preco_unitario, subtotal, reservado)
    values (
      p_cart_id, p_product_flavor_id, p_quantidade, v_preco,
      v_preco * p_quantidade, true)
    returning * into v_item;
  else
    update cart_items set
      quantidade = quantidade + p_quantidade,
      subtotal = (quantidade + p_quantidade) * preco_unitario,
      reservado = true
    where id = v_item.id returning * into v_item;
  end if;

  -- cada interação estende o prazo: quem está escolhendo não perde a reserva
  select coalesce((valor ->> 'reserva_minutos')::integer, 15) into v_minutos
    from settings where store_id = v_cart.store_id and chave = 'estoque';

  perform recalcular_carrinho(p_cart_id);
  update carts set expires_at = now() + make_interval(mins => coalesce(v_minutos, 15))
   where id = p_cart_id;

  return v_item;
end $$;

create or replace function remover_do_carrinho(
  p_cart_id uuid, p_product_flavor_id uuid, p_quantidade integer default null
) returns void
language plpgsql security definer as $$
declare v_item cart_items; v_tirar integer;
begin
  select * into v_item from cart_items
   where cart_id = p_cart_id and product_flavor_id = p_product_flavor_id;
  if v_item.id is null then return; end if;

  v_tirar := least(coalesce(p_quantidade, v_item.quantidade), v_item.quantidade);

  if v_item.reservado then
    perform mover_estoque(p_product_flavor_id, 'liberacao_reserva', v_tirar,
      'cart', p_cart_id::text, null, 'Item retirado do carrinho');
  end if;

  if v_tirar >= v_item.quantidade then
    delete from cart_items where id = v_item.id;
  else
    update cart_items set
      quantidade = quantidade - v_tirar,
      subtotal = (quantidade - v_tirar) * preco_unitario
    where id = v_item.id;
  end if;

  perform recalcular_carrinho(p_cart_id);
end $$;

/** Soma o carrinho com a taxa de entrega e o cupom da loja. */
create or replace function recalcular_carrinho(p_cart_id uuid) returns carts
language plpgsql security definer as $$
declare
  v_cart carts;
  v_subtotal numeric(12,2);
  v_entrega numeric(12,2) := 0;
  v_gratis numeric(12,2);
  v_desconto numeric(12,2) := 0;
  v_cupom coupons;
begin
  select * into v_cart from carts where id = p_cart_id;
  if v_cart.id is null then raise exception 'Carrinho não encontrado'; end if;

  select coalesce(sum(subtotal), 0) into v_subtotal
    from cart_items where cart_id = p_cart_id;

  select coalesce((valor ->> 'taxa_padrao')::numeric, 0),
         coalesce((valor ->> 'taxa_gratis_acima')::numeric, 0)
    into v_entrega, v_gratis
    from settings where store_id = v_cart.store_id and chave = 'entrega';

  if v_gratis > 0 and v_subtotal >= v_gratis then v_entrega := 0; end if;

  if v_cart.coupon_id is not null then
    select * into v_cupom from coupons where id = v_cart.coupon_id;
    if v_cupom.id is not null and v_subtotal >= v_cupom.valor_minimo then
      v_desconto := case v_cupom.tipo_desconto
        when 'percentual' then round(v_subtotal * v_cupom.valor / 100, 2)
        else least(v_cupom.valor, v_subtotal) end;
    end if;
  end if;

  update carts set
    subtotal = v_subtotal,
    entrega = coalesce(v_entrega, 0),
    desconto = v_desconto,
    total = v_subtotal + coalesce(v_entrega, 0) - v_desconto,
    updated_at = now()
  where id = p_cart_id returning * into v_cart;

  return v_cart;
end $$;

-- ---------------------------------------------------------------------
-- CRIAR PEDIDO: o carrinho vira venda.
--
-- Uma transação só. Se qualquer passo falhar, nada é gravado — não existe
-- pedido pela metade, nem estoque baixado sem pedido.
-- ---------------------------------------------------------------------
create or replace function criar_pedido(
  p_cart_id uuid,
  p_address_id uuid default null,
  p_forma_pagamento pagamento_metodo default 'pix',
  p_troco_para numeric default null,
  p_observacoes text default null,
  p_atendente_id uuid default null,
  p_origem origem_acao default 'operador'
) returns orders
language plpgsql security definer as $$
declare
  v_cart   carts;
  v_order  orders;
  v_item   cart_items;
  v_cliente customers;
  v_endereco customer_addresses;
  v_custo  numeric(12,2) := 0;
  v_itens  integer;
begin
  select * into v_cart from carts where id = p_cart_id for update;
  if v_cart.id is null then raise exception 'Carrinho não encontrado'; end if;
  if v_cart.status <> 'ativo' then raise exception 'Este carrinho já virou pedido'; end if;

  select count(*) into v_itens from cart_items where cart_id = p_cart_id;
  if v_itens = 0 then raise exception 'Carrinho vazio'; end if;

  -- troco só faz sentido em dinheiro, e precisa cobrir a conta
  if p_forma_pagamento = 'dinheiro' and p_troco_para is not null
     and p_troco_para < v_cart.total then
    raise exception 'O valor do troco (%) é menor que o total do pedido (%)',
      p_troco_para, v_cart.total;
  end if;

  perform recalcular_carrinho(p_cart_id);
  select * into v_cart from carts where id = p_cart_id;

  select * into v_cliente from customers where id = v_cart.customer_id;
  select * into v_endereco from customer_addresses where id = p_address_id;

  select coalesce(sum(ci.quantidade * coalesce(i.custo_medio, p.custo)), 0) into v_custo
    from cart_items ci
    join product_flavors pf on pf.id = ci.product_flavor_id
    join products p on p.id = pf.product_id
    left join inventory i on i.product_flavor_id = pf.id
   where ci.cart_id = p_cart_id;

  insert into orders (
    store_id, customer_id, conversation_id, lead_id, address_id,
    endereco_snapshot, cliente_nome, cliente_telefone, atendente_id, canal, origem,
    subtotal, desconto, taxa_entrega, total, custo_total,
    forma_pagamento, status_pagamento, status_pedido,
    troco_para, valor_troco, coupon_id, observacoes)
  values (
    v_cart.store_id, v_cart.customer_id, v_cart.conversation_id,
    (select id from leads where conversation_id = v_cart.conversation_id
      and status = 'aberto' order by created_at desc limit 1),
    p_address_id,
    case when v_endereco.id is null then null else jsonb_build_object(
      'rua', v_endereco.rua, 'numero', v_endereco.numero,
      'bairro', v_endereco.bairro, 'cidade', v_endereco.cidade,
      'complemento', v_endereco.complemento, 'referencia', v_endereco.referencia)
    end,
    v_cliente.nome, v_cliente.telefone, p_atendente_id,
    coalesce((select canal from conversations where id = v_cart.conversation_id), 'manual'),
    p_origem,
    v_cart.subtotal, v_cart.desconto, v_cart.entrega, v_cart.total, v_custo,
    p_forma_pagamento,
    'aguardando',
    case when p_forma_pagamento = 'pix' then 'aguardando_pagamento'::pedido_status
         else 'pendente'::pedido_status end,
    p_troco_para,
    case when p_troco_para is not null then p_troco_para - v_cart.total else null end,
    v_cart.coupon_id, p_observacoes)
  returning * into v_order;

  -- snapshot comercial: o pedido antigo não muda quando o preço mudar
  insert into order_items (
    order_id, product_flavor_id, produto_nome, sabor_nome, marca_nome, sku,
    quantidade, custo_unitario, preco_unitario, desconto, subtotal)
  select
    v_order.id, ci.product_flavor_id, c.produto, c.sabor, c.marca, c.sku,
    ci.quantidade, c.custo_medio, ci.preco_unitario, ci.desconto, ci.subtotal
  from cart_items ci
  join v_catalogo c on c.product_flavor_id = ci.product_flavor_id
  where ci.cart_id = p_cart_id;

  -- o cupom só conta uso quando vira pedido de verdade
  if v_cart.coupon_id is not null then
    update coupons set usos = usos + 1 where id = v_cart.coupon_id;
  end if;

  -- o carrinho fica marcado, mas a reserva continua de pé até a confirmação:
  -- é ela que segura a peça enquanto o PIX não cai
  update carts set status = 'convertido' where id = p_cart_id;

  -- dinheiro não espera pagamento: já pode ser confirmado e separado
  if p_forma_pagamento = 'dinheiro' then
    v_order := confirmar_pedido(v_order.id, p_atendente_id);
  end if;

  return v_order;
end $$;

-- confirmar_pedido lê cart_items do carrinho 'ativo'; depois de convertido,
-- a reserva a consumir é a que ficou marcada nos itens
create or replace function confirmar_pedido(p_order_id uuid, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare
  v_order orders;
  v_item  order_items;
  v_cat   uuid;
  v_cart  carts;
  v_reservado integer;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido not in ('pendente','aguardando_pagamento') then
    return v_order;
  end if;

  if v_order.forma_pagamento = 'pix' and v_order.status_pagamento <> 'aprovado' then
    raise exception 'PIX ainda não foi aprovado: o pedido não pode ser confirmado';
  end if;

  select * into v_cart from carts
   where conversation_id = v_order.conversation_id
     and status in ('ativo','convertido')
   order by created_at desc limit 1;

  for v_item in select * from order_items where order_id = p_order_id loop
    if v_item.product_flavor_id is not null then
      select coalesce(sum(ci.quantidade), 0) into v_reservado
        from cart_items ci
       where ci.cart_id = v_cart.id
         and ci.product_flavor_id = v_item.product_flavor_id
         and ci.reservado;

      perform mover_estoque(
        v_item.product_flavor_id, 'venda', v_item.quantidade,
        'order', p_order_id::text, p_usuario_id,
        'Baixa por confirmação de pedido', null, coalesce(v_reservado, 0));
    end if;
  end loop;

  if v_cart.id is not null then
    update cart_items set reservado = false where cart_id = v_cart.id;
    update carts set status = 'convertido' where id = v_cart.id;
  end if;

  update orders set
    status_pedido  = 'confirmado',
    confirmado_em  = coalesce(confirmado_em, now())
  where id = p_order_id returning * into v_order;

  select id into v_cat from financial_categories
   where store_id = v_order.store_id and tipo = 'receita' limit 1;

  insert into accounts_receivable (
    store_id, order_id, customer_id, categoria_id, descricao, valor,
    vencimento, pagamento, forma_pagamento, status)
  values (
    v_order.store_id, v_order.id, v_order.customer_id, v_cat,
    'Venda ' || v_order.numero_pedido, v_order.total,
    current_date,
    case when v_order.status_pagamento = 'aprovado' then current_date else null end,
    v_order.forma_pagamento,
    case when v_order.status_pagamento = 'aprovado' then 'pago'::financeiro_status
         else 'pendente'::financeiro_status end)
  on conflict (order_id) do nothing;

  insert into jobs (store_id, tipo, payload) values
    (v_order.store_id, 'imprimir_pedido', jsonb_build_object('order_id', p_order_id));

  return v_order;
end $$;
