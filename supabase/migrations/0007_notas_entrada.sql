-- =====================================================================
-- LUXX PODS — 0007 NOTA DE ENTRADA: fluxo correto
--
-- Regra central: NADA toca estoque, custo ou financeiro enquanto a nota
-- não for CONCLUÍDA. Lançar a nota e dar entrada são atos separados.
--
--   transito  → mercadoria a caminho, só o registro existe
--   conferencia → chegou, alguém está conferindo fisicamente
--   concluida → conferida e aprovada: aí sim estoque + custo + contas
-- =====================================================================

do $$ begin
  create type nota_status as enum ('transito','conferencia','concluida','cancelada');
exception when duplicate_object then null; end $$;

-- ---------- campos que faltavam ----------
alter table purchase_entries
  add column if not exists situacao nota_status not null default 'transito',
  add column if not exists estoque_aplicado boolean not null default false,
  add column if not exists cotacao numeric(10,4),          -- dólar da nota
  add column if not exists freteiro_pct numeric(6,3) not null default 0,
  add column if not exists vencimento date,
  add column if not exists freteiro_vencimento date,
  add column if not exists conta_pagar_id uuid references accounts_payable(id) on delete set null,
  add column if not exists freteiro_conta_id uuid references accounts_payable(id) on delete set null,
  add column if not exists conferencia_iniciada_em timestamptz,
  add column if not exists conferencia_concluida_em timestamptz,
  add column if not exists cancelada_em timestamptz;

alter table purchase_entry_items
  add column if not exists custo_usd numeric(12,4),
  add column if not exists quantidade_conferida integer;

-- migra o status antigo (text) para o enum
update purchase_entries
   set situacao = case status
     when 'finalizada' then 'concluida'::nota_status
     when 'cancelada'  then 'cancelada'::nota_status
     else 'transito'::nota_status end
 where situacao = 'transito' and status is not null;

update purchase_entries set estoque_aplicado = true where situacao = 'concluida';

-- ---------------------------------------------------------------------
-- CONCLUIR: estoque + custo médio + contas a pagar, em uma transação só.
-- Idempotente: chamar duas vezes não dobra a entrada.
-- ---------------------------------------------------------------------
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
  if v_nota.id is null then
    raise exception 'Nota não encontrada';
  end if;

  -- idempotência: já concluída não faz nada de novo
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

  -- 1) ESTOQUE — item a item, cada um com sua movimentação registrada.
  --    O custo do freteiro entra no custo unitário, senão a margem mente.
  for v_item in select * from purchase_entry_items where entry_id = p_nota_id loop
    v_custo_com_freteiro :=
      v_item.custo_unitario * (1 + coalesce(v_nota.freteiro_pct, 0) / 100.0);

    perform mover_estoque(
      v_item.product_flavor_id,
      'entrada',
      v_item.quantidade,
      'purchase_entry',
      p_nota_id::text,
      p_usuario_id,
      'Entrada pela nota ' || coalesce(v_nota.numero_documento, '(sem número)'),
      v_custo_com_freteiro
    );

    v_total := v_total + (v_item.quantidade * v_item.custo_unitario);
  end loop;

  -- 2) A nota passa a valer. estoque_aplicado sai SÓ do passo acima:
  --    marcar false por falha de um passo posterior faria a reabertura
  --    pular o estorno e a próxima conclusão somar tudo de novo.
  update purchase_entries set
    situacao = 'concluida',
    status = 'finalizada',
    estoque_aplicado = true,
    valor_total = v_total,
    finalizada_em = now(),
    conferencia_concluida_em = coalesce(conferencia_concluida_em, now())
  where id = p_nota_id
  returning * into v_nota;

  -- 3) FINANCEIRO — daqui para baixo, falha vira aviso, nunca desfaz o
  --    estoque: dizer "não apliquei" depois de aplicar libera entrada dupla.
  begin
    select id into v_cat_mercadoria from financial_categories
     where store_id = v_nota.store_id and tipo = 'despesa' and nome = 'Mercadoria' limit 1;
    select id into v_cat_freteiro from financial_categories
     where store_id = v_nota.store_id and tipo = 'despesa' and nome = 'Motoboy' limit 1;

    insert into accounts_payable (
      store_id, supplier_id, categoria_id, descricao, valor,
      vencimento, documento, status)
    values (
      v_nota.store_id, v_nota.supplier_id, v_cat_mercadoria,
      'Nota ' || coalesce(v_nota.numero_documento, 'sem número'),
      v_total,
      coalesce(v_nota.vencimento, current_date),
      v_nota.numero_documento, 'pendente')
    returning id into v_conta;

    update purchase_entries set conta_pagar_id = v_conta where id = p_nota_id;

    if coalesce(v_nota.freteiro_pct, 0) > 0 then
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
  exception when others then
    raise warning 'Nota % concluída, mas o lançamento financeiro falhou: %',
      p_nota_id, sqlerrm;
  end;

  select * into v_nota from purchase_entries where id = p_nota_id;
  return v_nota;
end $$;

-- ---------------------------------------------------------------------
-- REABRIR: desfaz exatamente o que a conclusão fez, pela mesma trilha.
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
begin
  select * into v_nota from purchase_entries where id = p_nota_id for update;
  if v_nota.id is null then raise exception 'Nota não encontrada'; end if;

  if not v_nota.estoque_aplicado then
    update purchase_entries set situacao = 'conferencia', status = 'rascunho'
     where id = p_nota_id returning * into v_nota;
    return v_nota;
  end if;

  -- estorna item a item; se algum não puder sair, a transação inteira volta
  for v_item in select * from purchase_entry_items where entry_id = p_nota_id loop
    perform mover_estoque(
      v_item.product_flavor_id,
      'ajuste_negativo',
      v_item.quantidade,
      'purchase_entry_reabertura',
      p_nota_id::text,
      p_usuario_id,
      coalesce(p_motivo, 'Reabertura da nota de entrada')
    );
  end loop;

  -- as contas geradas por esta nota deixam de valer
  update accounts_payable set status = 'cancelado'
   where id in (v_nota.conta_pagar_id, v_nota.freteiro_conta_id)
     and status <> 'pago';

  update purchase_entries set
    situacao = 'conferencia',
    status = 'rascunho',
    estoque_aplicado = false,
    finalizada_em = null,
    conta_pagar_id = null,
    freteiro_conta_id = null
  where id = p_nota_id
  returning * into v_nota;

  return v_nota;
end $$;

create index if not exists idx_notas_situacao
  on purchase_entries (store_id, situacao, data desc);
