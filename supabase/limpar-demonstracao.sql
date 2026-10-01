-- =====================================================================
-- LUXX PODS — LIMPAR OS DADOS DE DEMONSTRAÇÃO
--
-- Tira os 342 registros fictícios que o seed criou e zera o estoque,
-- MANTENDO toda a estrutura e todo o cadastro de produto.
--
-- FICA:
--   empresa, loja, depósito
--   cargos, permissões, e o SEU usuário
--   configurações, etapas do funil, categorias financeiras, contas bancárias
--   6 marcas, 3 categorias, 10 produtos, 20 sabores, 80 produto+sabor
--   as 80 linhas de estoque — com quantidade ZERO
--
-- SAI:
--   20 clientes e endereços, 20 conversas, 101 mensagens, 20 leads
--   16 pedidos com itens, histórico e contas a receber
--   2 cupons de exemplo, 1 regra de upsell, 4 tarefas, 3 eventos
--   74 movimentações de estoque, 9 jobs, carrinhos, webhooks
--
-- Roda numa transação só: se qualquer linha falhar, NADA é apagado.
-- Rodar de novo é inofensivo — não há o que apagar na segunda vez.
--
-- Cole no SQL Editor do Supabase e rode com "Run without RLS".
-- =====================================================================

begin;

-- ---------- filhos primeiro, para nenhuma chave estrangeira reclamar ----------
delete from exchange_files;
delete from exchanges;

delete from order_status_history;
delete from order_items;
delete from accounts_receivable;
delete from accounts_payable;
delete from payments;
delete from orders;

delete from cart_items;
delete from carts;

delete from messages;
-- conversas e leads se apontam, mas as duas pontas são ON DELETE SET NULL,
-- então a ordem entre elas não importa
delete from leads;
delete from conversations;

delete from customer_addresses;
delete from customers;

delete from upsell_events;
delete from upsell_rules;
delete from coupon_targets;
delete from coupons;

delete from purchase_entry_items;
delete from purchase_entries;
delete from suppliers;

delete from tasks;
delete from calendar_events;
delete from notifications;
delete from jobs;
delete from webhook_events;
delete from audit_logs;

-- ---------- o histórico de estoque é da operação fictícia ----------
delete from inventory_movements;

-- ---------- estoque a zero, SKU preservado ----------
-- As 80 linhas continuam existindo: é o que mantém produto+sabor cadastrado,
-- com estoque mínimo e preço. Só a contagem vai a zero.
--
-- custo_medio também zera: custo sem peça em casa é ruído, e a primeira nota
-- de entrada recalcula do zero — a média ponderada com quantidade 0 resulta
-- exatamente no custo da nota, sem contaminação.
update inventory set
  quantidade_total = 0,
  quantidade_reservada = 0,
  custo_medio = 0,
  updated_at = now();

-- ---------- o número do próximo pedido volta a 1 ----------
-- Senão o primeiro pedido de verdade sairia como LX-2026-000017, com
-- dezesseis números queimados por pedidos que nunca existiram.
alter sequence order_number_seq restart with 1;

commit;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA — o que sobrou
-- ---------------------------------------------------------------------
select 'produtos'        as o_que, count(*)::text as quantos from products
union all select 'produto+sabor', count(*)::text from product_flavors
union all select 'linhas de estoque', count(*)::text from inventory
union all select 'peças em estoque', coalesce(sum(quantidade_total),0)::text from inventory
union all select 'clientes', count(*)::text from customers
union all select 'pedidos', count(*)::text from orders
union all select 'conversas', count(*)::text from conversations
union all select 'usuários', count(*)::text from profiles
union all select 'configurações', count(*)::text from settings
union all select 'etapas do funil', count(*)::text from pipeline_stages;
