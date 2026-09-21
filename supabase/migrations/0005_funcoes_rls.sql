-- =====================================================================
-- LUXX PODS — 0005 FUNÇÕES CRÍTICAS, VIEWS, RLS E REALTIME
-- =====================================================================

-- ---------------------------------------------------------------------
-- MOVIMENTAÇÃO DE ESTOQUE ATÔMICA (nenhuma alteração sem histórico)
-- ---------------------------------------------------------------------
create or replace function mover_estoque(
  p_product_flavor_id uuid,
  p_tipo movimento_tipo,
  p_quantidade integer,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_usuario_id uuid default null,
  p_observacao text default null,
  p_custo_unitario numeric default null
) returns inventory
language plpgsql security definer as $$
declare
  v_inv inventory;
  v_store uuid;
  v_wh uuid;
  v_anterior integer;
  v_delta_total integer := 0;
  v_delta_reserva integer := 0;
begin
  if p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;

  select pf.store_id into v_store from product_flavors pf where pf.id = p_product_flavor_id;
  if v_store is null then raise exception 'Produto/sabor inexistente'; end if;
  select w.id into v_wh from warehouses w
    join stores s on s.id = w.store_id
   where s.id = v_store and w.principal limit 1;

  -- lock pessimista da linha de estoque
  select * into v_inv from inventory
   where product_flavor_id = p_product_flavor_id
   for update;

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
    when 'venda'              then v_delta_total := -p_quantidade; v_delta_reserva := -p_quantidade;
  end case;

  -- REGRA CRÍTICA: nunca vender mais do que existe
  if (v_inv.quantidade_total + v_delta_total) < 0 then
    raise exception 'Estoque insuficiente (total % , solicitado %)', v_inv.quantidade_total, p_quantidade;
  end if;
  if (v_inv.quantidade_total + v_delta_total) - (v_inv.quantidade_reservada + v_delta_reserva) < 0 then
    raise exception 'Estoque disponível insuficiente: % disponível', v_inv.quantidade_total - v_inv.quantidade_reservada;
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
-- CONFIRMAR PEDIDO — transação completa (estoque + financeiro + lead)
-- ---------------------------------------------------------------------
create or replace function confirmar_pedido(p_order_id uuid, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare
  v_order orders;
  v_item  order_items;
  v_cat   uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido not in ('pendente','aguardando_pagamento') then
    return v_order; -- idempotente
  end if;

  -- baixa de estoque item a item (usa reserva quando existir)
  for v_item in select * from order_items where order_id = p_order_id loop
    if v_item.product_flavor_id is not null then
      perform mover_estoque(
        v_item.product_flavor_id, 'venda', v_item.quantidade,
        'order', p_order_id::text, p_usuario_id, 'Baixa por confirmação de pedido');
    end if;
  end loop;

  update orders set
    status_pedido  = 'confirmado',
    confirmado_em  = coalesce(confirmado_em, now())
  where id = p_order_id returning * into v_order;

  -- conta a receber
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
    case when v_order.status_pagamento = 'aprovado' then 'pago'::financeiro_status else 'pendente'::financeiro_status end)
  on conflict do nothing;

  -- fila de impressão da comanda
  insert into jobs (store_id, tipo, payload) values
    (v_order.store_id, 'imprimir_pedido', jsonb_build_object('order_id', p_order_id));

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- CANCELAR PEDIDO — devolve estoque
-- ---------------------------------------------------------------------
create or replace function cancelar_pedido(p_order_id uuid, p_motivo text, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare v_order orders; v_item order_items;
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

  update accounts_receivable set status = 'cancelado' where order_id = p_order_id;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- LIBERAR RESERVAS EXPIRADAS (job periódico)
-- ---------------------------------------------------------------------
create or replace function liberar_reservas_expiradas() returns integer
language plpgsql security definer as $$
declare v_cart carts; v_item cart_items; v_count integer := 0;
begin
  for v_cart in select * from carts where status = 'ativo' and expires_at < now() loop
    for v_item in select * from cart_items where cart_id = v_cart.id and reservado loop
      perform mover_estoque(v_item.product_flavor_id, 'liberacao_reserva', v_item.quantidade,
        'cart', v_cart.id::text, null, 'Carrinho expirado');
      update cart_items set reservado = false where id = v_item.id;
      v_count := v_count + 1;
    end loop;
    update carts set status = 'expirado' where id = v_cart.id;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- AGREGAÇÃO DE CLIENTE após pedido entregue/pago
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
    select count(*) qtd, coalesce(sum(total),0) valor, max(created_at) ultima, min(created_at) primeira
    from orders where customer_id = v_cid and status_pedido <> 'cancelado'
  ) s where c.id = v_cid;
  return new;
end $$;
drop trigger if exists trg_recalc_cliente on orders;
create trigger trg_recalc_cliente after insert or update of status_pedido, total on orders
for each row execute function recalcular_cliente();

-- =====================================================================
-- VIEWS DE DASHBOARD
-- =====================================================================
create or replace view v_pedidos_resumo as
select o.*,
  (select count(*) from order_items oi where oi.order_id = o.id) as itens_count,
  (select coalesce(sum(oi.quantidade),0) from order_items oi where oi.order_id = o.id) as itens_qtd,
  o.total - o.custo_total - o.desconto as lucro_estimado
from orders o;

create or replace view v_estoque_resumo as
select
  store_id,
  count(*)                                           as skus,
  coalesce(sum(estoque_total),0)                     as pecas,
  coalesce(sum(estoque_total * custo_medio),0)       as custo_estoque,
  coalesce(sum(estoque_total * preco),0)             as valor_venda_potencial,
  count(*) filter (where estoque_disponivel <= 0)    as sem_estoque,
  count(*) filter (where estoque_disponivel > 0 and estoque_disponivel <= estoque_minimo) as estoque_baixo
from v_catalogo group by store_id;

create or replace view v_funil as
select
  ps.store_id, ps.id as stage_id, ps.nome, ps.slug, ps.ordem, ps.cor, ps.tipo,
  count(l.id) as leads,
  coalesce(sum(l.valor_estimado),0) as valor
from pipeline_stages ps
left join leads l on l.stage_id = ps.id and l.status = 'aberto'
where ps.status = 'ativo'
group by ps.store_id, ps.id, ps.nome, ps.slug, ps.ordem, ps.cor, ps.tipo;

-- métricas do período (usadas pelo dashboard)
create or replace function dashboard_metricas(
  p_store_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns jsonb language sql stable as $$
  with ped as (
    select * from orders
     where store_id = p_store_id and created_at between p_inicio and p_fim
  ), validos as (
    select * from ped where status_pedido <> 'cancelado'
  ), conv as (
    select * from conversations
     where store_id = p_store_id and created_at between p_inicio and p_fim
  ), lds as (
    select * from leads where store_id = p_store_id and created_at between p_inicio and p_fim
  )
  select jsonb_build_object(
    'faturamento',        (select coalesce(sum(total),0) from validos),
    'cmv',                (select coalesce(sum(custo_total),0) from validos),
    'lucro_bruto',        (select coalesce(sum(total - custo_total - desconto),0) from validos),
    'pedidos',            (select count(*) from validos),
    'pedidos_cancelados', (select count(*) from ped where status_pedido = 'cancelado'),
    'pedidos_despachados',(select count(*) from validos where status_pedido = 'saiu_para_entrega'),
    'pedidos_entregues',  (select count(*) from validos where status_pedido = 'entregue'),
    'ticket_medio',       (select case when count(*) > 0 then coalesce(sum(total),0)/count(*) else 0 end from validos),
    'clientes_novos',     (select count(*) from customers where store_id = p_store_id and created_at between p_inicio and p_fim),
    'clientes_total',     (select count(*) from customers where store_id = p_store_id and deleted_at is null),
    'clientes_recorrentes',(select count(*) from customers where store_id = p_store_id and total_pedidos > 1),
    'leads',              (select count(*) from lds),
    'leads_ganhos',       (select count(*) from lds where status = 'ganho'),
    'leads_perdidos',     (select count(*) from lds where status = 'perdido'),
    'conversas',          (select count(*) from conv),
    'conversas_abertas',  (select count(*) from conversations where store_id = p_store_id and status = 'aberta'),
    'conversas_aguardando',(select count(*) from conversations where store_id = p_store_id and status = 'aguardando_cliente'),
    'conversas_nao_respondidas',(select count(*) from conversations where store_id = p_store_id and nao_lidas > 0),
    'mensagens_recebidas',(select count(*) from messages m join conversations c on c.id = m.conversation_id
                            where c.store_id = p_store_id and m.sender_type = 'cliente'
                              and m.created_at between p_inicio and p_fim),
    'taxa_conversao',     (select case when (select count(*) from lds) > 0
                              then round(100.0 * (select count(*) from lds where status='ganho') / (select count(*) from lds), 1)
                              else 0 end),
    'taxa_cancelamento',  (select case when (select count(*) from ped) > 0
                              then round(100.0 * (select count(*) from ped where status_pedido='cancelado') / (select count(*) from ped), 1)
                              else 0 end),
    'tempo_primeira_resposta', (select coalesce(round(avg(extract(epoch from (primeira_resposta_em - created_at))/60)::numeric,1),0)
                                from conv where primeira_resposta_em is not null),
    'faturamento_bot',    (select coalesce(sum(total),0) from validos where origem = 'bot')
  )
$$;

-- série diária para gráficos
create or replace function dashboard_serie(
  p_store_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (dia date, faturamento numeric, pedidos bigint, leads bigint)
language sql stable as $$
  select d::date,
    coalesce((select sum(o.total) from orders o where o.store_id = p_store_id
              and o.status_pedido <> 'cancelado' and o.created_at::date = d::date),0),
    coalesce((select count(*) from orders o where o.store_id = p_store_id
              and o.status_pedido <> 'cancelado' and o.created_at::date = d::date),0),
    coalesce((select count(*) from leads l where l.store_id = p_store_id
              and l.created_at::date = d::date),0)
  from generate_series(p_inicio::date, p_fim::date, interval '1 day') d
$$;

-- =====================================================================
-- RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'companies','stores','warehouses','roles','permissions','role_permissions','profiles',
    'user_permissions','settings','audit_logs','notifications','customers','customer_addresses',
    'pipeline_stages','conversations','leads','messages','tasks','calendar_events','brands',
    'categories','products','flavors','product_flavors','inventory','inventory_movements',
    'suppliers','purchase_entries','purchase_entry_items','carts','cart_items','coupons',
    'coupon_targets','orders','order_items','order_status_history','payments','webhook_events',
    'bank_accounts','financial_categories','accounts_receivable','accounts_payable','exchanges',
    'exchange_files','upsell_rules','upsell_events','automations','jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_auth_all on %I', t);
    execute format(
      'create policy p_auth_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- =====================================================================
-- REALTIME
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'conversations','messages','orders','order_items','leads','inventory',
    'notifications','tasks','payments','customers','products','product_flavors'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; when undefined_object then null; end;
  end loop;
end $$;

alter table messages replica identity full;
alter table conversations replica identity full;
alter table orders replica identity full;
alter table leads replica identity full;
alter table inventory replica identity full;
