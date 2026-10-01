-- =====================================================================
-- LUXX PODS — 0014 O BURACO MAIS GRAVE: QUALQUER UM MOVIA O ESTOQUE
--
-- Verificado contra o banco de produção, com a chave PUBLICÁVEL (a que vai
-- no bundle do navegador, portanto pública) e SEM NENHUMA SESSÃO:
--
--   POST /rest/v1/rpc/mover_estoque     → P0001 "Produto/sabor inexistente"
--   POST /rest/v1/rpc/abrir_carrinho    → 23503 violação de chave estrangeira
--   POST /rest/v1/rpc/confirmar_pedido  → P0001 "Pedido não encontrado"
--
-- Essas respostas são de REGRA DE NEGÓCIO, não de permissão: as funções
-- rodaram. Com um product_flavor_id real, qualquer pessoa na internet
-- zerava o estoque da loja, criava carrinho ou confirmava pedido sem
-- pagamento. O 23503 do carrinho prova que houve tentativa de INSERT.
--
-- Causa: toda função é `security definer` (por desenho — elas precisam
-- escrever passando pela regra única) e NENHUMA migração tinha `revoke`.
-- O padrão do Supabase concede EXECUTE no schema public para `anon` e
-- `authenticated`, então ficou aberto desde o primeiro dia.
--
-- E as VIEWS vazavam leitura pelo mesmo motivo estrutural: view no Postgres
-- roda com privilégio do dono a menos que tenha `security_invoker = on`.
-- Verificado sem sessão: v_catalogo devolvia produto, sabor, preço e CUSTO;
-- v_estoque_resumo devolvia custo do estoque e valor de venda potencial —
-- enquanto as tabelas por trás negavam corretamente. A margem da loja
-- estava pública.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) NINGUÉM EXECUTA NADA POR PADRÃO
--
-- `public` inclui anon e authenticated. Daqui para baixo, só volta o que
-- o painel precisa — e nominalmente.
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('revoke all on function %s from anon', f.assinatura);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) O QUE A SESSÃO DO PAINEL PRECISA CHAMAR
--
-- São as funções que uma ação de servidor invoca com o cliente de sessão.
-- Quem não está aqui só roda pela chave de serviço (webhook, bot, cron) ou
-- por gatilho — e gatilho executa com o direito do dono da tabela, não de
-- quem disparou, então não precisa de grant.
-- ---------------------------------------------------------------------

-- O grant vai por NOME, num laço, em vez de assinatura escrita à mão:
-- assinatura errada faria a migração abortar no meio, deixando o banco com
-- tudo revogado e o painel sem funcionar. Por nome, pega qualquer sobrecarga.
do $$
declare
  f record;
  permitidas text[] := array[
    -- identidade: as POLÍTICAS de RLS chamam estas. Sem o grant, todo
    -- acesso ao banco para de funcionar para todo mundo.
    'meu_perfil', 'minha_loja', 'tem_perfil', 'posso',
    -- venda pelo painel
    'abrir_carrinho', 'adicionar_ao_carrinho', 'remover_do_carrinho',
    'recalcular_carrinho', 'criar_pedido', 'confirmar_pedido',
    'cancelar_pedido', 'receber_na_entrega',
    -- estoque e nota de entrada
    'mover_estoque', 'concluir_nota_entrada', 'reabrir_nota_entrada',
    -- leitura do painel
    'dashboard_metricas', 'dashboard_serie'
  ];
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname as nome
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname = any(permitidas)
  loop
    execute format('grant execute on function %s to authenticated', f.assinatura);
  end loop;
end $$;

-- NÃO voltam para `authenticated`, de propósito:
--   liberar_reservas_expiradas  → só o cron, com a chave de serviço
--   abrir_atendimento           → só o bot, com a chave de serviço
--   os gatilhos (gerar_numero_pedido, registrar_status_pedido,
--     recalcular_cliente, fechar_lead_do_pedido, set_updated_at) —
--     gatilho roda com o direito do dono da tabela, não precisa de grant

-- ---------------------------------------------------------------------
-- 3) AS VIEWS PASSAM A RESPEITAR QUEM PERGUNTA
--
-- Com `security_invoker = on` a view usa o direito de quem consulta, então
-- a RLS das tabelas por trás volta a valer. A chave de serviço (webhook,
-- bot, cron) continua vendo tudo, porque ela ignora RLS por natureza.
-- ---------------------------------------------------------------------
alter view v_catalogo        set (security_invoker = on);
alter view v_estoque_resumo  set (security_invoker = on);
alter view v_funil           set (security_invoker = on);
alter view v_kanban          set (security_invoker = on);
alter view v_pedidos_resumo  set (security_invoker = on);

-- as views também não precisam ser legíveis por quem não tem sessão
revoke all on v_catalogo, v_estoque_resumo, v_funil, v_kanban, v_pedidos_resumo from anon;
grant select on v_catalogo, v_estoque_resumo, v_funil, v_kanban, v_pedidos_resumo to authenticated;

comment on view v_catalogo is
  'Catálogo com estoque. security_invoker = on: a view respeita a RLS de quem consulta — sem isso ela entregava preço, custo e margem para qualquer um com a chave pública.';

-- ---------------------------------------------------------------------
-- 4) CONFERÊNCIA
-- ---------------------------------------------------------------------
select
  p.proname as funcao,
  case when has_function_privilege('anon', p.oid, 'execute')
       then '*** ANON AINDA EXECUTA ***' else 'fechada para anon' end as situacao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by 2 desc, 1;
