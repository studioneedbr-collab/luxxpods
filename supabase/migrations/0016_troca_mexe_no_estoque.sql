-- =====================================================================
-- LUXX PODS — 0016 A TROCA PASSA A MEXER NO ESTOQUE
--
-- A varredura achou que a troca NUNCA tocou estoque, e que três textos na
-- tela afirmavam que tocava ("Peça devolvida ao estoque", "ao finalizar a
-- peça volta ao estoque", "o sistema registra automaticamente a
-- movimentação"). O formulário não tinha campo de produto, então
-- `product_flavor_id` ficava sempre NULL e a movimentação estava dentro de
-- um `if` que nunca era verdadeiro.
--
-- Pior: a conta prevista estava errada mesmo se alguém preenchesse o SKU. O
-- único movimento era 'devolucao', que SOMA — isto é, jogaria a peça
-- defeituosa de volta na prateleira vendável e nunca baixaria a peça nova
-- que foi entregue ao cliente.
--
-- A CONTA CERTA, para troca por defeito:
--
--   venda      estoque −1   (a peça saiu quando foi vendida)
--   troca      estoque −1   (a peça de REPOSIÇÃO sai agora)
--
-- A peça defeituosa volta para a loja mas NÃO para o estoque vendável — ela
-- não pode ser vendida. Então ela simplesmente não reentra: o prejuízo
-- aparece como duas unidades saídas para uma venda, que é exatamente o que
-- aconteceu.
--
-- O tipo 'troca' do enum já existia com o sinal certo (−quantidade) e nunca
-- havia sido usado em lugar nenhum do sistema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- QUAL PEÇA SAI
--
-- Normalmente é o mesmo produto+sabor que deu defeito, mas o cliente pode
-- escolher outro sabor na troca — e aí quem baixa é o que ele levou, não o
-- que ele devolveu.
-- ---------------------------------------------------------------------
alter table exchanges
  add column if not exists product_flavor_saida_id uuid
    references product_flavors(id) on delete restrict,
  add column if not exists estoque_aplicado boolean not null default false;

comment on column exchanges.product_flavor_id is
  'O produto+sabor que deu defeito, o que o cliente devolveu. Não volta ao estoque vendável.';
comment on column exchanges.product_flavor_saida_id is
  'O produto+sabor que a loja entregou na troca. É ESTE que baixa do estoque. Normalmente igual ao devolvido, mas o cliente pode escolher outro sabor.';
comment on column exchanges.estoque_aplicado is
  'Se a baixa já aconteceu. Guarda a idempotência: finalizar duas vezes não baixa duas peças.';

create index if not exists idx_exchanges_status
  on exchanges (store_id, status, created_at desc);

-- ---------------------------------------------------------------------
-- FINALIZAR A TROCA
--
-- É aqui que o estoque anda, e só aqui. Idempotente pelo mesmo desenho da
-- nota de entrada: `estoque_aplicado` é gravado junto com a movimentação.
-- ---------------------------------------------------------------------
create or replace function finalizar_troca(
  p_troca_id uuid,
  p_usuario_id uuid default null
) returns exchanges
language plpgsql security definer as $$
declare
  v_troca exchanges;
  v_saida uuid;
begin
  select * into v_troca from exchanges where id = p_troca_id for update;
  if v_troca.id is null then raise exception 'Troca não encontrada'; end if;

  -- idempotência: finalizar de novo não entrega outra peça
  if v_troca.status = 'finalizada' or v_troca.estoque_aplicado then
    return v_troca;
  end if;

  if v_troca.status = 'recusada' then
    raise exception 'Troca recusada não pode ser finalizada';
  end if;

  -- a aprovação é obrigatória antes: é ela que registra que alguém olhou a
  -- peça. Sem esta trava, a tela é a única guarda e a ação de servidor fica
  -- chamável direto, pulando a conferência
  if v_troca.status <> 'aprovada' then
    raise exception 'Aprove a troca antes de finalizar — é a aprovação que registra a conferência da peça';
  end if;

  -- o que sai é a peça de reposição; sem ela definida, cai no que deu defeito
  v_saida := coalesce(v_troca.product_flavor_saida_id, v_troca.product_flavor_id);

  if v_saida is null then
    raise exception 'Esta troca não diz qual produto sai do estoque. Edite a troca e informe a peça.';
  end if;

  -- a baixa valida disponibilidade: não se entrega o que não tem. Se faltar,
  -- a exceção sobe e a troca NÃO é finalizada — melhor travar aqui do que
  -- registrar entrega de peça que não existe.
  perform mover_estoque(
    v_saida, 'troca', v_troca.quantidade,
    'exchange', p_troca_id::text, p_usuario_id,
    'Peça entregue na troca ' || left(p_troca_id::text, 8)
      || ' — a defeituosa não retorna ao estoque vendável');

  update exchanges set
    status = 'finalizada',
    estoque_aplicado = true,
    completed_at = now(),
    responsavel_id = coalesce(responsavel_id, p_usuario_id)
  where id = p_troca_id
  returning * into v_troca;

  return v_troca;
end $$;

-- ---------------------------------------------------------------------
-- DESFAZER A FINALIZAÇÃO
--
-- Troca finalizada por engano devolve a peça de reposição ao estoque: ela
-- não saiu de verdade, está na prateleira.
-- ---------------------------------------------------------------------
create or replace function reabrir_troca(
  p_troca_id uuid,
  p_motivo text default null,
  p_usuario_id uuid default null
) returns exchanges
language plpgsql security definer as $$
declare
  v_troca exchanges;
  v_saida uuid;
begin
  select * into v_troca from exchanges where id = p_troca_id for update;
  if v_troca.id is null then raise exception 'Troca não encontrada'; end if;

  if not v_troca.estoque_aplicado then
    update exchanges set status = 'aprovada', completed_at = null
     where id = p_troca_id returning * into v_troca;
    return v_troca;
  end if;

  v_saida := coalesce(v_troca.product_flavor_saida_id, v_troca.product_flavor_id);

  perform mover_estoque(
    v_saida, 'devolucao', v_troca.quantidade,
    'exchange_reabertura', p_troca_id::text, p_usuario_id,
    coalesce(p_motivo, 'Troca reaberta: a peça de reposição não saiu'));

  update exchanges set
    status = 'aprovada', estoque_aplicado = false, completed_at = null
  where id = p_troca_id
  returning * into v_troca;

  return v_troca;
end $$;

grant execute on function finalizar_troca(uuid, uuid) to authenticated;
grant execute on function reabrir_troca(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- As trocas que já existem ficam sem SKU de saída e sem estoque aplicado,
-- que é a verdade: nenhuma delas mexeu em estoque. Finalizá-las de novo vai
-- pedir a peça, em vez de fingir que a baixa aconteceu.
-- ---------------------------------------------------------------------
