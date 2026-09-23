-- =====================================================================
-- LUXX PODS — 0010 RLS POR PERFIL
--
-- A política anterior era `using (true)` para todo usuário autenticado.
-- Como a chave `anon` vai no bundle do navegador, um entregador logado
-- podia falar direto com a API REST do Supabase e ler o financeiro inteiro
-- ou apagar pedidos — sem passar pelo painel.
--
-- Agora cada tabela tem a política do seu setor, e o padrão de quem não se
-- encaixa em nenhum perfil é NÃO VER NADA.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Quem é quem. STABLE para o Postgres não reavaliar a cada linha.
-- ---------------------------------------------------------------------
create or replace function meu_perfil() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(r.slug, 'sem_perfil')
    from profiles p
    left join roles r on r.id = p.role_id
   where p.id = auth.uid()
     and p.status = 'ativo'
     and p.deleted_at is null
$$;

create or replace function minha_loja() returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from profiles where id = auth.uid()
$$;

create or replace function tem_perfil(variadic perfis text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select meu_perfil() = any(perfis)
$$;

/** Permissão concedida ou revogada individualmente vence a do perfil. */
create or replace function posso(p_permissao text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select up.concedida
       from user_permissions up
       join permissions pe on pe.id = up.permission_id
      where up.user_id = auth.uid() and pe.slug = p_permissao),
    exists (
      select 1
        from profiles pr
        join role_permissions rp on rp.role_id = pr.role_id
        join permissions pe on pe.id = rp.permission_id
       where pr.id = auth.uid() and pe.slug = p_permissao
    )
  )
$$;

-- ---------------------------------------------------------------------
-- Troca a política aberta pela do setor de cada tabela.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  leitura text;
  escrita text;
  -- quem enxerga e quem altera, por grupo de tabelas
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
      'user_permissions','settings','audit_logs','automations','jobs',
      'webhook_events')
  );
  grupo text;
  tabela jsonb;
begin
  for grupo in select jsonb_object_keys(grupos) loop
    for tabela in select * from jsonb_array_elements_text(grupos -> grupo) loop
      t := trim(both '"' from tabela::text);

      -- quem pode LER
      leitura := case grupo
        when 'atendimento' then $q$tem_perfil('admin','atendimento','operacional')$q$
        when 'catalogo'    then $q$tem_perfil('admin','atendimento','operacional','financeiro')$q$
        -- o entregador vê pedido porque precisa do endereço e do troco
        when 'vendas'      then $q$tem_perfil('admin','atendimento','operacional','financeiro','entregador')$q$
        when 'financeiro'  then $q$tem_perfil('admin','financeiro')$q$
        else                    $q$tem_perfil('admin')$q$
      end;

      -- quem pode ESCREVER
      escrita := case grupo
        when 'atendimento' then $q$tem_perfil('admin','atendimento')$q$
        when 'catalogo'    then $q$tem_perfil('admin','operacional')$q$
        when 'vendas'      then $q$tem_perfil('admin','atendimento','operacional')$q$
        when 'financeiro'  then $q$tem_perfil('admin','financeiro')$q$
        else                    $q$tem_perfil('admin')$q$
      end;

      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists p_auth_all on %I', t);
      execute format('drop policy if exists p_ler on %I', t);
      execute format('drop policy if exists p_criar on %I', t);
      execute format('drop policy if exists p_editar on %I', t);
      execute format('drop policy if exists p_apagar on %I', t);

      execute format('create policy p_ler on %I for select to authenticated using (%s)', t, leitura);
      execute format('create policy p_criar on %I for insert to authenticated with check (%s)', t, escrita);
      execute format('create policy p_editar on %I for update to authenticated using (%s) with check (%s)', t, escrita, escrita);
      -- apagar é só do administrador, em qualquer tabela
      execute format($f$create policy p_apagar on %I for delete to authenticated using (tem_perfil('admin'))$f$, t);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfil: cada um lê o seu; só o administrador mexe nos outros.
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
drop policy if exists p_auth_all on profiles;
drop policy if exists p_perfil_ler on profiles;
drop policy if exists p_perfil_editar on profiles;
drop policy if exists p_perfil_admin on profiles;

create policy p_perfil_ler on profiles for select to authenticated
  using (id = auth.uid() or tem_perfil('admin'));
create policy p_perfil_editar on profiles for update to authenticated
  using (id = auth.uid() or tem_perfil('admin'))
  with check (id = auth.uid() or tem_perfil('admin'));
create policy p_perfil_admin on profiles for insert to authenticated
  with check (tem_perfil('admin'));

-- ---------------------------------------------------------------------
-- Notificações: cada pessoa vê as suas.
-- ---------------------------------------------------------------------
alter table notifications enable row level security;
drop policy if exists p_auth_all on notifications;
drop policy if exists p_notif on notifications;
create policy p_notif on notifications for all to authenticated
  using (user_id = auth.uid() or user_id is null)
  with check (user_id = auth.uid() or tem_perfil('admin'));

-- ---------------------------------------------------------------------
-- Auditoria: escreve quem age, apaga ninguém.
-- ---------------------------------------------------------------------
drop policy if exists p_criar on audit_logs;
drop policy if exists p_editar on audit_logs;
drop policy if exists p_apagar on audit_logs;
create policy p_criar on audit_logs for insert to authenticated with check (true);
-- sem policy de update/delete: log não se corrige, se complementa

comment on function posso(text) is
  'Permissão individual vence a do perfil — é assim que o admin libera ou tira uma ação de uma pessoa específica';
