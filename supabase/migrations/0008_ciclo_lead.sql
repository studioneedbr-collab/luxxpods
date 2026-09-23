-- =====================================================================
-- LUXX PODS — 0008 CICLO DE VIDA DO LEAD
--
-- Um lead é um ATENDIMENTO, não o cliente. Ele nasce quando alguém chama,
-- morre quando a venda fecha (ou se perde), e um novo nasce na próxima vez
-- que a pessoa chamar. Sem isso, o Kanban vira uma lista de todos os
-- clientes que já compraram e para de servir para trabalhar.
--
--   pedido entregue/pago  → lead vira GANHO e sai do funil
--   pedido cancelado      → lead volta a ficar aberto
--   cliente chama de novo → novo lead, na primeira coluna
-- =====================================================================

alter table leads
  add column if not exists numero_atendimento integer not null default 1,
  add column if not exists order_id uuid references orders(id) on delete set null,
  add column if not exists valor_ganho numeric(12,2),
  add column if not exists reaberto_de uuid references leads(id) on delete set null;

comment on column leads.numero_atendimento is
  'Quantas vezes este cliente já foi atendido: 1 = primeiro contato';

create index if not exists idx_leads_abertos
  on leads (store_id, status, stage_id) where status = 'aberto';
create index if not exists idx_leads_customer
  on leads (customer_id, created_at desc);

-- ---------------------------------------------------------------------
-- O pedido fecha o lead que o originou.
-- ---------------------------------------------------------------------
create or replace function fechar_lead_do_pedido() returns trigger
language plpgsql as $$
declare
  v_stage_ganho uuid;
  v_stage_perdido uuid;
begin
  if new.lead_id is null then return new; end if;

  select id into v_stage_ganho from pipeline_stages
   where store_id = new.store_id and tipo = 'ganho' and status = 'ativo'
   order by ordem limit 1;
  select id into v_stage_perdido from pipeline_stages
   where store_id = new.store_id and tipo = 'perdido' and status = 'ativo'
   order by ordem limit 1;

  -- venda concluída: o atendimento acabou
  if new.status_pedido = 'entregue'
     or (new.status_pedido = 'confirmado' and new.status_pagamento = 'aprovado') then
    update leads set
      status = 'ganho',
      stage_id = coalesce(v_stage_ganho, stage_id),
      order_id = new.id,
      valor_ganho = new.total,
      data_ganho = coalesce(data_ganho, now())
    where id = new.lead_id and status <> 'ganho';

  -- pedido cancelado: o atendimento volta a estar em aberto
  elsif new.status_pedido = 'cancelado' then
    update leads set
      status = 'aberto',
      order_id = null,
      valor_ganho = null,
      data_ganho = null
    where id = new.lead_id and status = 'ganho';
  end if;

  return new;
end $$;

drop trigger if exists trg_fechar_lead on orders;
create trigger trg_fechar_lead
  after insert or update of status_pedido, status_pagamento on orders
  for each row execute function fechar_lead_do_pedido();

-- ---------------------------------------------------------------------
-- Cliente voltou a chamar: reabre um atendimento novo.
-- Chamado pelo webhook quando chega mensagem numa conversa sem lead aberto.
-- ---------------------------------------------------------------------
create or replace function abrir_atendimento(
  p_conversation_id uuid,
  p_origem text default null
) returns leads
language plpgsql security definer as $$
declare
  v_conversa conversations;
  v_lead     leads;
  v_anterior leads;
  v_stage    uuid;
  v_numero   integer;
begin
  select * into v_conversa from conversations where id = p_conversation_id;
  if v_conversa.id is null then raise exception 'Conversa não encontrada'; end if;

  -- já existe atendimento aberto? então é a mesma conversa continuando
  select * into v_lead from leads
   where conversation_id = p_conversation_id and status = 'aberto'
   order by created_at desc limit 1;
  if v_lead.id is not null then return v_lead; end if;

  -- o último atendimento desse cliente, para numerar o novo
  select * into v_anterior from leads
   where customer_id = v_conversa.customer_id
   order by created_at desc limit 1;
  v_numero := coalesce(v_anterior.numero_atendimento, 0) + 1;

  select id into v_stage from pipeline_stages
   where store_id = v_conversa.store_id and tipo = 'aberto' and status = 'ativo'
   order by ordem limit 1;

  insert into leads (
    store_id, customer_id, conversation_id, stage_id, origem, canal,
    status, numero_atendimento, reaberto_de)
  values (
    v_conversa.store_id, v_conversa.customer_id, p_conversation_id, v_stage,
    coalesce(p_origem, 'Retorno do cliente'), v_conversa.canal,
    'aberto', v_numero, v_anterior.id)
  returning * into v_lead;

  update conversations set lead_id = v_lead.id, estado = 'INITIAL'
   where id = p_conversation_id;

  return v_lead;
end $$;

-- ---------------------------------------------------------------------
-- O Kanban mostra só atendimento vivo; o histórico fica na ficha do cliente.
-- ---------------------------------------------------------------------
create or replace view v_kanban as
select
  l.*,
  c.nome  as cliente_nome,
  c.telefone as cliente_telefone,
  c.total_pedidos as cliente_total_pedidos,
  conv.ultima_mensagem,
  conv.ultima_mensagem_em,
  conv.nao_lidas,
  conv.bot_ativo
from leads l
left join customers c on c.id = l.customer_id
left join conversations conv on conv.id = l.conversation_id
where l.status = 'aberto';
