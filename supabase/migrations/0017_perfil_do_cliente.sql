-- =====================================================================
-- 0017 — o perfil do cliente: o que ele disse que gosta e o que ele compra
--
-- Até aqui o bot sabia uma coisa sobre quem voltava: "já comprou, sim ou
-- não". A ficha do painel calculava o mais comprado, mas o bot não lia.
--
-- Duas fontes, de propósito separadas:
--   * DECLARADO — colunas em customers, gravadas quando o cliente diz
--     ("gosto de gelado", "curto Ignite", "uns 10 mil puffs") ou escolhe.
--   * DEDUZIDO  — a view v_perfil_cliente, calculada das compras de verdade.
--     View e não coluna: pedido cancelado, troca e edição mudam o histórico,
--     e um número gravado envelheceria sem ninguém perceber.
-- =====================================================================

alter table customers
  add column if not exists pref_marcas        text[] not null default '{}',
  add column if not exists pref_sabores       text[] not null default '{}',
  -- gelado, doce, fruta, menta, tabaco: o jeito como o cliente descreve
  add column if not exists pref_perfil_sabor  text[] not null default '{}',
  add column if not exists pref_puffs         integer,
  add column if not exists pref_atualizada_em timestamptz;

create index if not exists idx_customers_pref_marcas  on customers using gin (pref_marcas);
create index if not exists idx_customers_pref_sabores on customers using gin (pref_sabores);

comment on column customers.pref_marcas is
  'Marcas que o cliente disse ou escolheu. O que ele de fato compra está em v_perfil_cliente.';
comment on column customers.pref_puffs is
  'Quantidade de puffs que o cliente procura, aproximada (10000 = "uns 10k").';

-- ---------------------------------------------------------------------
-- O que as compras dizem. Cancelado não conta: não é gosto, é desistência.
-- ---------------------------------------------------------------------
create or replace view v_perfil_cliente as
with itens as (
  select
    o.customer_id, o.created_at,
    oi.marca_nome, oi.produto_nome, oi.sabor_nome, oi.product_flavor_id,
    oi.quantidade, p.puffs
  from orders o
  join order_items oi on oi.order_id = o.id
  left join product_flavors pf on pf.id = oi.product_flavor_id
  left join products p on p.id = pf.product_id
  where o.customer_id is not null and o.status_pedido <> 'cancelado'
),
pedidos as (
  select customer_id, forma_pagamento, created_at, id, address_id
  from orders
  where customer_id is not null and status_pedido <> 'cancelado'
)
select
  c.id as customer_id,
  c.store_id,
  (select i.marca_nome from itens i
    where i.customer_id = c.id and i.marca_nome is not null
    group by i.marca_nome order by sum(i.quantidade) desc, max(i.created_at) desc
    limit 1) as marca_mais_comprada,
  (select i.produto_nome from itens i
    where i.customer_id = c.id
    group by i.produto_nome order by sum(i.quantidade) desc, max(i.created_at) desc
    limit 1) as produto_mais_comprado,
  (select i.sabor_nome from itens i
    where i.customer_id = c.id and i.sabor_nome is not null
    group by i.sabor_nome order by sum(i.quantidade) desc, max(i.created_at) desc
    limit 1) as sabor_mais_comprado,
  (select round(avg(i.puffs))::integer from itens i
    where i.customer_id = c.id and i.puffs is not null) as puffs_medio,
  (select p.forma_pagamento from pedidos p
    where p.customer_id = c.id
    group by p.forma_pagamento order by count(*) desc, max(p.created_at) desc
    limit 1) as forma_pagamento_habitual,
  (select p.id from pedidos p
    where p.customer_id = c.id order by p.created_at desc limit 1) as ultimo_pedido_id,
  (select p.address_id from pedidos p
    where p.customer_id = c.id and p.address_id is not null
    order by p.created_at desc limit 1) as ultimo_endereco_id
from customers c
where c.deleted_at is null;

-- respeita a RLS de quem consulta, como as outras views desde a 0014
alter view v_perfil_cliente set (security_invoker = on);

comment on view v_perfil_cliente is
  'Perfil deduzido das compras não canceladas: o que mais compra, quantos puffs, como paga e onde recebe.';
