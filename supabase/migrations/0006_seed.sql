-- =====================================================================
-- LUXX PODS — 0006 SEED (idempotente)
--
-- ATENÇÃO depois de rodar supabase/limpar-demonstracao.sql:
-- esta migração recria cupons de exemplo, a regra de upsell, tarefas e
-- eventos se for executada de novo, porque cada um desses blocos só verifica
-- se a própria tabela está vazia. Os 20 clientes e os 16 pedidos NÃO voltam
-- (o bloco deles exige customers vazio e é o único com essa guarda forte).
--
-- O executor de migrações (`npm run migrar`) registra o que já rodou em
-- `_migracoes`, então ele não repete. O risco existe só para quem colar o
-- schema-completo.sql à mão uma segunda vez.
-- =====================================================================
do $$
declare
  v_company uuid := '11111111-1111-1111-1111-111111111111';
  v_store   uuid := '22222222-2222-2222-2222-222222222222';
  v_wh      uuid := '33333333-3333-3333-3333-333333333333';
  v_brand   uuid; v_prod uuid; v_flavor uuid; v_pf uuid;
  v_cust    uuid; v_conv uuid; v_lead uuid; v_order uuid;
  v_stage   uuid; v_stage_novo uuid; v_stage_ganho uuid;
  -- Nome de uma letra disputa com apelido de tabela: `p` aqui fazia o
  -- PL/pgSQL ler `permissions p` como esta variável e o seed quebrava com
  -- "record p is not assigned yet". Prefixe variável nova com v_.
  b record; f text; v_rec record; i int; j int;
  v_marca text; v_qtd int; v_total numeric; v_preco numeric; v_custo numeric;
  v_dt timestamptz; v_nome text; v_tel text;
  nomes text[] := array['Ana Beatriz','Carlos Eduardo','Mariana Alves','Pedro Henrique','Juliana Costa','Rafael Lima','Beatriz Souza','Lucas Martins','Fernanda Rocha','Gabriel Santos','Camila Ferreira','Thiago Ribeiro','Larissa Dias','Bruno Carvalho','Isabela Nunes','Matheus Pereira','Amanda Barbosa','Felipe Araujo','Natália Gomes','Vinícius Teixeira'];
begin

-- ---------- EMPRESA / LOJA ----------
insert into companies (id, nome, razao_social, telefone, email, endereco)
values (v_company, 'Luxx Pods', 'Luxx Pods Comércio LTDA', '(33) 99999-0000', 'contato@luxxpods.com.br', 'Teófilo Otoni - MG')
on conflict (id) do nothing;

insert into stores (id, company_id, nome, slug, telefone, cidade, estado, taxa_entrega)
values (v_store, v_company, 'Luxx Pods — Teófilo Otoni', 'teofilo-otoni', '(33) 99999-0000', 'Teófilo Otoni', 'MG', 5.00)
on conflict (id) do nothing;

insert into warehouses (id, store_id, nome, principal)
values (v_wh, v_store, 'Estoque Principal', true)
on conflict (id) do nothing;

-- ---------- ROLES ----------
insert into roles (nome, slug, descricao, sistema) values
  ('Administrador','admin','Acesso total ao sistema', true),
  ('Atendimento','atendimento','Chats, clientes, pedidos e kanban', true),
  ('Operacional','operacional','Pedidos, separação, estoque e trocas', true),
  ('Financeiro','financeiro','Contas e relatórios financeiros', true),
  ('Entregador','entregador','Somente pedidos para entrega', true)
on conflict (slug) do nothing;

-- ---------- PERMISSÕES ----------
insert into permissions (slug, nome, grupo) values
  ('acessar_dashboard','Acessar dashboard','geral'),
  ('acessar_chat','Acessar chats','atendimento'),
  ('assumir_conversa','Assumir conversa','atendimento'),
  ('gerenciar_leads','Gerenciar leads','atendimento'),
  ('visualizar_clientes','Visualizar clientes','atendimento'),
  ('editar_clientes','Editar clientes','atendimento'),
  ('visualizar_pedidos','Visualizar pedidos','operacional'),
  ('criar_pedido','Criar pedido','operacional'),
  ('alterar_status_pedido','Alterar status do pedido','operacional'),
  ('cancelar_pedido','Cancelar pedido','operacional'),
  ('alterar_estoque','Alterar estoque','operacional'),
  ('alterar_preco','Alterar preço','operacional'),
  ('gerenciar_catalogo','Gerenciar catálogo','operacional'),
  ('gerenciar_trocas','Gerenciar trocas','operacional'),
  ('visualizar_financeiro','Visualizar financeiro','financeiro'),
  ('editar_financeiro','Editar financeiro','financeiro'),
  ('visualizar_relatorios','Visualizar relatórios','relatorios'),
  ('gerenciar_usuarios','Gerenciar usuários','sistema'),
  ('gerenciar_configuracoes','Gerenciar configurações','sistema'),
  ('visualizar_logs','Visualizar logs','sistema')
on conflict (slug) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, perm.id from roles r cross join permissions perm where r.slug = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, perm.id from roles r join permissions perm on perm.slug in
  ('acessar_dashboard','acessar_chat','assumir_conversa','gerenciar_leads','visualizar_clientes','editar_clientes','visualizar_pedidos','criar_pedido')
where r.slug = 'atendimento' on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, perm.id from roles r join permissions perm on perm.slug in
  ('acessar_dashboard','visualizar_pedidos','alterar_status_pedido','alterar_estoque','gerenciar_catalogo','gerenciar_trocas')
where r.slug = 'operacional' on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, perm.id from roles r join permissions perm on perm.slug in
  ('acessar_dashboard','visualizar_financeiro','editar_financeiro','visualizar_relatorios')
where r.slug = 'financeiro' on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, perm.id from roles r join permissions perm on perm.slug in ('visualizar_pedidos')
where r.slug = 'entregador' on conflict do nothing;

-- ---------- FUNIL ----------
insert into pipeline_stages (store_id, nome, slug, ordem, cor, tipo) values
  (v_store,'Novo Lead','novo-lead',1,'#8b5cf6','aberto'),
  (v_store,'Em Atendimento','em-atendimento',2,'#6366f1','aberto'),
  (v_store,'Escolhendo Produto','escolhendo-produto',3,'#0ea5e9','aberto'),
  (v_store,'Aguardando Endereço','aguardando-endereco',4,'#06b6d4','aberto'),
  (v_store,'Aguardando Pagamento','aguardando-pagamento',5,'#f59e0b','aberto'),
  (v_store,'Aguardando Confirmação','aguardando-confirmacao',6,'#f97316','aberto'),
  (v_store,'Pedido Confirmado','pedido-confirmado',7,'#22c55e','aberto'),
  (v_store,'Em Separação','em-separacao',8,'#14b8a6','aberto'),
  (v_store,'Saiu para Entrega','saiu-para-entrega',9,'#3b82f6','aberto'),
  (v_store,'Concluído','concluido',10,'#10b981','ganho'),
  (v_store,'Perdido','perdido',11,'#ef4444','perdido')
on conflict (store_id, slug) do nothing;

-- ---------- FINANCEIRO BÁSICO ----------
insert into financial_categories (store_id, nome, tipo) values
  (v_store,'Vendas','receita'),
  (v_store,'Mercadoria','despesa'),
  (v_store,'Aluguel','despesa'),
  (v_store,'Funcionários','despesa'),
  (v_store,'Marketing','despesa'),
  (v_store,'Motoboy','despesa'),
  (v_store,'Sistemas','despesa'),
  (v_store,'Energia','despesa'),
  (v_store,'Internet','despesa'),
  (v_store,'Outros','despesa')
on conflict do nothing;

insert into bank_accounts (store_id, nome, banco, tipo, saldo_inicial) values
  (v_store,'Conta Principal','Nubank','corrente', 0),
  (v_store,'Caixa Loja','Dinheiro','caixa', 0)
on conflict do nothing;

-- ---------- CONFIGURAÇÕES DINÂMICAS ----------
insert into settings (store_id, chave, valor, grupo, descricao) values
  (v_store,'empresa', '{"nome":"Luxx Pods","telefone":"(33) 99999-0000","endereco":"Teófilo Otoni - MG","logo_url":null}','empresa','Dados da empresa'),
  (v_store,'atendimento','{"horario_inicio":"10:00","horario_fim":"23:59","mensagem_inicial":"Fala! Aqui é da Luxx Pods 🖤 Como posso te ajudar?","mensagem_fora_horario":"Estamos fechados agora. Retornamos às 10h!","followup_minutos":5,"followup_ativo":true}','chatbot','Regras de atendimento'),
  (v_store,'catalogo','{"arquivo_png":null,"enviar_automatico":true,"mostrar_esgotados":false}','chatbot','Catálogo enviado pelo bot'),
  (v_store,'entrega','{"taxa_padrao":5,"taxa_gratis_acima":150,"prazo_minutos":45,"bairros_atendidos":[]}','entrega','Regras de entrega'),
  (v_store,'pagamentos','{"pix_ativo":true,"dinheiro_ativo":true,"cartao_ativo":false,"gateway":null,"chave_pix":null}','pagamentos','Formas de pagamento'),
  (v_store,'estoque','{"reserva_minutos":15,"estoque_minimo_padrao":3,"bloquear_venda_sem_estoque":true}','estoque','Regras de estoque'),
  (v_store,'chatbot','{"ativo":true,"validar_maioridade":true,"nome_bot":"Luxx","tom":"comercial-direto","fallback_humano":true}','chatbot','Configurações do bot'),
  (v_store,'impressao','{"impressora_padrao":null,"vias":1,"automatica":true}','impressao','Impressão de comandas')
on conflict (store_id, chave) do nothing;

-- ---------- CATÁLOGO ----------
insert into categories (store_id, nome, slug, ordem) values
  (v_store,'Pods Descartáveis','pods-descartaveis',1),
  (v_store,'Pods Recarregáveis','pods-recarregaveis',2),
  (v_store,'Acessórios','acessorios',3)
on conflict (store_id, slug) do nothing;

for b in select * from (values
  ('Ignite','ignite',1),('Elfbar','elfbar',2),('Lost Mary','lost-mary',3),
  ('Oxbar','oxbar',4),('Nikbar','nikbar',5),('Elfworld','elfworld',6)
) as t(nome, slug, ordem) loop
  insert into brands (store_id, nome, slug, ordem)
  values (v_store, b.nome, b.slug, b.ordem)
  on conflict (store_id, slug) do nothing;
end loop;

for f in select unnest(array[
  'Watermelon Ice','Strawberry Kiwi','Blueberry Ice','Mango Peach','Grape Ice',
  'Cherry Cola','Banana Ice','Passion Fruit','Pink Lemonade','Triple Berry',
  'Peach Mango','Blue Razz Ice','Mint','Coconut Melon','Strawberry Banana',
  'Kiwi Passion Guava','Cool Mint','Lush Ice','Energy Drink','Tropical Rainbow'
]) loop
  insert into flavors (store_id, nome, slug)
  values (v_store, f, lower(regexp_replace(f,'[^a-zA-Z0-9]+','-','g')))
  on conflict (store_id, slug) do nothing;
end loop;

-- produtos por marca
for v_rec in select * from (values
  ('ignite','Ignite V300','V300',3000,  89.90, 45.00),
  ('ignite','Ignite V600','V600',6000, 109.90, 58.00),
  ('ignite','Ignite V150','V150',1500,  69.90, 34.00),
  ('elfbar','Elfbar BC10000','BC10000',10000,139.90, 72.00),
  ('elfbar','Elfbar BC5000','BC5000',5000,  99.90, 52.00),
  ('lost-mary','Lost Mary MO20000','MO20000',20000,179.90, 95.00),
  ('lost-mary','Lost Mary OS5000','OS5000',5000, 104.90, 55.00),
  ('oxbar','Oxbar Magic Maze 30K','Magic Maze',30000,219.90,120.00),
  ('nikbar','Nikbar 12000','NB12000',12000,149.90, 78.00),
  ('elfworld','Elfworld 15000','EW15000',15000,159.90, 84.00)
) as t(marca, nome, modelo, puffs, preco, custo) loop
  select id into v_brand from brands where store_id = v_store and slug = v_rec.marca;
  insert into products (store_id, brand_id, category_id, nome, modelo, puffs, sku, preco, custo, ordem, descricao)
  select v_store, v_brand, (select id from categories where store_id=v_store and slug='pods-descartaveis'),
         v_rec.nome, v_rec.modelo, v_rec.puffs,
         upper(replace(v_rec.marca,'-','')) || '-' || upper(replace(v_rec.modelo,' ','')),
         v_rec.preco, v_rec.custo, v_rec.puffs, v_rec.nome || ' — ' || v_rec.puffs || ' puffs'
  where not exists (select 1 from products where store_id = v_store and nome = v_rec.nome);
end loop;

-- product_flavors + estoque
i := 0;
for v_rec in select id, custo from products where store_id = v_store loop
  i := i + 1;
  j := 0;
  for v_flavor in select id from flavors where store_id = v_store
      order by md5(id::text || v_rec.id::text) limit (6 + (i % 5)) loop
    j := j + 1;
    insert into product_flavors (store_id, product_id, flavor_id, estoque_minimo, ativo)
    values (v_store, v_rec.id, v_flavor, 3, true)
    on conflict (product_id, flavor_id) do nothing
    returning id into v_pf;
    if v_pf is not null then
      v_qtd := case when (i + j) % 9 = 0 then 0
                    when (i + j) % 7 = 0 then 2
                    else 4 + ((i * j * 7) % 26) end;
      insert into inventory (store_id, warehouse_id, product_flavor_id, quantidade_total, custo_medio)
      values (v_store, v_wh, v_pf, v_qtd, v_rec.custo)
      on conflict (product_flavor_id, warehouse_id) do nothing;
      if v_qtd > 0 then
        insert into inventory_movements (store_id, product_flavor_id, warehouse_id, tipo, quantidade,
          saldo_anterior, saldo_posterior, referencia_tipo, observacao, custo_unitario)
        values (v_store, v_pf, v_wh, 'entrada', v_qtd, 0, v_qtd, 'seed', 'Carga inicial de estoque', v_rec.custo);
      end if;
    end if;
    v_pf := null;
  end loop;
end loop;

-- ---------- UPSELL / CUPONS ----------
insert into coupons (store_id, codigo, descricao, tipo_desconto, valor, valor_minimo, limite_total, status)
values (v_store,'LUXX10','10% na primeira compra','percentual',10,80,500,'ativo'),
       (v_store,'FRETEGRATIS','Entrega grátis acima de R$120','valor',5,120,null,'ativo')
on conflict (store_id, codigo) do nothing;

insert into upsell_rules (store_id, nome, produto_origem, produto_destino, mensagem, tipo_desconto, desconto, prioridade)
select v_store, 'Leve 2 Ignite V300', p1.id, p1.id,
  'Quer aproveitar e levar mais uma unidade com R$ 15 de desconto? 🖤','valor',15,1
from products p1 where p1.store_id = v_store and p1.nome = 'Ignite V300'
and not exists (select 1 from upsell_rules where store_id = v_store and nome = 'Leve 2 Ignite V300');

-- ---------- AUTOMAÇÕES ----------
insert into automations (store_id, nome, gatilho, acao, delay_segundos, acao_config) values
  (v_store,'Criar lead na primeira mensagem','nova_conversa','criar_lead',0,'{}'),
  (v_store,'Follow-up 5min após catálogo','catalogo_enviado','enviar_mensagem',300,'{"template":"followup_catalogo"}'),
  (v_store,'Confirmar pagamento PIX','pix_aprovado','confirmar_pedido',0,'{}'),
  (v_store,'Imprimir ao confirmar','pedido_confirmado','imprimir_pedido',0,'{}'),
  (v_store,'Avisar saiu para entrega','pedido_despachado','enviar_mensagem',0,'{"template":"saiu_entrega"}'),
  (v_store,'Liberar carrinho expirado','carrinho_expirado','liberar_reserva',0,'{}')
on conflict do nothing;

-- ---------- DADOS DE DEMONSTRAÇÃO ----------
select id into v_stage_novo from pipeline_stages where store_id = v_store and slug = 'novo-lead';
select id into v_stage_ganho from pipeline_stages where store_id = v_store and slug = 'concluido';

if (select count(*) from customers where store_id = v_store) = 0 then
  for i in 1..20 loop
    v_nome := nomes[i];
    v_tel  := '33' || lpad((900000000 + i * 137)::text, 9, '0');
    v_dt   := now() - (random() * interval '28 days');

    insert into customers (store_id, nome, telefone, canal_origem, origem, maioridade_validada,
      primeira_interacao, ultima_interacao, tags, status)
    values (v_store, v_nome, v_tel,
      case when i % 4 = 0 then 'instagram'::canal_tipo else 'whatsapp'::canal_tipo end,
      case when i % 4 = 0 then 'Instagram Direct' else 'WhatsApp Orgânico' end,
      true, v_dt, v_dt + interval '20 minutes',
      case when i % 5 = 0 then array['vip'] when i % 3 = 0 then array['recorrente'] else '{}'::text[] end,
      'ativo')
    returning id into v_cust;

    insert into customer_addresses (customer_id, cidade, estado, bairro, rua, numero, referencia, principal)
    values (v_cust,'Teófilo Otoni','MG',
      (array['Centro','Marajoara','São Jacinto','Grão Pará','Felicidade','Manoel Pimenta'])[1 + (i % 6)],
      'Rua ' || (array['das Flores','Sete de Setembro','Getúlio Vargas','Dr. Luiz Boali','Frei Dimas'])[1 + (i % 5)],
      (100 + i * 7)::text, 'Próximo ao mercado', true);

    insert into conversations (store_id, customer_id, canal, identificador_externo, estado, status,
      bot_ativo, nao_lidas, ultima_mensagem, ultima_mensagem_em, ultima_interacao_cliente,
      primeira_resposta_em, created_at)
    values (v_store, v_cust,
      case when i % 4 = 0 then 'instagram'::canal_tipo else 'whatsapp'::canal_tipo end,
      v_tel,
      (array['INITIAL','CATALOG_SENT','PRODUCT_SELECTION','CART','ADDRESS','PAYMENT','ORDER_CONFIRMED','COMPLETED'])[1 + (i % 8)]::conversa_estado,
      case when i % 6 = 0 then 'aguardando_cliente' when i % 9 = 0 then 'resolvida' else 'aberta' end,
      i % 5 <> 0,
      case when i % 3 = 0 then 1 + (i % 3) else 0 end,
      (array['Quero ver os sabores do Ignite V300','Tem Watermelon Ice?','Boa noite, qual o valor?','Já fiz o PIX','Pode entregar hoje?','Quanto fica com a entrega?'])[1 + (i % 6)],
      v_dt + interval '25 minutes', v_dt + interval '25 minutes',
      v_dt + interval '38 seconds', v_dt)
    returning id into v_conv;

    -- mensagens da conversa
    insert into messages (conversation_id, store_id, sender_type, tipo, conteudo, created_at, enviada_em) values
      (v_conv, v_store,'cliente','texto','Boa noite', v_dt, v_dt),
      (v_conv, v_store,'bot','texto','Fala ' || split_part(v_nome,' ',1) || '! Aqui é da Luxx Pods 🖤 Você já é maior de 18?', v_dt + interval '5 seconds', v_dt + interval '5 seconds'),
      (v_conv, v_store,'cliente','texto','sou sim', v_dt + interval '30 seconds', v_dt + interval '30 seconds'),
      (v_conv, v_store,'bot','texto','Show! Qual modelo você procura? Posso te mandar o catálogo', v_dt + interval '38 seconds', v_dt + interval '38 seconds'),
      (v_conv, v_store,'cliente','texto', (array['Quero ver os sabores do Ignite V300','Tem Watermelon Ice?','Boa noite, qual o valor?','Já fiz o PIX','Pode entregar hoje?','Quanto fica com a entrega?'])[1 + (i % 6)], v_dt + interval '25 minutes', v_dt + interval '25 minutes');

    insert into leads (store_id, customer_id, conversation_id, stage_id, origem, canal,
      valor_estimado, status, ordem, created_at)
    values (v_store, v_cust, v_conv,
      (select id from pipeline_stages where store_id = v_store order by ordem offset (i % 11) limit 1),
      case when i % 4 = 0 then 'Instagram Direct' else 'WhatsApp Orgânico' end,
      case when i % 4 = 0 then 'instagram'::canal_tipo else 'whatsapp'::canal_tipo end,
      89.90 + (i % 5) * 30, case when i % 7 = 0 then 'ganho' when i % 11 = 0 then 'perdido' else 'aberto' end,
      i, v_dt)
    returning id into v_lead;

    update conversations set lead_id = v_lead where id = v_conv;

    -- pedidos para ~60% dos clientes
    if i % 5 <> 0 then
      select pf.id, coalesce(pf.preco_override, pr.preco), pr.custo, pr.nome, br.nome
        into v_pf, v_preco, v_custo, v_nome, v_marca
      from product_flavors pf
      join products pr on pr.id = pf.product_id
      left join brands br on br.id = pr.brand_id
      join inventory inv on inv.product_flavor_id = pf.id
      where pf.store_id = v_store and inv.quantidade_total > 3
      order by md5(pf.id::text || i::text) limit 1;

      v_qtd := 1 + (i % 3);
      v_total := v_preco * v_qtd + 5;

      insert into orders (store_id, customer_id, conversation_id, lead_id, cliente_nome, cliente_telefone,
        canal, origem, subtotal, taxa_entrega, total, custo_total, forma_pagamento, status_pagamento,
        status_pedido, endereco_snapshot, created_at, confirmado_em, entregue_em)
      values (v_store, v_cust, v_conv, v_lead, nomes[i], v_tel,
        case when i % 4 = 0 then 'instagram'::canal_tipo else 'whatsapp'::canal_tipo end,
        'bot', v_preco * v_qtd, 5, v_total, v_custo * v_qtd,
        case when i % 3 = 0 then 'dinheiro'::pagamento_metodo else 'pix'::pagamento_metodo end,
        case when i % 8 = 0 then 'aguardando'::pagamento_status else 'aprovado'::pagamento_status end,
        (array['entregue','entregue','entregue','saiu_para_entrega','em_separacao','confirmado','aguardando_pagamento','cancelado'])[1 + (i % 8)]::pedido_status,
        jsonb_build_object('bairro','Centro','rua','Rua das Flores','numero',(100+i*7)::text,'cidade','Teófilo Otoni'),
        v_dt + interval '40 minutes', v_dt + interval '45 minutes',
        case when i % 8 in (1,2,3) then v_dt + interval '2 hours' else null end)
      returning id into v_order;

      insert into order_items (order_id, product_flavor_id, produto_nome, sabor_nome, marca_nome,
        quantidade, custo_unitario, preco_unitario, subtotal)
      select v_order, v_pf, c.produto, c.sabor, c.marca, v_qtd, c.custo, c.preco, c.preco * v_qtd
      from v_catalogo c where c.product_flavor_id = v_pf;

      insert into accounts_receivable (store_id, order_id, customer_id, descricao, valor,
        vencimento, pagamento, forma_pagamento, status)
      select v_store, v_order, v_cust, 'Venda pedido', v_total, (v_dt)::date,
        case when i % 8 = 0 then null else (v_dt)::date end,
        case when i % 3 = 0 then 'dinheiro'::pagamento_metodo else 'pix'::pagamento_metodo end,
        case when i % 8 = 0 then 'pendente'::financeiro_status else 'pago'::financeiro_status end;
    end if;
  end loop;
end if;

-- tarefas de exemplo
insert into tasks (store_id, titulo, descricao, prioridade, status, criada_por, vencimento)
select v_store, t.titulo, t.descricao, t.pri::prioridade_tipo, 'aberta', 'bot', now() + interval '1 day'
from (values
  ('Cliente pediu atendente humano','Conversa com dúvida sobre troca de produto','alta'),
  ('Estoque baixo em 3 SKUs','Conferir reposição junto ao fornecedor','media'),
  ('Conferência de caixa','Fechamento diário','media')
) as t(titulo, descricao, pri)
where not exists (select 1 from tasks where store_id = v_store);

insert into calendar_events (store_id, titulo, tipo, inicio, fim, recorrencia)
select v_store, e.titulo, 'rotina', date_trunc('day', now()) + e.hora, date_trunc('day', now()) + e.hora + interval '1 hour', e.rec
from (values
  ('Conferência de estoque', interval '11 hours', 'semanal'),
  ('Fechamento financeiro', interval '22 hours', 'diaria'),
  ('Compra de mercadoria', interval '14 hours', 'quinzenal')
) as e(titulo, hora, rec)
where not exists (select 1 from calendar_events where store_id = v_store);

end $$;
