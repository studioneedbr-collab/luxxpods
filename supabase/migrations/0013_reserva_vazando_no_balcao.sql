-- =====================================================================
-- LUXX PODS — 0013 A RESERVA QUE VAZAVA EM TODA VENDA DE BALCÃO
--
-- `confirmar_pedido` precisa saber quanto o carrinho já tinha reservado, para
-- a venda consumir a própria reserva em vez da reserva de outro pedido (a
-- correção da 0009). Ele achava esse carrinho assim:
--
--   where conversation_id = v_order.conversation_id
--
-- Pedido de balcão não tem conversa, então os dois lados são NULL — e em SQL
-- `NULL = NULL` não é verdadeiro, é NULL. O carrinho nunca era encontrado,
-- `v_reservado` ficava 0, e a venda baixava do total SEM liberar a reserva.
--
-- Efeito medido num pedido de 2 unidades: total caiu 2 (certo), reserva
-- continuou 2 (errado) — o disponível caiu 4. E essas unidades não voltam
-- nunca: o carrinho vira 'convertido', e a rotina que libera reserva expirada
-- só olha carrinho 'ativo'.
--
-- Depois de algumas vendas de balcão o sistema diria "esgotado" com produto
-- na prateleira. Era o pior tipo de bug: silencioso, cumulativo, e que some
-- se alguém só olhar o total.
--
-- A correção tira a adivinhação: o pedido passa a GUARDAR de qual carrinho
-- ele nasceu.
-- =====================================================================

alter table orders
  add column if not exists cart_id uuid references carts(id) on delete set null;

comment on column orders.cart_id is
  'De qual carrinho este pedido nasceu. A confirmação precisa dele para saber quanto já estava reservado — procurar pela conversa falha no balcão, onde conversa é NULL.';

create index if not exists idx_orders_cart on orders (cart_id) where cart_id is not null;

-- ---------------------------------------------------------------------
-- criar_pedido: registra o carrinho de origem
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
    store_id, customer_id, conversation_id, lead_id, address_id, cart_id,
    endereco_snapshot, cliente_nome, cliente_telefone, atendente_id, canal, origem,
    subtotal, desconto, taxa_entrega, total, custo_total,
    forma_pagamento, status_pagamento, status_pedido,
    troco_para, valor_troco, coupon_id, observacoes)
  values (
    v_cart.store_id, v_cart.customer_id, v_cart.conversation_id,
    (select id from leads where conversation_id = v_cart.conversation_id
      and status = 'aberto' order by created_at desc limit 1),
    p_address_id,
    p_cart_id,
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

  insert into order_items (
    order_id, product_flavor_id, produto_nome, sabor_nome, marca_nome, sku,
    quantidade, custo_unitario, preco_unitario, desconto, subtotal)
  select
    v_order.id, ci.product_flavor_id, c.produto, c.sabor, c.marca, c.sku,
    ci.quantidade, c.custo_medio, ci.preco_unitario, ci.desconto, ci.subtotal
  from cart_items ci
  join v_catalogo c on c.product_flavor_id = ci.product_flavor_id
  where ci.cart_id = p_cart_id;

  if v_cart.coupon_id is not null then
    update coupons set usos = usos + 1 where id = v_cart.coupon_id;
  end if;

  update carts set status = 'convertido' where id = p_cart_id;

  if p_forma_pagamento = 'dinheiro' then
    v_order := confirmar_pedido(v_order.id, p_atendente_id);
  end if;

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- confirmar_pedido: usa o carrinho que o pedido guardou
-- ---------------------------------------------------------------------
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

  -- pelo id guardado no pedido. O caminho antigo (pela conversa) fica só
  -- como reserva para pedido criado antes desta migração, e agora com
  -- `is not distinct from`, que trata NULL como igual a NULL
  if v_order.cart_id is not null then
    select * into v_cart from carts where id = v_order.cart_id;
  else
    select * into v_cart from carts
     where conversation_id is not distinct from v_order.conversation_id
       and status in ('ativo','convertido')
     order by created_at desc limit 1;
  end if;

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

-- ---------------------------------------------------------------------
-- CONSERTO DAS RESERVAS JÁ ÓRFÃS
--
-- Carrinho convertido com item ainda marcado reservado é reserva que a venda
-- deixou presa. Conversão e confirmação acontecem na mesma transação, então
-- não existe caso legítimo nesse estado depois dela terminar.
-- ---------------------------------------------------------------------
do $$
declare v_item record;
begin
  for v_item in
    select ci.id, ci.product_flavor_id, ci.quantidade, ci.cart_id
      from cart_items ci
      join carts c on c.id = ci.cart_id
     where ci.reservado and c.status = 'convertido'
  loop
    begin
      perform mover_estoque(
        v_item.product_flavor_id, 'liberacao_reserva', v_item.quantidade,
        'conserto_0013', v_item.cart_id::text, null,
        'Reserva presa por venda de balcão — conserto da 0013');
      update cart_items set reservado = false where id = v_item.id;
    exception when others then
      raise warning 'Não consegui liberar a reserva do item %: %', v_item.id, sqlerrm;
    end;
  end loop;
end $$;
