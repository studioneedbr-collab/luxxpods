-- =====================================================================
-- 0018 — segurança, velocidade e duas contas que saíam erradas
--
-- Achados da auditoria de 28/10/2026:
--
--   1. As funções que mexem em estoque, pedido e dinheiro são `security
--      definer` e estavam liberadas para QUALQUER sessão logada, sem
--      conferir o perfil. Um entregador com a chave pública e o próprio
--      login zerava estoque com mover_estoque ou cancelava pedido. Agora
--      só a chave de serviço executa; o painel chama pelo servidor depois
--      de conferir o perfil (src/lib/rpc-autorizada.ts).
--   2. Qualquer usuário podia editar o PRÓPRIO perfil inteiro — inclusive
--      role_id. Um gatilho barra perfil, loja e situação para quem não é
--      administrador.
--   3. As políticas chamavam tem_perfil() por LINHA. Com `(select …)` o
--      Postgres avalia uma vez por consulta (padrão documentado do Supabase).
--   4. v_perfil_cliente materializava os pedidos da loja inteira para cada
--      cliente; reescrita com LATERAL, só lê os pedidos de quem consulta.
--   5. Reabrir nota de entrada com o fornecedor já pago e concluir de novo
--      criava uma segunda conta a pagar.
--   6. O banco calculava "hoje" (current_date) em UTC: depois das 21h de
--      Brasília, vencimento e recebimento caíam no dia seguinte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FUNÇÕES CRÍTICAS: só a chave de serviço
-- ---------------------------------------------------------------------

-- o que nasceu depois da 0014 recebeu o privilégio padrão do Supabase, que
-- inclui `anon` — finalizar_troca e reabrir_troca estavam abertos sem login
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('revoke all on function %s from anon', f.assinatura);
  end loop;
end $$;

-- função criada daqui para frente não nasce aberta
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

do $$
declare
  f record;
  criticas text[] := array[
    'abrir_carrinho', 'adicionar_ao_carrinho', 'remover_do_carrinho',
    'recalcular_carrinho', 'criar_pedido', 'confirmar_pedido',
    'cancelar_pedido', 'receber_na_entrega', 'mover_estoque',
    'concluir_nota_entrada', 'reabrir_nota_entrada',
    'finalizar_troca', 'reabrir_troca'
  ];
  -- o que a sessão do painel continua chamando direto: identidade (as
  -- políticas dependem) e leitura do painel
  da_sessao text[] := array[
    'meu_perfil', 'minha_loja', 'tem_perfil', 'posso',
    'dashboard_metricas', 'dashboard_serie'
  ];
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname as nome
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    if f.nome = any(criticas) then
      execute format('revoke execute on function %s from authenticated', f.assinatura);
      execute format('grant execute on function %s to service_role', f.assinatura);
    elsif f.nome = any(da_sessao) then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) NINGUÉM SE PROMOVE A ADMINISTRADOR
-- ---------------------------------------------------------------------
create or replace function proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- a chave de serviço (criação de usuário pelo servidor) não tem auth.uid()
  if auth.uid() is null or tem_perfil('admin') then
    return new;
  end if;

  if new.role_id is distinct from old.role_id
     or new.store_id is distinct from old.store_id
     or new.company_id is distinct from old.company_id
     or new.status is distinct from old.status
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Só o administrador muda perfil, loja ou situação de um usuário';
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_perfil on profiles;
create trigger trg_proteger_perfil before update on profiles
  for each row execute function proteger_perfil();

-- ---------------------------------------------------------------------
-- 3) POLÍTICAS AVALIADAS UMA VEZ POR CONSULTA
--
-- Mesmos grupos e mesmas regras da 0010 — só o `(select …)` em volta.
-- ---------------------------------------------------------------------
do $$
declare
  leitura text;
  escrita text;
  grupos jsonb := jsonb_build_object(
    'atendimento', jsonb_build_array(
      'customers','customer_addresses','conversations','messages','leads',
      'pipeline_stages','tasks','calendar_events'),
    'catalogo', jsonb_build_array(
      'brands','categories','products','flavors','product_flavors',
      'inventory','inventory_movements','suppliers','purchase_entries',
      'purchase_entry_items'),
    'vendas', jsonb_build_array(
      'orders','order_items','order_status_history','carts','cart_items',
      'coupons','coupon_targets','upsell_rules','upsell_events','exchanges',
      'exchange_files'),
    'financeiro', jsonb_build_array(
      'payments','accounts_receivable','accounts_payable','bank_accounts',
      'financial_categories'),
    'sistema', jsonb_build_array(
      'companies','stores','warehouses','roles','permissions','role_permissions',
      'user_permissions','settings','automations','jobs','webhook_events')
  );
  grupo text;
  tabela text;
begin
  for grupo in select jsonb_object_keys(grupos) loop
    for tabela in select * from jsonb_array_elements_text(grupos -> grupo) loop
      leitura := case grupo
        when 'atendimento' then $q$(select tem_perfil('admin','atendimento','operacional'))$q$
        when 'catalogo'    then $q$(select tem_perfil('admin','atendimento','operacional','financeiro'))$q$
        when 'vendas'      then $q$(select tem_perfil('admin','atendimento','operacional','financeiro','entregador'))$q$
        when 'financeiro'  then $q$(select tem_perfil('admin','financeiro'))$q$
        else                    $q$(select tem_perfil('admin'))$q$
      end;
      escrita := case grupo
        when 'atendimento' then $q$(select tem_perfil('admin','atendimento'))$q$
        when 'catalogo'    then $q$(select tem_perfil('admin','operacional'))$q$
        when 'vendas'      then $q$(select tem_perfil('admin','atendimento','operacional'))$q$
        when 'financeiro'  then $q$(select tem_perfil('admin','financeiro'))$q$
        else                    $q$(select tem_perfil('admin'))$q$
      end;

      execute format('drop policy if exists p_ler on %I', tabela);
      execute format('drop policy if exists p_criar on %I', tabela);
      execute format('drop policy if exists p_editar on %I', tabela);
      execute format('drop policy if exists p_apagar on %I', tabela);

      execute format('create policy p_ler on %I for select to authenticated using (%s)', tabela, leitura);
      execute format('create policy p_criar on %I for insert to authenticated with check (%s)', tabela, escrita);
      execute format('create policy p_editar on %I for update to authenticated using (%s) with check (%s)', tabela, escrita, escrita);
      execute format($f$create policy p_apagar on %I for delete to authenticated using ((select tem_perfil('admin')))$f$, tabela);
    end loop;
  end loop;
end $$;

-- audit_logs fica de fora do laço: a 0010 deu a ela regra própria (todos
-- escrevem, ninguém apaga); só a leitura de admin ganha o `(select …)`
drop policy if exists p_ler on audit_logs;
create policy p_ler on audit_logs for select to authenticated using ((select tem_perfil('admin')));

drop policy if exists p_perfil_ler on profiles;
drop policy if exists p_perfil_editar on profiles;
drop policy if exists p_perfil_admin on profiles;
create policy p_perfil_ler on profiles for select to authenticated
  using (id = (select auth.uid()) or (select tem_perfil('admin')));
create policy p_perfil_editar on profiles for update to authenticated
  using (id = (select auth.uid()) or (select tem_perfil('admin')))
  with check (id = (select auth.uid()) or (select tem_perfil('admin')));
create policy p_perfil_admin on profiles for insert to authenticated
  with check ((select tem_perfil('admin')));

-- ---------------------------------------------------------------------
-- 4) PERFIL DO CLIENTE SEM VARRER A LOJA INTEIRA
--
-- Mesmas colunas, mesma ordem: `create or replace view` exige.
-- ---------------------------------------------------------------------
create index if not exists idx_orders_cliente_data
  on orders (customer_id, created_at desc) where status_pedido <> 'cancelado';

create or replace view v_perfil_cliente as
select
  c.id as customer_id,
  c.store_id,
  marca.nome   as marca_mais_comprada,
  produto.nome as produto_mais_comprado,
  sabor.nome   as sabor_mais_comprado,
  puffs.medio  as puffs_medio,
  forma.f      as forma_pagamento_habitual,
  ultimo.id    as ultimo_pedido_id,
  endereco.id  as ultimo_endereco_id
from customers c
left join lateral (
  select oi.marca_nome as nome
    from orders o join order_items oi on oi.order_id = o.id
   where o.customer_id = c.id and o.status_pedido <> 'cancelado' and oi.marca_nome is not null
   group by oi.marca_nome order by sum(oi.quantidade) desc, max(o.created_at) desc limit 1
) marca on true
left join lateral (
  select oi.produto_nome as nome
    from orders o join order_items oi on oi.order_id = o.id
   where o.customer_id = c.id and o.status_pedido <> 'cancelado'
   group by oi.produto_nome order by sum(oi.quantidade) desc, max(o.created_at) desc limit 1
) produto on true
left join lateral (
  select oi.sabor_nome as nome
    from orders o join order_items oi on oi.order_id = o.id
   where o.customer_id = c.id and o.status_pedido <> 'cancelado' and oi.sabor_nome is not null
   group by oi.sabor_nome order by sum(oi.quantidade) desc, max(o.created_at) desc limit 1
) sabor on true
left join lateral (
  select round(avg(p.puffs))::integer as medio
    from orders o
    join order_items oi on oi.order_id = o.id
    join product_flavors pf on pf.id = oi.product_flavor_id
    join products p on p.id = pf.product_id
   where o.customer_id = c.id and o.status_pedido <> 'cancelado' and p.puffs is not null
) puffs on true
left join lateral (
  select o.forma_pagamento as f
    from orders o
   where o.customer_id = c.id and o.status_pedido <> 'cancelado'
   group by o.forma_pagamento order by count(*) desc, max(o.created_at) desc limit 1
) forma on true
left join lateral (
  select o.id from orders o
   where o.customer_id = c.id and o.status_pedido <> 'cancelado'
   order by o.created_at desc limit 1
) ultimo on true
left join lateral (
  select o.address_id as id from orders o
   where o.customer_id = c.id and o.status_pedido <> 'cancelado' and o.address_id is not null
   order by o.created_at desc limit 1
) endereco on true
where c.deleted_at is null;

alter view v_perfil_cliente set (security_invoker = on);
revoke all on v_perfil_cliente from anon;

-- ---------------------------------------------------------------------
-- 5) ÍNDICES DOS CAMINHOS QUENTES QUE FALTAVAM
-- ---------------------------------------------------------------------
-- cancelarJobs roda a cada mensagem do cliente: era varredura da tabela
create index if not exists idx_jobs_conversa_pendente
  on jobs (conversation_id, tipo) where status = 'pendente';
-- abrir_atendimento procura o lead aberto da conversa a cada mensagem
create index if not exists idx_leads_conversa_aberto
  on leads (conversation_id) where status = 'aberto';
create index if not exists idx_ar_loja_vencimento on accounts_receivable (store_id, vencimento);
create index if not exists idx_ap_loja_vencimento on accounts_payable (store_id, vencimento);
create index if not exists idx_cart_items_cart on cart_items (cart_id);
create index if not exists idx_exchanges_order on exchanges (order_id);

-- ---------------------------------------------------------------------
-- 6) NOTA DE ENTRADA: SEM SEGUNDA CONTA A PAGAR
-- ---------------------------------------------------------------------
create or replace function reabrir_nota_entrada(
  p_nota_id uuid,
  p_motivo text default null,
  p_usuario_id uuid default null
) returns purchase_entries
language plpgsql security definer as $$
declare
  v_nota purchase_entries;
  v_item purchase_entry_items;
  v_conta_paga boolean;
  v_freteiro_pago boolean;
begin
  select * into v_nota from purchase_entries where id = p_nota_id for update;
  if v_nota.id is null then raise exception 'Nota não encontrada'; end if;

  if not v_nota.estoque_aplicado then
    update purchase_entries set situacao = 'conferencia', status = 'rascunho'
     where id = p_nota_id returning * into v_nota;
    return v_nota;
  end if;

  for v_item in select * from purchase_entry_items where entry_id = p_nota_id loop
    perform mover_estoque(
      v_item.product_flavor_id, 'ajuste_negativo', v_item.quantidade,
      'purchase_entry_reabertura', p_nota_id::text, p_usuario_id,
      coalesce(p_motivo, 'Reabertura da nota de entrada'));

    if v_item.custo_medio_anterior is not null then
      update inventory set custo_medio = v_item.custo_medio_anterior, updated_at = now()
       where product_flavor_id = v_item.product_flavor_id;
    end if;
  end loop;

  select exists(select 1 from accounts_payable where id = v_nota.conta_pagar_id and status = 'pago')
    into v_conta_paga;
  select exists(select 1 from accounts_payable where id = v_nota.freteiro_conta_id and status = 'pago')
    into v_freteiro_pago;

  update accounts_payable set status = 'cancelado'
   where id in (v_nota.conta_pagar_id, v_nota.freteiro_conta_id)
     and status <> 'pago';

  -- a conta já paga continua ligada à nota: soltar o vínculo era o que
  -- fazia a próxima conclusão lançar a mesma despesa de novo
  update purchase_entries set
    situacao = 'conferencia', status = 'rascunho', estoque_aplicado = false,
    finalizada_em = null,
    conta_pagar_id    = case when v_conta_paga    then conta_pagar_id    else null end,
    freteiro_conta_id = case when v_freteiro_pago then freteiro_conta_id else null end
  where id = p_nota_id
  returning * into v_nota;

  return v_nota;
end $$;

create or replace function concluir_nota_entrada(
  p_nota_id uuid,
  p_usuario_id uuid default null
) returns purchase_entries
language plpgsql security definer as $$
declare
  v_nota  purchase_entries;
  v_item  purchase_entry_items;
  v_total numeric(12,2) := 0;
  v_cat_mercadoria uuid;
  v_cat_freteiro   uuid;
  v_conta uuid;
  v_freteiro_valor numeric(12,2);
  v_custo_com_freteiro numeric(12,2);
  v_itens integer;
begin
  select * into v_nota from purchase_entries where id = p_nota_id for update;
  if v_nota.id is null then raise exception 'Nota não encontrada'; end if;

  if v_nota.situacao = 'concluida' or v_nota.estoque_aplicado then
    return v_nota;
  end if;
  if v_nota.situacao = 'cancelada' then
    raise exception 'Nota cancelada não pode ser concluída';
  end if;

  select count(*) into v_itens from purchase_entry_items where entry_id = p_nota_id;
  if v_itens = 0 then
    raise exception 'Nota sem itens: nada para dar entrada';
  end if;

  for v_item in select * from purchase_entry_items where entry_id = p_nota_id loop
    update purchase_entry_items pei set custo_medio_anterior = coalesce(
      (select i.custo_medio from inventory i
        where i.product_flavor_id = v_item.product_flavor_id), 0)
     where pei.id = v_item.id;

    v_custo_com_freteiro :=
      v_item.custo_unitario * (1 + coalesce(v_nota.freteiro_pct, 0) / 100.0);

    perform mover_estoque(
      v_item.product_flavor_id, 'entrada', v_item.quantidade,
      'purchase_entry', p_nota_id::text, p_usuario_id,
      'Entrada pela nota ' || coalesce(v_nota.numero_documento, '(sem número)'),
      v_custo_com_freteiro);

    v_total := v_total + (v_item.quantidade * v_item.custo_unitario);
  end loop;

  update purchase_entries set
    situacao = 'concluida', status = 'finalizada', estoque_aplicado = true,
    valor_total = v_total, finalizada_em = now(),
    conferencia_concluida_em = coalesce(conferencia_concluida_em, now())
  where id = p_nota_id
  returning * into v_nota;

  select id into v_cat_mercadoria from financial_categories
   where store_id = v_nota.store_id and tipo = 'despesa' and nome = 'Mercadoria'
     and status = 'ativo' limit 1;
  select id into v_cat_freteiro from financial_categories
   where store_id = v_nota.store_id and tipo = 'despesa' and nome = 'Motoboy'
     and status = 'ativo' limit 1;

  -- sem o bloco que engolia o erro: antes o estoque entrava, a conta a
  -- pagar não, e a tela dizia que deu certo. Agora a conclusão inteira
  -- volta e o operador vê o motivo.
  if v_nota.conta_pagar_id is null then
    insert into accounts_payable (
      store_id, supplier_id, categoria_id, descricao, valor,
      vencimento, documento, status)
    values (
      v_nota.store_id, v_nota.supplier_id, v_cat_mercadoria,
      'Nota ' || coalesce(v_nota.numero_documento, 'sem número'),
      v_total, coalesce(v_nota.vencimento, current_date),
      v_nota.numero_documento, 'pendente')
    returning id into v_conta;
    update purchase_entries set conta_pagar_id = v_conta where id = p_nota_id;
  end if;

  if coalesce(v_nota.freteiro_pct, 0) > 0 and v_nota.freteiro_conta_id is null then
    v_freteiro_valor := round(v_total * v_nota.freteiro_pct / 100.0, 2);
    insert into accounts_payable (
      store_id, categoria_id, descricao, valor, vencimento, status)
    values (
      v_nota.store_id, v_cat_freteiro,
      'Freteiro da nota ' || coalesce(v_nota.numero_documento, 'sem número'),
      v_freteiro_valor,
      coalesce(v_nota.freteiro_vencimento, v_nota.vencimento, current_date),
      'pendente')
    returning id into v_conta;
    update purchase_entries set freteiro_conta_id = v_conta where id = p_nota_id;
  end if;

  select * into v_nota from purchase_entries where id = p_nota_id;
  return v_nota;
end $$;

-- create or replace mantém os privilégios, mas a função foi recriada aqui:
-- reafirma que só a chave de serviço executa
revoke execute on function concluir_nota_entrada(uuid, uuid) from authenticated, anon, public;
revoke execute on function reabrir_nota_entrada(uuid, text, uuid) from authenticated, anon, public;
grant execute on function concluir_nota_entrada(uuid, uuid) to service_role;
grant execute on function reabrir_nota_entrada(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 7) "HOJE" É EM BRASÍLIA
--
-- current_date nas funções (vencimento, recebimento, estorno) seguia o
-- relógio UTC do servidor. Vale para as conexões novas.
-- ---------------------------------------------------------------------
alter database postgres set timezone to 'America/Sao_Paulo';
