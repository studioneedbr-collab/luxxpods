-- =====================================================================
-- LUXX PODS — 0009 CORREÇÕES CRÍTICAS
-- Bugs que só aparecem com dinheiro e concorrência de verdade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) DINHEIRO NA ENTREGA: entregar é receber.
--    Antes, o pedido virava "entregue" e o financeiro nunca via o dinheiro.
-- ---------------------------------------------------------------------
create or replace function receber_na_entrega(
  p_order_id uuid,
  p_usuario_id uuid default null
) returns orders
language plpgsql security definer as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pagamento = 'aprovado' then return v_order; end if;

  update orders set status_pagamento = 'aprovado'
   where id = p_order_id returning * into v_order;

  update accounts_receivable
     set status = 'pago', pagamento = current_date
   where order_id = p_order_id and status = 'pendente';

  insert into payments (store_id, order_id, metodo, valor, status, pago_em, gateway)
  values (v_order.store_id, p_order_id, v_order.forma_pagamento, v_order.total,
          'aprovado', now(), 'entrega')
  on conflict do nothing;

  insert into order_status_history (order_id, status_anterior, novo_status, usuario_id, origem, observacao)
  values (p_order_id, 'aguardando', 'aprovado', p_usuario_id, 'operador',
          'Recebido na entrega');

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- 2) RESERVA: a venda não pode comer a reserva de outro carrinho.
--
--    No tipo 'venda' o delta de total e de reserva se cancelavam, então a
--    checagem "disponível >= 0" nunca acusava falta: com 5 unidades todas
--    reservadas por terceiros, um pedido de 3 passava e derrubava a reserva
--    alheia. Agora a venda só consome reserva se ELA MESMA reservou antes.
-- ---------------------------------------------------------------------
create or replace function mover_estoque(
  p_product_flavor_id uuid,
  p_tipo movimento_tipo,
  p_quantidade integer,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_usuario_id uuid default null,
  p_observacao text default null,
  p_custo_unitario numeric default null,
  /* quantas unidades desta venda já estavam reservadas por este pedido */
  p_reservado integer default 0
) returns inventory
language plpgsql security definer as $$
declare
  v_inv inventory;
  v_store uuid;
  v_wh uuid;
  v_anterior integer;
  v_delta_total integer := 0;
  v_delta_reserva integer := 0;
  v_consome_reserva integer := 0;
begin
  if p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;

  select pf.store_id into v_store from product_flavors pf where pf.id = p_product_flavor_id;
  if v_store is null then raise exception 'Produto/sabor inexistente'; end if;
  select w.id into v_wh from warehouses w where w.store_id = v_store and w.principal limit 1;

  select * into v_inv from inventory
   where product_flavor_id = p_product_flavor_id for update;

  if v_inv.id is null then
    insert into inventory (store_id, warehouse_id, product_flavor_id, quantidade_total, quantidade_reservada)
    values (v_store, v_wh, p_product_flavor_id, 0, 0)
    returning * into v_inv;
  end if;

  v_anterior := v_inv.quantidade_total - v_inv.quantidade_reservada;

  case p_tipo
    when 'entrada'            then v_delta_total :=  p_quantidade;
    when 'ajuste_positivo'    then v_delta_total :=  p_quantidade;
    when 'devolucao'          then v_delta_total :=  p_quantidade;
    when 'cancelamento'       then v_delta_total :=  p_quantidade;
    when 'ajuste_negativo'    then v_delta_total := -p_quantidade;
    when 'troca'              then v_delta_total := -p_quantidade;
    when 'reserva'            then v_delta_reserva :=  p_quantidade;
    when 'liberacao_reserva'  then v_delta_reserva := -p_quantidade;
    when 'venda' then
      -- só devolve à disponibilidade a reserva que ESTE pedido criou
      v_consome_reserva := least(greatest(p_reservado, 0), v_inv.quantidade_reservada);
      v_delta_total   := -p_quantidade;
      v_delta_reserva := -v_consome_reserva;
  end case;

  if (v_inv.quantidade_total + v_delta_total) < 0 then
    raise exception 'Estoque insuficiente: tem % unidades, pediu %',
      v_inv.quantidade_total, p_quantidade;
  end if;

  if (v_inv.quantidade_total + v_delta_total)
     - (v_inv.quantidade_reservada + v_delta_reserva) < 0 then
    raise exception 'Estoque disponível insuficiente: % livres (% reservadas para outros pedidos)',
      v_inv.quantidade_total - v_inv.quantidade_reservada, v_inv.quantidade_reservada;
  end if;

  update inventory set
    quantidade_total     = quantidade_total + v_delta_total,
    quantidade_reservada = greatest(0, quantidade_reservada + v_delta_reserva),
    custo_medio = case
      when p_tipo = 'entrada' and p_custo_unitario is not null and (quantidade_total + v_delta_total) > 0
      then ((custo_medio * quantidade_total) + (p_custo_unitario * p_quantidade)) / (quantidade_total + v_delta_total)
      else custo_medio end,
    updated_at = now()
  where id = v_inv.id
  returning * into v_inv;

  insert into inventory_movements (
    store_id, product_flavor_id, warehouse_id, tipo, quantidade,
    saldo_anterior, saldo_posterior, referencia_tipo, referencia_id,
    usuario_id, custo_unitario, observacao)
  values (
    v_store, p_product_flavor_id, v_inv.warehouse_id, p_tipo, p_quantidade,
    v_anterior, v_inv.quantidade_total - v_inv.quantidade_reservada,
    p_referencia_tipo, p_referencia_id, p_usuario_id, p_custo_unitario, p_observacao);

  return v_inv;
end $$;

-- ---------------------------------------------------------------------
-- 3) Confirmar pedido fecha o carrinho que o originou.
--    Sem isso, a rotina de expiração liberaria depois uma reserva que a
--    venda já consumiu — movimento falso e reserva corrompida.
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

  -- PIX só confirma com o dinheiro na conta
  if v_order.forma_pagamento = 'pix' and v_order.status_pagamento <> 'aprovado' then
    raise exception 'PIX ainda não foi aprovado: o pedido não pode ser confirmado';
  end if;

  select * into v_cart from carts
   where conversation_id = v_order.conversation_id and status = 'ativo'
   order by created_at desc limit 1;

  for v_item in select * from order_items where order_id = p_order_id loop
    if v_item.product_flavor_id is not null then
      -- o que este carrinho já tinha reservado deste item
      select coalesce(sum(ci.quantidade), 0) into v_reservado
        from cart_items ci
       where ci.cart_id = v_cart.id
         and ci.product_flavor_id = v_item.product_flavor_id
         and ci.reservado;

      perform mover_estoque(
        v_item.product_flavor_id, 'venda', v_item.quantidade,
        'order', p_order_id::text, p_usuario_id,
        'Baixa por confirmação de pedido', null, v_reservado);
    end if;
  end loop;

  -- o carrinho vira histórico: nada mais o expira nem libera reserva
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

-- a conta a receber é uma por pedido — o ON CONFLICT acima dependia disto
create unique index if not exists idx_ar_order_unico
  on accounts_receivable (order_id) where order_id is not null;

-- ---------------------------------------------------------------------
-- 4) Liberar reservas: um carrinho com problema não pode travar os outros.
-- ---------------------------------------------------------------------
create or replace function liberar_reservas_expiradas() returns integer
language plpgsql security definer as $$
declare v_cart carts; v_item cart_items; v_count integer := 0;
begin
  for v_cart in select * from carts where status = 'ativo' and expires_at < now() loop
    begin
      for v_item in select * from cart_items where cart_id = v_cart.id and reservado loop
        perform mover_estoque(v_item.product_flavor_id, 'liberacao_reserva',
          v_item.quantidade, 'cart', v_cart.id::text, null, 'Carrinho expirado');
        update cart_items set reservado = false where id = v_item.id;
        v_count := v_count + 1;
      end loop;
      update carts set status = 'expirado' where id = v_cart.id;
    exception when others then
      -- segue para o próximo carrinho em vez de abortar a rotina inteira
      raise warning 'Falha ao liberar o carrinho %: %', v_cart.id, sqlerrm;
    end;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 5) Cancelar pedido: dinheiro já recebido vira ESTORNO, não some.
-- ---------------------------------------------------------------------
create or replace function cancelar_pedido(
  p_order_id uuid, p_motivo text, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare v_order orders; v_item order_items; v_recebido numeric;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido = 'cancelado' then return v_order; end if;

  if v_order.status_pedido in ('confirmado','em_separacao','saiu_para_entrega','entregue') then
    for v_item in select * from order_items where order_id = p_order_id loop
      if v_item.product_flavor_id is not null then
        perform mover_estoque(v_item.product_flavor_id, 'cancelamento', v_item.quantidade,
          'order', p_order_id::text, p_usuario_id, 'Devolução por cancelamento');
      end if;
    end loop;
  end if;

  update orders set status_pedido = 'cancelado', cancelado_em = now(),
    motivo_cancelamento = p_motivo where id = p_order_id returning * into v_order;

  -- o que ainda não entrou é só cancelado
  update accounts_receivable set status = 'cancelado'
   where order_id = p_order_id and status = 'pendente';

  -- o que JÁ entrou precisa de contrapartida: sumir com dinheiro recebido
  -- do financeiro é como perder o registro de uma devolução
  select coalesce(sum(valor), 0) into v_recebido
    from accounts_receivable where order_id = p_order_id and status = 'pago';

  if v_recebido > 0 then
    insert into accounts_payable (
      store_id, categoria_id, descricao, valor, vencimento, status, observacao)
    values (
      v_order.store_id,
      (select id from financial_categories
        where store_id = v_order.store_id and tipo = 'despesa' order by nome limit 1),
      'Estorno do pedido ' || v_order.numero_pedido,
      v_recebido, current_date, 'pendente',
      coalesce(p_motivo, 'Pedido cancelado após o pagamento'));

    update payments set status = 'estornado'
     where order_id = p_order_id and status = 'aprovado';
  end if;

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- 6) Métricas do cliente só contam venda que aconteceu de verdade.
-- ---------------------------------------------------------------------
create or replace function recalcular_cliente() returns trigger language plpgsql as $$
declare v_cid uuid;
begin
  v_cid := coalesce(new.customer_id, old.customer_id);
  if v_cid is null then return new; end if;

  update customers c set
    total_pedidos  = s.qtd,
    total_comprado = s.valor,
    ticket_medio   = case when s.qtd > 0 then s.valor / s.qtd else 0 end,
    ultima_compra  = s.ultima,
    primeira_compra = coalesce(c.primeira_compra, s.primeira)
  from (
    select count(*) qtd, coalesce(sum(total),0) valor,
           max(created_at) ultima, min(created_at) primeira
      from orders
     where customer_id = v_cid
       -- pendente e aguardando pagamento ainda não são compra
       and status_pedido in ('confirmado','em_separacao','saiu_para_entrega','entregue')
  ) s where c.id = v_cid;

  return new;
end $$;
