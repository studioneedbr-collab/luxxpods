-- =====================================================================
-- LUXX PODS — 0015 QUATRO DEFEITOS QUE A VARREDURA ACHOU
--
-- Nenhum deles aparece em build, lint ou teste unitário. Todos aparecem
-- quando alguém vende.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) A RESERVA PRESA QUANDO O PIX NÃO É PAGO
--
-- `criar_pedido` deixa `cart_items.reservado = true` de propósito: é a
-- reserva que segura a peça enquanto o PIX não cai. Quem limpa esse marcador
-- é só `confirmar_pedido`.
--
-- Então o PIX abandonado e cancelado deixava a reserva presa PARA SEMPRE:
-- `cancelar_pedido` só devolve estoque de pedido já confirmado, e a rotina
-- que libera reserva expirada olha apenas carrinho 'ativo' — e o carrinho
-- virou 'convertido' na criação do pedido.
--
-- Depois de alguns PIX abandonados o sistema diz "esgotado" com produto na
-- prateleira: o bot para de oferecer e a tela de venda para de listar. Mesmo
-- efeito do defeito que a 0013 corrigiu, por outra porta.
-- ---------------------------------------------------------------------
create or replace function cancelar_pedido(
  p_order_id uuid, p_motivo text, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare
  v_order orders;
  v_item order_items;
  v_recebido numeric;
  v_ci record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido = 'cancelado' then return v_order; end if;

  -- pedido já confirmado: a peça saiu do total, então volta pelo total
  if v_order.status_pedido in ('confirmado','em_separacao','saiu_para_entrega','entregue') then
    for v_item in select * from order_items where order_id = p_order_id loop
      if v_item.product_flavor_id is not null then
        perform mover_estoque(v_item.product_flavor_id, 'cancelamento', v_item.quantidade,
          'order', p_order_id::text, p_usuario_id, 'Devolução por cancelamento');
      end if;
    end loop;

  -- pedido AINDA NÃO confirmado (PIX aguardando, ou pendente): a peça nunca
  -- saiu do total, ela está RESERVADA. Liberar a reserva é o que devolve a
  -- unidade à disponibilidade — sem isto ela fica presa para sempre.
  else
    for v_ci in
      select ci.product_flavor_id, ci.quantidade
        from cart_items ci
       where ci.cart_id = v_order.cart_id and ci.reservado
    loop
      begin
        perform mover_estoque(v_ci.product_flavor_id, 'liberacao_reserva',
          v_ci.quantidade, 'order_cancelado', p_order_id::text, p_usuario_id,
          'Reserva liberada por cancelamento antes da confirmação');
      exception when others then
        raise warning 'Não liberei a reserva de % no pedido %: %',
          v_ci.product_flavor_id, p_order_id, sqlerrm;
      end;
    end loop;

    if v_order.cart_id is not null then
      update cart_items set reservado = false where cart_id = v_order.cart_id;
    end if;
  end if;

  update orders set status_pedido = 'cancelado', cancelado_em = now(),
    motivo_cancelamento = p_motivo where id = p_order_id returning * into v_order;

  update accounts_receivable set status = 'cancelado'
   where order_id = p_order_id and status = 'pendente';

  select coalesce(sum(valor), 0) into v_recebido
    from accounts_receivable where order_id = p_order_id and status = 'pago';

  if v_recebido > 0 then
    insert into accounts_payable (
      store_id, categoria_id, descricao, valor, vencimento, status, observacao)
    values (
      v_order.store_id,
      (select id from financial_categories
        where store_id = v_order.store_id and tipo = 'despesa'
          and status = 'ativo' and nome = 'Outros' limit 1),
      'Estorno do pedido ' || v_order.numero_pedido,
      v_recebido, current_date, 'pendente',
      coalesce(p_motivo, 'Pedido cancelado após o pagamento'));

    update payments set status = 'estornado'
     where order_id = p_order_id and status = 'aprovado';
  end if;

  return v_order;
end $$;

-- conserta as reservas já presas por cancelamento anterior
do $$
declare v_ci record;
begin
  for v_ci in
    select ci.id, ci.product_flavor_id, ci.quantidade, o.numero_pedido
      from cart_items ci
      join carts ca on ca.id = ci.cart_id
      join orders o on o.cart_id = ca.id
     where ci.reservado and o.status_pedido = 'cancelado'
  loop
    begin
      perform mover_estoque(v_ci.product_flavor_id, 'liberacao_reserva',
        v_ci.quantidade, 'conserto_0015', v_ci.numero_pedido, null,
        'Reserva presa por pedido cancelado antes da confirmação');
      update cart_items set reservado = false where id = v_ci.id;
    exception when others then
      raise warning 'conserto 0015: item % não liberou: %', v_ci.id, sqlerrm;
    end;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2) O MESMO `ON CONFLICT` COM ÍNDICE PARCIAL, AGORA EM `payments`
--
-- A 0012 consertou isso em `accounts_receivable` e deixou passar aqui. O
-- índice da 0004 é `... where transaction_id is not null`, e três upserts
-- usam `onConflict: "gateway,transaction_id"`. O Postgres não infere
-- conflito por índice parcial: responde 42P10 e o upsert falha.
--
-- Como o retorno desses upserts é descartado no código, NENHUM pagamento era
-- gravado em `payments` e ninguém via erro. Consequências à distância: PIX
-- aprovado sem registro de pagamento, o caminho do webhook que acha o pedido
-- pelo id do QR nunca encontrava nada, e a checagem de pagamento em
-- duplicidade lia uma tabela sempre vazia.
--
-- NULL é distinto de NULL num índice único, então o predicado era
-- desnecessário: várias linhas sem transação continuam convivendo.
-- ---------------------------------------------------------------------
drop index if exists idx_pay_txid;

create unique index if not exists idx_pay_txid
  on payments (gateway, transaction_id);

comment on index idx_pay_txid is
  'Um pagamento por (gateway, transação). Sem predicado de propósito: índice parcial não serve para inferir ON CONFLICT, e NULL já é distinto num único comum.';


-- ---------------------------------------------------------------------
-- 3) ENTREGA PAGA EM CARTÃO OU TRANSFERÊNCIA NÃO ERA REGISTRADA
--
-- `receber_na_entrega` estava certa; quem a chamava só chamava para
-- `forma_pagamento = 'dinheiro'`. Maquininha na porta e transferência na hora
-- ficavam com `status_pagamento = 'aguardando'` e a conta a receber pendente
-- para sempre — o mesmo defeito que a 0009 corrigiu, corrigido só para
-- dinheiro.
--
-- A função passa a saber quais formas são "pagas na entrega", para a regra
-- morar num lugar só em vez de depender de quem chama lembrar.
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

  -- PIX é a exceção: ele confirma por webhook, não na mão do entregador.
  -- Dinheiro, cartão e transferência são recebidos na porta.
  if v_order.forma_pagamento = 'pix' then
    return v_order;
  end if;

  update orders set status_pagamento = 'aprovado'
   where id = p_order_id returning * into v_order;

  update accounts_receivable
     set status = 'pago', pagamento = current_date
   where order_id = p_order_id and status = 'pendente';

  insert into payments (store_id, order_id, metodo, valor, status, pago_em, gateway, transaction_id)
  values (v_order.store_id, p_order_id, v_order.forma_pagamento, v_order.total,
          'aprovado', now(), 'entrega', p_order_id::text)
  on conflict (gateway, transaction_id) do nothing;

  insert into order_status_history (order_id, status_anterior, novo_status, usuario_id, origem, observacao)
  values (p_order_id, 'aguardando', 'aprovado', p_usuario_id, 'operador',
          'Recebido na entrega em ' || v_order.forma_pagamento::text);

  return v_order;
end $$;


-- ---------------------------------------------------------------------
-- 4) O LUCRO BRUTO DESCONTAVA O DESCONTO DUAS VEZES
--
-- `orders.total` já é `subtotal + entrega − desconto` (criar_pedido grava
-- assim). E a métrica fazia `sum(total − custo_total − desconto)`, tirando o
-- desconto de novo.
--
-- Dava para ver na tela: o painel "Composição do resultado" desenha
-- Faturamento − CMV e logo abaixo imprimia um lucro bruto que não fechava
-- com essa subtração — errado exatamente pelo desconto do período. A margem
-- herdava o erro.
-- ---------------------------------------------------------------------
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
    -- total JÁ tem o desconto abatido; tirar de novo mentia para baixo
    'lucro_bruto',        (select coalesce(sum(total - custo_total),0) from validos),
    'desconto_concedido', (select coalesce(sum(desconto),0) from validos),
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

grant execute on function dashboard_metricas(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function cancelar_pedido(uuid, text, uuid) to authenticated;
grant execute on function receber_na_entrega(uuid, uuid) to authenticated;
