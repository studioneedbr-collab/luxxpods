-- =====================================================================
-- LUXX PODS — 0012 O ON CONFLICT QUE DERRUBAVA TODA VENDA
--
-- `confirmar_pedido` termina gravando a conta a receber com
--   on conflict (order_id) do nothing
-- para ser idempotente. A 0009 criou o índice que isso precisa, mas
-- PARCIAL:
--   create unique index idx_ar_order_unico
--     on accounts_receivable (order_id) where order_id is not null;
--
-- O Postgres não usa índice parcial para inferir ON CONFLICT a menos que a
-- cláusula repita o mesmo predicado. Sem isso ele responde "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification" e
-- a função inteira aborta — ou seja, NENHUM pedido conseguia ser
-- confirmado: nem dinheiro, nem PIX aprovado. O estoque ficava reservado e
-- o pedido parado, sem explicação visível na tela.
--
-- O predicado era desnecessário desde o começo: índice único no Postgres
-- trata NULL como distinto, então várias linhas com order_id nulo (lançamento
-- manual, sem pedido) já convivem num índice comum.
-- =====================================================================

drop index if exists idx_ar_order_unico;

create unique index if not exists idx_ar_order_unico
  on accounts_receivable (order_id);

comment on index idx_ar_order_unico is
  'Uma conta a receber por pedido. Sem predicado de propósito: índice parcial não serve para o ON CONFLICT de confirmar_pedido, e NULL já é distinto num único comum.';

-- =====================================================================
-- E O CUSTO MÉDIO QUE A REABERTURA NÃO DESFAZIA
--
-- `concluir_nota_entrada` recalcula o custo médio ponderado. `reabrir_nota`
-- devolvia a quantidade com um ajuste negativo, mas `mover_estoque` não mexe
-- em custo médio nesse tipo — então o custo ficava misturado com o da nota
-- estornada. Detectado num teste: 95,00 virou 102,14 e continuou 102,14
-- depois da reabertura.
--
-- Custo errado não aparece em tela nenhuma: ele contamina silenciosamente a
-- margem de cada relatório e o CMV de cada venda. Média ponderada não se
-- "desmistura" por conta, então a nota passa a guardar o custo que havia
-- antes dela, e a reabertura restaura esse valor.
-- =====================================================================

alter table purchase_entry_items
  add column if not exists custo_medio_anterior numeric(12,2);

comment on column purchase_entry_items.custo_medio_anterior is
  'Custo médio do SKU antes desta nota entrar. Guardado na conclusão para a reabertura poder restaurar — média ponderada não se desfaz por cálculo.';

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
    -- guarda o custo de antes, para a reabertura ter como voltar
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
      v_total, coalesce(v_nota.vencimento, current_date),
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

  for v_item in select * from purchase_entry_items where entry_id = p_nota_id loop
    perform mover_estoque(
      v_item.product_flavor_id, 'ajuste_negativo', v_item.quantidade,
      'purchase_entry_reabertura', p_nota_id::text, p_usuario_id,
      coalesce(p_motivo, 'Reabertura da nota de entrada'));

    -- devolve o custo que havia antes desta nota. Sem isto a margem de todo
    -- relatório segue contaminada pelo custo de uma entrada que foi estornada.
    if v_item.custo_medio_anterior is not null then
      update inventory set custo_medio = v_item.custo_medio_anterior, updated_at = now()
       where product_flavor_id = v_item.product_flavor_id;
    end if;
  end loop;

  update accounts_payable set status = 'cancelado'
   where id in (v_nota.conta_pagar_id, v_nota.freteiro_conta_id)
     and status <> 'pago';

  update purchase_entries set
    situacao = 'conferencia', status = 'rascunho', estoque_aplicado = false,
    finalizada_em = null, conta_pagar_id = null, freteiro_conta_id = null
  where id = p_nota_id
  returning * into v_nota;

  return v_nota;
end $$;
