-- =====================================================================
-- LUXX PODS — SCHEMA COMPLETO
--
-- GERADO POR scripts/gerar-schema.mjs — não edite à mão.
-- Para mudar o banco, crie uma migração nova em supabase/migrations/
-- e rode `npm run schema`.
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez.
-- É idempotente: rodar de novo não duplica nem apaga nada.
--
-- 11 migrações, na ordem:
--   0001_core.sql
--   0002_crm.sql
--   0003_catalogo_estoque.sql
--   0004_vendas_financeiro.sql
--   0005_funcoes_rls.sql
--   0006_seed.sql
--   0007_notas_entrada.sql
--   0008_ciclo_lead.sql
--   0009_correcoes_criticas.sql
--   0010_rls_por_perfil.sql
--   0011_criar_pedido.sql
-- =====================================================================

-- ===================== 0001_core.sql =====================

-- =====================================================================
-- LUXX PODS — 0001 CORE
-- Estrutura multiloja + usuários/permissões + configurações + auditoria
-- =====================================================================
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- ENUMS ----------
do $$ begin
  create type canal_tipo        as enum ('whatsapp','instagram','manual','site');
  create type sender_tipo       as enum ('cliente','bot','atendente','sistema');
  create type mensagem_tipo     as enum ('texto','imagem','audio','video','documento','sistema','produto','pix','botao','localizacao');
  create type mensagem_status   as enum ('pendente','enviada','entregue','lida','erro');
  create type conversa_estado   as enum ('INITIAL','CATALOG_SENT','PRODUCT_SELECTION','CART','ADDRESS','PAYMENT','ORDER_REVIEW','ORDER_CONFIRMED','COMPLETED','HUMAN','ABANDONED');
  create type movimento_tipo    as enum ('entrada','venda','reserva','liberacao_reserva','cancelamento','troca','ajuste_positivo','ajuste_negativo','devolucao');
  create type carrinho_status   as enum ('ativo','convertido','abandonado','expirado');
  create type pedido_status     as enum ('pendente','aguardando_pagamento','confirmado','em_separacao','saiu_para_entrega','entregue','cancelado');
  create type pagamento_status  as enum ('aguardando','aprovado','recusado','expirado','cancelado','estornado');
  create type pagamento_metodo  as enum ('pix','dinheiro','cartao_credito','cartao_debito','transferencia');
  create type financeiro_status as enum ('pendente','pago','cancelado','atrasado');
  create type troca_status      as enum ('solicitada','em_analise','aprovada','recusada','finalizada');
  create type tarefa_status     as enum ('aberta','em_andamento','concluida','cancelada');
  create type prioridade_tipo   as enum ('baixa','media','alta','urgente');
  create type desconto_tipo     as enum ('valor','percentual');
  create type registro_status   as enum ('ativo','inativo');
  create type origem_acao       as enum ('bot','sistema','operador','webhook','cliente');
exception when duplicate_object then null; end $$;

-- ---------- MULTILOJA ----------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  cnpj text,
  logo_url text,
  telefone text,
  email text,
  endereco text,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  nome text not null,
  slug text unique,
  telefone text,
  endereco text,
  cidade text,
  estado text,
  taxa_entrega numeric(10,2) not null default 0,
  horario_funcionamento jsonb not null default '{}'::jsonb,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  principal boolean not null default false,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now()
);

-- ---------- USUÁRIOS / PERMISSÕES ----------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  slug text not null unique,
  descricao text,
  sistema boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  grupo text not null default 'geral'
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- perfil espelha auth.users do Supabase
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  store_id uuid references stores(id) on delete set null,
  role_id uuid references roles(id) on delete set null,
  nome text not null default '',
  email text,
  telefone text,
  avatar_url text,
  cargo text,
  status registro_status not null default 'ativo',
  ultimo_login timestamptz,
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists user_permissions (
  user_id uuid not null references profiles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  concedida boolean not null default true,
  primary key (user_id, permission_id)
);

-- ---------- CONFIGURAÇÕES DINÂMICAS ----------
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  chave text not null,
  valor jsonb not null default '{}'::jsonb,
  grupo text not null default 'geral',
  descricao text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (store_id, chave)
);

-- ---------- AUDITORIA / LOGS ----------
create table if not exists audit_logs (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete set null,
  entidade text not null,
  entidade_id text,
  acao text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_entidade on audit_logs (entidade, entidade_id);
create index if not exists idx_audit_created on audit_logs (created_at desc);

-- ---------- NOTIFICAÇÕES INTERNAS ----------
create table if not exists notifications (
  id bigserial primary key,
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensagem text,
  link text,
  prioridade prioridade_tipo not null default 'media',
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on notifications (user_id, lida, created_at desc);

-- ---------- updated_at ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===================== 0002_crm.sql =====================

-- =====================================================================
-- LUXX PODS — 0002 CRM
-- Clientes, endereços, funil, leads, conversas, mensagens, tarefas
-- =====================================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null default '',
  telefone text,
  email text,
  instagram_id text,
  instagram_username text,
  data_nascimento date,
  maioridade_validada boolean not null default false,
  maioridade_validada_em timestamptz,
  origem text,
  canal_origem canal_tipo,
  tags text[] not null default '{}',
  observacoes text,
  primeira_interacao timestamptz,
  ultima_interacao timestamptz,
  primeira_compra timestamptz,
  ultima_compra timestamptz,
  total_pedidos integer not null default 0,
  total_comprado numeric(12,2) not null default 0,
  total_itens integer not null default 0,
  ticket_medio numeric(12,2) not null default 0,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (store_id, telefone)
);
create index if not exists idx_customers_nome on customers using gin (nome gin_trgm_ops);
create index if not exists idx_customers_tel on customers (telefone);
drop trigger if exists trg_customers_updated on customers;
create trigger trg_customers_updated before update on customers for each row execute function set_updated_at();

create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  cep text, estado text, cidade text,
  bairro text, rua text, numero text,
  complemento text, referencia text,
  principal boolean not null default false,
  latitude numeric(10,7), longitude numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_addr_customer on customer_addresses (customer_id);

-- ---------- FUNIL ----------
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  slug text not null,
  ordem integer not null default 0,
  cor text not null default '#7c3aed',
  tipo text not null default 'aberto', -- aberto | ganho | perdido
  automacao_associada text,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  unique (store_id, slug)
);

-- ---------- CONVERSAS ----------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  canal canal_tipo not null default 'whatsapp',
  identificador_externo text,
  estado conversa_estado not null default 'INITIAL',
  contexto jsonb not null default '{}'::jsonb,
  status text not null default 'aberta', -- aberta | aguardando_cliente | resolvida | arquivada
  responsavel_id uuid references profiles(id) on delete set null,
  bot_ativo boolean not null default true,
  nao_lidas integer not null default 0,
  ultima_mensagem text,
  ultima_mensagem_em timestamptz,
  ultima_interacao_cliente timestamptz,
  ultima_interacao_sistema timestamptz,
  primeira_resposta_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, canal, identificador_externo)
);
create index if not exists idx_conv_ultima on conversations (store_id, ultima_mensagem_em desc);
create index if not exists idx_conv_customer on conversations (customer_id);
drop trigger if exists trg_conv_updated on conversations;
create trigger trg_conv_updated before update on conversations for each row execute function set_updated_at();

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,
  origem text,
  canal canal_tipo,
  campanha text,
  valor_estimado numeric(12,2) not null default 0,
  responsavel_id uuid references profiles(id) on delete set null,
  status text not null default 'aberto', -- aberto | ganho | perdido
  motivo_perda text,
  data_ganho timestamptz,
  data_perda timestamptz,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_stage on leads (store_id, stage_id, ordem);
drop trigger if exists trg_leads_updated on leads;
create trigger trg_leads_updated before update on leads for each row execute function set_updated_at();

alter table conversations add column if not exists lead_id uuid references leads(id) on delete set null;

-- ---------- MENSAGENS ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,
  sender_type sender_tipo not null,
  sender_id uuid references profiles(id) on delete set null,
  external_message_id text,
  tipo mensagem_tipo not null default 'texto',
  conteudo text,
  arquivo_url text,
  metadata jsonb not null default '{}'::jsonb,
  status mensagem_status not null default 'enviada',
  erro text,
  enviada_em timestamptz not null default now(),
  entregue_em timestamptz,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_conv on messages (conversation_id, created_at);
create unique index if not exists idx_msg_external on messages (external_message_id) where external_message_id is not null;

-- ---------- TAREFAS / CALENDÁRIO ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  titulo text not null,
  descricao text,
  responsavel_id uuid references profiles(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  order_id uuid,
  prioridade prioridade_tipo not null default 'media',
  vencimento timestamptz,
  status tarefa_status not null default 'aberta',
  criada_por origem_acao not null default 'sistema',
  criada_por_id uuid references profiles(id) on delete set null,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_status on tasks (store_id, status, vencimento);
drop trigger if exists trg_tasks_updated on tasks;
create trigger trg_tasks_updated before update on tasks for each row execute function set_updated_at();

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  titulo text not null,
  descricao text,
  tipo text not null default 'rotina',
  responsavel_id uuid references profiles(id) on delete set null,
  inicio timestamptz not null,
  fim timestamptz,
  dia_inteiro boolean not null default false,
  recorrencia text, -- none | diaria | semanal | quinzenal | mensal
  recorrencia_config jsonb not null default '{}'::jsonb,
  cor text default '#7c3aed',
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cal_inicio on calendar_events (store_id, inicio);

-- ===================== 0003_catalogo_estoque.sql =====================

-- =====================================================================
-- LUXX PODS — 0003 CATÁLOGO E ESTOQUE
-- Marcas, produtos, sabores, product_flavors (SKU real), estoque, movimentações
-- =====================================================================

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  slug text not null,
  logo_url text,
  ordem integer not null default 0,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (store_id, slug)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  slug text not null,
  ordem integer not null default 0,
  status registro_status not null default 'ativo',
  unique (store_id, slug)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  nome text not null,
  modelo text,
  puffs integer,
  sku text,
  descricao text,
  imagem_url text,
  custo numeric(12,2) not null default 0,
  preco numeric(12,2) not null default 0,
  status registro_status not null default 'ativo',
  destaque boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_products_brand on products (store_id, brand_id, status);
create index if not exists idx_products_nome on products using gin (nome gin_trgm_ops);
drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated before update on products for each row execute function set_updated_at();

create table if not exists flavors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  slug text not null,
  cor text,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  unique (store_id, slug)
);

-- Unidade real controlada em estoque: Produto + Sabor
create table if not exists product_flavors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  flavor_id uuid not null references flavors(id) on delete cascade,
  sku text,
  preco_override numeric(12,2),
  estoque_minimo integer not null default 3,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, flavor_id)
);
create index if not exists idx_pf_product on product_flavors (product_id) where ativo;

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  warehouse_id uuid references warehouses(id) on delete set null,
  product_flavor_id uuid not null references product_flavors(id) on delete cascade,
  quantidade_total integer not null default 0,
  quantidade_reservada integer not null default 0,
  quantidade_disponivel integer generated always as (quantidade_total - quantidade_reservada) stored,
  custo_medio numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_flavor_id, warehouse_id),
  constraint chk_estoque_nao_negativo check (quantidade_total >= 0 and quantidade_reservada >= 0)
);
create index if not exists idx_inv_pf on inventory (product_flavor_id);

create table if not exists inventory_movements (
  id bigserial primary key,
  store_id uuid not null references stores(id) on delete cascade,
  product_flavor_id uuid not null references product_flavors(id) on delete cascade,
  warehouse_id uuid references warehouses(id) on delete set null,
  tipo movimento_tipo not null,
  quantidade integer not null,
  saldo_anterior integer not null default 0,
  saldo_posterior integer not null default 0,
  referencia_tipo text,
  referencia_id text,
  usuario_id uuid references profiles(id) on delete set null,
  custo_unitario numeric(12,2),
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mov_pf on inventory_movements (product_flavor_id, created_at desc);
create index if not exists idx_mov_ref on inventory_movements (referencia_tipo, referencia_id);

-- ---------- FORNECEDORES / NOTAS DE ENTRADA ----------
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  documento text, telefone text, email text, observacao text,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists purchase_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  numero_documento text,
  data date not null default current_date,
  valor_total numeric(12,2) not null default 0,
  observacao text,
  usuario_id uuid references profiles(id) on delete set null,
  status text not null default 'rascunho', -- rascunho | finalizada | cancelada
  finalizada_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists purchase_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references purchase_entries(id) on delete cascade,
  product_flavor_id uuid not null references product_flavors(id) on delete restrict,
  quantidade integer not null,
  custo_unitario numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0
);

-- =====================================================================
-- VIEW: catálogo pronto para o bot e para o painel
-- =====================================================================
create or replace view v_catalogo as
select
  pf.id                as product_flavor_id,
  pf.store_id,
  pf.sku,
  pf.ativo             as sabor_ativo,
  pf.estoque_minimo,
  p.id                 as product_id,
  p.nome               as produto,
  p.modelo,
  p.puffs,
  p.imagem_url,
  p.status             as produto_status,
  coalesce(pf.preco_override, p.preco) as preco,
  p.custo,
  b.id                 as brand_id,
  b.nome               as marca,
  f.id                 as flavor_id,
  f.nome               as sabor,
  coalesce(i.quantidade_total, 0)     as estoque_total,
  coalesce(i.quantidade_reservada, 0) as estoque_reservado,
  coalesce(i.quantidade_disponivel,0) as estoque_disponivel,
  coalesce(i.custo_medio, p.custo)    as custo_medio,
  (p.status = 'ativo' and pf.ativo and coalesce(i.quantidade_disponivel,0) > 0) as vendavel
from product_flavors pf
join products p on p.id = pf.product_id and p.deleted_at is null
join flavors  f on f.id = pf.flavor_id
left join brands b on b.id = p.brand_id
left join inventory i on i.product_flavor_id = pf.id;

-- ===================== 0004_vendas_financeiro.sql =====================

-- =====================================================================
-- LUXX PODS — 0004 VENDAS, PAGAMENTOS, FINANCEIRO, COMERCIAL
-- =====================================================================

-- ---------- CARRINHO ----------
create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  status carrinho_status not null default 'ativo',
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  entrega numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  coupon_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cart_conv on carts (conversation_id) where status = 'ativo';

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  product_flavor_id uuid not null references product_flavors(id) on delete restrict,
  quantidade integer not null default 1,
  preco_unitario numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  reservado boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- CUPONS ----------
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  codigo text not null,
  descricao text,
  tipo_desconto desconto_tipo not null default 'valor',
  valor numeric(12,2) not null default 0,
  inicio timestamptz,
  fim timestamptz,
  valor_minimo numeric(12,2) not null default 0,
  limite_total integer,
  limite_cliente integer,
  usos integer not null default 0,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now(),
  unique (store_id, codigo)
);

create table if not exists coupon_targets (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade
);

-- constraint não tem IF NOT EXISTS: sem a guarda, rodar o schema de novo
-- aborta aqui, e o arquivo promete ser idempotente
do $$ begin
  alter table carts add constraint fk_cart_coupon
    foreign key (coupon_id) references coupons(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- PEDIDOS ----------
create sequence if not exists order_number_seq start 1;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  numero_pedido text not null unique,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  address_id uuid references customer_addresses(id) on delete set null,
  endereco_snapshot jsonb,
  cliente_nome text,
  cliente_telefone text,
  atendente_id uuid references profiles(id) on delete set null,
  entregador_id uuid references profiles(id) on delete set null,
  canal canal_tipo not null default 'whatsapp',
  origem origem_acao not null default 'bot',
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  taxa_entrega numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  custo_total numeric(12,2) not null default 0,
  forma_pagamento pagamento_metodo not null default 'pix',
  status_pagamento pagamento_status not null default 'aguardando',
  status_pedido pedido_status not null default 'pendente',
  troco_para numeric(12,2),
  valor_troco numeric(12,2),
  coupon_id uuid references coupons(id) on delete set null,
  observacoes text,
  impresso boolean not null default false,
  impresso_em timestamptz,
  confirmado_em timestamptz,
  separado_em timestamptz,
  despachado_em timestamptz,
  entregue_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_status on orders (store_id, status_pedido, created_at desc);
create index if not exists idx_orders_created on orders (store_id, created_at desc);
create index if not exists idx_orders_customer on orders (customer_id);
drop trigger if exists trg_orders_updated on orders;
create trigger trg_orders_updated before update on orders for each row execute function set_updated_at();

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_flavor_id uuid references product_flavors(id) on delete set null,
  produto_nome text not null,
  sabor_nome text not null,
  marca_nome text,
  sku text,
  quantidade integer not null default 1,
  custo_unitario numeric(12,2) not null default 0,
  preco_unitario numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0
);
create index if not exists idx_oi_order on order_items (order_id);

create table if not exists order_status_history (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  status_anterior text,
  novo_status text not null,
  usuario_id uuid references profiles(id) on delete set null,
  origem origem_acao not null default 'sistema',
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_osh_order on order_status_history (order_id, created_at);

-- número público do pedido: LX-2026-000123
create or replace function gerar_numero_pedido() returns trigger language plpgsql as $$
begin
  if new.numero_pedido is null or new.numero_pedido = '' then
    new.numero_pedido := 'LX-' || to_char(now(),'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_order_numero on orders;
create trigger trg_order_numero before insert on orders for each row execute function gerar_numero_pedido();

-- histórico automático de status
create or replace function registrar_status_pedido() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, status_anterior, novo_status, origem)
    values (new.id, null, new.status_pedido::text, new.origem);
  elsif new.status_pedido is distinct from old.status_pedido then
    insert into order_status_history (order_id, status_anterior, novo_status, origem)
    values (new.id, old.status_pedido::text, new.status_pedido::text, 'sistema');
  end if;
  return new;
end $$;
drop trigger if exists trg_order_hist on orders;
create trigger trg_order_hist after insert or update on orders for each row execute function registrar_status_pedido();

-- ---------- PAGAMENTOS ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  gateway text,
  transaction_id text,
  external_id text,
  metodo pagamento_metodo not null default 'pix',
  valor numeric(12,2) not null default 0,
  status pagamento_status not null default 'aguardando',
  qr_code text,
  pix_copia_cola text,
  pago_em timestamptz,
  expiracao timestamptz,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_pay_txid on payments (gateway, transaction_id) where transaction_id is not null;
create index if not exists idx_pay_order on payments (order_id);

-- idempotência de webhooks
create table if not exists webhook_events (
  id bigserial primary key,
  origem text not null,
  event_id text not null,
  payload jsonb,
  processado boolean not null default false,
  processado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  unique (origem, event_id)
);

-- ---------- FINANCEIRO ----------
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  banco text, agencia text, conta text,
  tipo text default 'corrente',
  saldo_inicial numeric(12,2) not null default 0,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists financial_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  tipo text not null default 'despesa', -- receita | despesa
  cor text default '#7c3aed',
  status registro_status not null default 'ativo',
  unique (store_id, nome, tipo)
);

create table if not exists accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  categoria_id uuid references financial_categories(id) on delete set null,
  descricao text,
  valor numeric(12,2) not null default 0,
  vencimento date,
  pagamento date,
  bank_account_id uuid references bank_accounts(id) on delete set null,
  forma_pagamento pagamento_metodo,
  status financeiro_status not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ar_status on accounts_receivable (store_id, status, vencimento);

create table if not exists accounts_payable (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  categoria_id uuid references financial_categories(id) on delete set null,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  vencimento date,
  pagamento date,
  bank_account_id uuid references bank_accounts(id) on delete set null,
  forma_pagamento pagamento_metodo,
  status financeiro_status not null default 'pendente',
  documento text,
  anexo_url text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ap_status on accounts_payable (store_id, status, vencimento);

-- ---------- TROCAS ----------
create table if not exists exchanges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  order_item_id uuid references order_items(id) on delete set null,
  product_flavor_id uuid references product_flavors(id) on delete set null,
  quantidade integer not null default 1,
  motivo text,
  descricao text,
  status troca_status not null default 'solicitada',
  responsavel_id uuid references profiles(id) on delete set null,
  observacao_interna text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz
);

create table if not exists exchange_files (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  arquivo_url text not null,
  tipo text not null default 'foto',
  created_at timestamptz not null default now()
);

-- ---------- UPSELL ----------
create table if not exists upsell_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  produto_origem uuid references products(id) on delete cascade,
  produto_destino uuid references products(id) on delete cascade,
  mensagem text not null,
  tipo_desconto desconto_tipo not null default 'valor',
  desconto numeric(12,2) not null default 0,
  inicio timestamptz, fim timestamptz,
  prioridade integer not null default 0,
  status registro_status not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists upsell_events (
  id bigserial primary key,
  store_id uuid not null references stores(id) on delete cascade,
  rule_id uuid references upsell_rules(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  exibida boolean not null default true,
  aceita boolean,
  valor_gerado numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- AUTOMAÇÕES / JOBS ----------
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  nome text not null,
  gatilho text not null,
  condicoes jsonb not null default '{}'::jsonb,
  acao text not null,
  acao_config jsonb not null default '{}'::jsonb,
  delay_segundos integer not null default 0,
  status registro_status not null default 'ativo',
  execucoes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id bigserial primary key,
  store_id uuid references stores(id) on delete cascade,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  executar_em timestamptz not null default now(),
  status text not null default 'pendente', -- pendente | processando | concluido | cancelado | erro
  tentativas integer not null default 0,
  erro text,
  conversation_id uuid references conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  processado_em timestamptz
);
create index if not exists idx_jobs_fila on jobs (status, executar_em);

-- ===================== 0005_funcoes_rls.sql =====================

-- =====================================================================
-- LUXX PODS — 0005 FUNÇÕES CRÍTICAS, VIEWS, RLS E REALTIME
-- =====================================================================

-- ---------------------------------------------------------------------
-- MOVIMENTAÇÃO DE ESTOQUE ATÔMICA (nenhuma alteração sem histórico)
-- ---------------------------------------------------------------------
create or replace function mover_estoque(
  p_product_flavor_id uuid,
  p_tipo movimento_tipo,
  p_quantidade integer,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_usuario_id uuid default null,
  p_observacao text default null,
  p_custo_unitario numeric default null
) returns inventory
language plpgsql security definer as $$
declare
  v_inv inventory;
  v_store uuid;
  v_wh uuid;
  v_anterior integer;
  v_delta_total integer := 0;
  v_delta_reserva integer := 0;
begin
  if p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;

  select pf.store_id into v_store from product_flavors pf where pf.id = p_product_flavor_id;
  if v_store is null then raise exception 'Produto/sabor inexistente'; end if;
  select w.id into v_wh from warehouses w
    join stores s on s.id = w.store_id
   where s.id = v_store and w.principal limit 1;

  -- lock pessimista da linha de estoque
  select * into v_inv from inventory
   where product_flavor_id = p_product_flavor_id
   for update;

  if v_inv.id is null then
    insert into inventory (store_id, warehouse_id, product_flavor_id, quantidade_total, quantidade_reservada)
    values (v_store, v_wh, p_product_flavor_id, 0, 0)
    returning * into v_inv;
  end if;

  v_anterior := v_inv.quantidade_total - v_inv.quantidade_reservada;

  case p_tipo
    when 'entrada'            then v_delta_total :=  p_quantidade;
    when 'ajuste_positivo'    then v_delta_total :=  p_quantidade;
    when 'devolucao'          then v_delta_total :=  p_quantidade;
    when 'cancelamento'       then v_delta_total :=  p_quantidade;
    when 'ajuste_negativo'    then v_delta_total := -p_quantidade;
    when 'troca'              then v_delta_total := -p_quantidade;
    when 'reserva'            then v_delta_reserva :=  p_quantidade;
    when 'liberacao_reserva'  then v_delta_reserva := -p_quantidade;
    when 'venda'              then v_delta_total := -p_quantidade; v_delta_reserva := -p_quantidade;
  end case;

  -- REGRA CRÍTICA: nunca vender mais do que existe
  if (v_inv.quantidade_total + v_delta_total) < 0 then
    raise exception 'Estoque insuficiente (total % , solicitado %)', v_inv.quantidade_total, p_quantidade;
  end if;
  if (v_inv.quantidade_total + v_delta_total) - (v_inv.quantidade_reservada + v_delta_reserva) < 0 then
    raise exception 'Estoque disponível insuficiente: % disponível', v_inv.quantidade_total - v_inv.quantidade_reservada;
  end if;

  update inventory set
    quantidade_total     = quantidade_total + v_delta_total,
    quantidade_reservada = greatest(0, quantidade_reservada + v_delta_reserva),
    custo_medio = case
      when p_tipo = 'entrada' and p_custo_unitario is not null and (quantidade_total + v_delta_total) > 0
      then ((custo_medio * quantidade_total) + (p_custo_unitario * p_quantidade)) / (quantidade_total + v_delta_total)
      else custo_medio end,
    updated_at = now()
  where id = v_inv.id
  returning * into v_inv;

  insert into inventory_movements (
    store_id, product_flavor_id, warehouse_id, tipo, quantidade,
    saldo_anterior, saldo_posterior, referencia_tipo, referencia_id,
    usuario_id, custo_unitario, observacao)
  values (
    v_store, p_product_flavor_id, v_inv.warehouse_id, p_tipo, p_quantidade,
    v_anterior, v_inv.quantidade_total - v_inv.quantidade_reservada,
    p_referencia_tipo, p_referencia_id, p_usuario_id, p_custo_unitario, p_observacao);

  return v_inv;
end $$;

-- ---------------------------------------------------------------------
-- CONFIRMAR PEDIDO — transação completa (estoque + financeiro + lead)
-- ---------------------------------------------------------------------
create or replace function confirmar_pedido(p_order_id uuid, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare
  v_order orders;
  v_item  order_items;
  v_cat   uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido not in ('pendente','aguardando_pagamento') then
    return v_order; -- idempotente
  end if;

  -- baixa de estoque item a item (usa reserva quando existir)
  for v_item in select * from order_items where order_id = p_order_id loop
    if v_item.product_flavor_id is not null then
      perform mover_estoque(
        v_item.product_flavor_id, 'venda', v_item.quantidade,
        'order', p_order_id::text, p_usuario_id, 'Baixa por confirmação de pedido');
    end if;
  end loop;

  update orders set
    status_pedido  = 'confirmado',
    confirmado_em  = coalesce(confirmado_em, now())
  where id = p_order_id returning * into v_order;

  -- conta a receber
  select id into v_cat from financial_categories
   where store_id = v_order.store_id and tipo = 'receita' limit 1;

  insert into accounts_receivable (
    store_id, order_id, customer_id, categoria_id, descricao, valor,
    vencimento, pagamento, forma_pagamento, status)
  values (
    v_order.store_id, v_order.id, v_order.customer_id, v_cat,
    'Venda ' || v_order.numero_pedido, v_order.total,
    current_date,
    case when v_order.status_pagamento = 'aprovado' then current_date else null end,
    v_order.forma_pagamento,
    case when v_order.status_pagamento = 'aprovado' then 'pago'::financeiro_status else 'pendente'::financeiro_status end)
  on conflict do nothing;

  -- fila de impressão da comanda
  insert into jobs (store_id, tipo, payload) values
    (v_order.store_id, 'imprimir_pedido', jsonb_build_object('order_id', p_order_id));

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- CANCELAR PEDIDO — devolve estoque
-- ---------------------------------------------------------------------
create or replace function cancelar_pedido(p_order_id uuid, p_motivo text, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare v_order orders; v_item order_items;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido = 'cancelado' then return v_order; end if;

  if v_order.status_pedido in ('confirmado','em_separacao','saiu_para_entrega','entregue') then
    for v_item in select * from order_items where order_id = p_order_id loop
      if v_item.product_flavor_id is not null then
        perform mover_estoque(v_item.product_flavor_id, 'cancelamento', v_item.quantidade,
          'order', p_order_id::text, p_usuario_id, 'Devolução por cancelamento');
      end if;
    end loop;
  end if;

  update orders set status_pedido = 'cancelado', cancelado_em = now(),
    motivo_cancelamento = p_motivo where id = p_order_id returning * into v_order;

  update accounts_receivable set status = 'cancelado' where order_id = p_order_id;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- LIBERAR RESERVAS EXPIRADAS (job periódico)
-- ---------------------------------------------------------------------
create or replace function liberar_reservas_expiradas() returns integer
language plpgsql security definer as $$
declare v_cart carts; v_item cart_items; v_count integer := 0;
begin
  for v_cart in select * from carts where status = 'ativo' and expires_at < now() loop
    for v_item in select * from cart_items where cart_id = v_cart.id and reservado loop
      perform mover_estoque(v_item.product_flavor_id, 'liberacao_reserva', v_item.quantidade,
        'cart', v_cart.id::text, null, 'Carrinho expirado');
      update cart_items set reservado = false where id = v_item.id;
      v_count := v_count + 1;
    end loop;
    update carts set status = 'expirado' where id = v_cart.id;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- AGREGAÇÃO DE CLIENTE após pedido entregue/pago
-- ---------------------------------------------------------------------
create or replace function recalcular_cliente() returns trigger language plpgsql as $$
declare v_cid uuid;
begin
  v_cid := coalesce(new.customer_id, old.customer_id);
  if v_cid is null then return new; end if;
  update customers c set
    total_pedidos  = s.qtd,
    total_comprado = s.valor,
    ticket_medio   = case when s.qtd > 0 then s.valor / s.qtd else 0 end,
    ultima_compra  = s.ultima,
    primeira_compra = coalesce(c.primeira_compra, s.primeira)
  from (
    select count(*) qtd, coalesce(sum(total),0) valor, max(created_at) ultima, min(created_at) primeira
    from orders where customer_id = v_cid and status_pedido <> 'cancelado'
  ) s where c.id = v_cid;
  return new;
end $$;
drop trigger if exists trg_recalc_cliente on orders;
create trigger trg_recalc_cliente after insert or update of status_pedido, total on orders
for each row execute function recalcular_cliente();

-- =====================================================================
-- VIEWS DE DASHBOARD
-- =====================================================================
create or replace view v_pedidos_resumo as
select o.*,
  (select count(*) from order_items oi where oi.order_id = o.id) as itens_count,
  (select coalesce(sum(oi.quantidade),0) from order_items oi where oi.order_id = o.id) as itens_qtd,
  o.total - o.custo_total - o.desconto as lucro_estimado
from orders o;

create or replace view v_estoque_resumo as
select
  store_id,
  count(*)                                           as skus,
  coalesce(sum(estoque_total),0)                     as pecas,
  coalesce(sum(estoque_total * custo_medio),0)       as custo_estoque,
  coalesce(sum(estoque_total * preco),0)             as valor_venda_potencial,
  count(*) filter (where estoque_disponivel <= 0)    as sem_estoque,
  count(*) filter (where estoque_disponivel > 0 and estoque_disponivel <= estoque_minimo) as estoque_baixo
from v_catalogo group by store_id;

create or replace view v_funil as
select
  ps.store_id, ps.id as stage_id, ps.nome, ps.slug, ps.ordem, ps.cor, ps.tipo,
  count(l.id) as leads,
  coalesce(sum(l.valor_estimado),0) as valor
from pipeline_stages ps
left join leads l on l.stage_id = ps.id and l.status = 'aberto'
where ps.status = 'ativo'
group by ps.store_id, ps.id, ps.nome, ps.slug, ps.ordem, ps.cor, ps.tipo;

-- métricas do período (usadas pelo dashboard)
create or replace function dashboard_metricas(
  p_store_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns jsonb language sql stable as $$
  with ped as (
    select * from orders
     where store_id = p_store_id and created_at between p_inicio and p_fim
  ), validos as (
    select * from ped where status_pedido <> 'cancelado'
  ), conv as (
    select * from conversations
     where store_id = p_store_id and created_at between p_inicio and p_fim
  ), lds as (
    select * from leads where store_id = p_store_id and created_at between p_inicio and p_fim
  )
  select jsonb_build_object(
    'faturamento',        (select coalesce(sum(total),0) from validos),
    'cmv',                (select coalesce(sum(custo_total),0) from validos),
    'lucro_bruto',        (select coalesce(sum(total - custo_total - desconto),0) from validos),
    'pedidos',            (select count(*) from validos),
    'pedidos_cancelados', (select count(*) from ped where status_pedido = 'cancelado'),
    'pedidos_despachados',(select count(*) from validos where status_pedido = 'saiu_para_entrega'),
    'pedidos_entregues',  (select count(*) from validos where status_pedido = 'entregue'),
    'ticket_medio',       (select case when count(*) > 0 then coalesce(sum(total),0)/count(*) else 0 end from validos),
    'clientes_novos',     (select count(*) from customers where store_id = p_store_id and created_at between p_inicio and p_fim),
    'clientes_total',     (select count(*) from customers where store_id = p_store_id and deleted_at is null),
    'clientes_recorrentes',(select count(*) from customers where store_id = p_store_id and total_pedidos > 1),
    'leads',              (select count(*) from lds),
    'leads_ganhos',       (select count(*) from lds where status = 'ganho'),
    'leads_perdidos',     (select count(*) from lds where status = 'perdido'),
    'conversas',          (select count(*) from conv),
    'conversas_abertas',  (select count(*) from conversations where store_id = p_store_id and status = 'aberta'),
    'conversas_aguardando',(select count(*) from conversations where store_id = p_store_id and status = 'aguardando_cliente'),
    'conversas_nao_respondidas',(select count(*) from conversations where store_id = p_store_id and nao_lidas > 0),
    'mensagens_recebidas',(select count(*) from messages m join conversations c on c.id = m.conversation_id
                            where c.store_id = p_store_id and m.sender_type = 'cliente'
                              and m.created_at between p_inicio and p_fim),
    'taxa_conversao',     (select case when (select count(*) from lds) > 0
                              then round(100.0 * (select count(*) from lds where status='ganho') / (select count(*) from lds), 1)
                              else 0 end),
    'taxa_cancelamento',  (select case when (select count(*) from ped) > 0
                              then round(100.0 * (select count(*) from ped where status_pedido='cancelado') / (select count(*) from ped), 1)
                              else 0 end),
    'tempo_primeira_resposta', (select coalesce(round(avg(extract(epoch from (primeira_resposta_em - created_at))/60)::numeric,1),0)
                                from conv where primeira_resposta_em is not null),
    'faturamento_bot',    (select coalesce(sum(total),0) from validos where origem = 'bot')
  )
$$;

-- série diária para gráficos
create or replace function dashboard_serie(
  p_store_id uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (dia date, faturamento numeric, pedidos bigint, leads bigint)
language sql stable as $$
  select d::date,
    coalesce((select sum(o.total) from orders o where o.store_id = p_store_id
              and o.status_pedido <> 'cancelado' and o.created_at::date = d::date),0),
    coalesce((select count(*) from orders o where o.store_id = p_store_id
              and o.status_pedido <> 'cancelado' and o.created_at::date = d::date),0),
    coalesce((select count(*) from leads l where l.store_id = p_store_id
              and l.created_at::date = d::date),0)
  from generate_series(p_inicio::date, p_fim::date, interval '1 day') d
$$;

-- =====================================================================
-- RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'companies','stores','warehouses','roles','permissions','role_permissions','profiles',
    'user_permissions','settings','audit_logs','notifications','customers','customer_addresses',
    'pipeline_stages','conversations','leads','messages','tasks','calendar_events','brands',
    'categories','products','flavors','product_flavors','inventory','inventory_movements',
    'suppliers','purchase_entries','purchase_entry_items','carts','cart_items','coupons',
    'coupon_targets','orders','order_items','order_status_history','payments','webhook_events',
    'bank_accounts','financial_categories','accounts_receivable','accounts_payable','exchanges',
    'exchange_files','upsell_rules','upsell_events','automations','jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists p_auth_all on %I', t);
    execute format(
      'create policy p_auth_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- =====================================================================
-- REALTIME
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'conversations','messages','orders','order_items','leads','inventory',
    'notifications','tasks','payments','customers','products','product_flavors'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; when undefined_object then null; end;
  end loop;
end $$;

alter table messages replica identity full;
alter table conversations replica identity full;
alter table orders replica identity full;
alter table leads replica identity full;
alter table inventory replica identity full;

-- ===================== 0006_seed.sql =====================

-- =====================================================================
-- LUXX PODS — 0006 SEED (idempotente)
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

-- ===================== 0007_notas_entrada.sql =====================

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

-- ===================== 0008_ciclo_lead.sql =====================

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

-- ===================== 0009_correcoes_criticas.sql =====================

-- =====================================================================
-- LUXX PODS — 0009 CORREÇÕES CRÍTICAS
-- Bugs que só aparecem com dinheiro e concorrência de verdade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) DINHEIRO NA ENTREGA: entregar é receber.
--    Antes, o pedido virava "entregue" e o financeiro nunca via o dinheiro.
-- ---------------------------------------------------------------------
create or replace function receber_na_entrega(
  p_order_id uuid,
  p_usuario_id uuid default null
) returns orders
language plpgsql security definer as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pagamento = 'aprovado' then return v_order; end if;

  update orders set status_pagamento = 'aprovado'
   where id = p_order_id returning * into v_order;

  update accounts_receivable
     set status = 'pago', pagamento = current_date
   where order_id = p_order_id and status = 'pendente';

  insert into payments (store_id, order_id, metodo, valor, status, pago_em, gateway)
  values (v_order.store_id, p_order_id, v_order.forma_pagamento, v_order.total,
          'aprovado', now(), 'entrega')
  on conflict do nothing;

  insert into order_status_history (order_id, status_anterior, novo_status, usuario_id, origem, observacao)
  values (p_order_id, 'aguardando', 'aprovado', p_usuario_id, 'operador',
          'Recebido na entrega');

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- 2) RESERVA: a venda não pode comer a reserva de outro carrinho.
--
--    No tipo 'venda' o delta de total e de reserva se cancelavam, então a
--    checagem "disponível >= 0" nunca acusava falta: com 5 unidades todas
--    reservadas por terceiros, um pedido de 3 passava e derrubava a reserva
--    alheia. Agora a venda só consome reserva se ELA MESMA reservou antes.
-- ---------------------------------------------------------------------
-- `create or replace` com assinatura diferente não substitui: cria uma
-- SOBRECARGA. A de 0005 tem 8 parâmetros, esta tem 9 com default, e aí toda
-- chamada com 7 ou 8 argumentos fica ambígua ("function is not unique") —
-- o schema instalaria limpo e cada venda quebraria depois. A antiga sai.
drop function if exists mover_estoque(
  uuid, movimento_tipo, integer, text, text, uuid, text, numeric);

create or replace function mover_estoque(
  p_product_flavor_id uuid,
  p_tipo movimento_tipo,
  p_quantidade integer,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_usuario_id uuid default null,
  p_observacao text default null,
  p_custo_unitario numeric default null,
  /* quantas unidades desta venda já estavam reservadas por este pedido */
  p_reservado integer default 0
) returns inventory
language plpgsql security definer as $$
declare
  v_inv inventory;
  v_store uuid;
  v_wh uuid;
  v_anterior integer;
  v_delta_total integer := 0;
  v_delta_reserva integer := 0;
  v_consome_reserva integer := 0;
begin
  if p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;

  select pf.store_id into v_store from product_flavors pf where pf.id = p_product_flavor_id;
  if v_store is null then raise exception 'Produto/sabor inexistente'; end if;
  select w.id into v_wh from warehouses w where w.store_id = v_store and w.principal limit 1;

  select * into v_inv from inventory
   where product_flavor_id = p_product_flavor_id for update;

  if v_inv.id is null then
    insert into inventory (store_id, warehouse_id, product_flavor_id, quantidade_total, quantidade_reservada)
    values (v_store, v_wh, p_product_flavor_id, 0, 0)
    returning * into v_inv;
  end if;

  v_anterior := v_inv.quantidade_total - v_inv.quantidade_reservada;

  case p_tipo
    when 'entrada'            then v_delta_total :=  p_quantidade;
    when 'ajuste_positivo'    then v_delta_total :=  p_quantidade;
    when 'devolucao'          then v_delta_total :=  p_quantidade;
    when 'cancelamento'       then v_delta_total :=  p_quantidade;
    when 'ajuste_negativo'    then v_delta_total := -p_quantidade;
    when 'troca'              then v_delta_total := -p_quantidade;
    when 'reserva'            then v_delta_reserva :=  p_quantidade;
    when 'liberacao_reserva'  then v_delta_reserva := -p_quantidade;
    when 'venda' then
      -- só devolve à disponibilidade a reserva que ESTE pedido criou
      v_consome_reserva := least(greatest(p_reservado, 0), v_inv.quantidade_reservada);
      v_delta_total   := -p_quantidade;
      v_delta_reserva := -v_consome_reserva;
  end case;

  if (v_inv.quantidade_total + v_delta_total) < 0 then
    raise exception 'Estoque insuficiente: tem % unidades, pediu %',
      v_inv.quantidade_total, p_quantidade;
  end if;

  if (v_inv.quantidade_total + v_delta_total)
     - (v_inv.quantidade_reservada + v_delta_reserva) < 0 then
    raise exception 'Estoque disponível insuficiente: % livres (% reservadas para outros pedidos)',
      v_inv.quantidade_total - v_inv.quantidade_reservada, v_inv.quantidade_reservada;
  end if;

  update inventory set
    quantidade_total     = quantidade_total + v_delta_total,
    quantidade_reservada = greatest(0, quantidade_reservada + v_delta_reserva),
    custo_medio = case
      when p_tipo = 'entrada' and p_custo_unitario is not null and (quantidade_total + v_delta_total) > 0
      then ((custo_medio * quantidade_total) + (p_custo_unitario * p_quantidade)) / (quantidade_total + v_delta_total)
      else custo_medio end,
    updated_at = now()
  where id = v_inv.id
  returning * into v_inv;

  insert into inventory_movements (
    store_id, product_flavor_id, warehouse_id, tipo, quantidade,
    saldo_anterior, saldo_posterior, referencia_tipo, referencia_id,
    usuario_id, custo_unitario, observacao)
  values (
    v_store, p_product_flavor_id, v_inv.warehouse_id, p_tipo, p_quantidade,
    v_anterior, v_inv.quantidade_total - v_inv.quantidade_reservada,
    p_referencia_tipo, p_referencia_id, p_usuario_id, p_custo_unitario, p_observacao);

  return v_inv;
end $$;

-- ---------------------------------------------------------------------
-- 3) Confirmar pedido fecha o carrinho que o originou.
--    Sem isso, a rotina de expiração liberaria depois uma reserva que a
--    venda já consumiu — movimento falso e reserva corrompida.
-- ---------------------------------------------------------------------
create or replace function confirmar_pedido(p_order_id uuid, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare
  v_order orders;
  v_item  order_items;
  v_cat   uuid;
  v_cart  carts;
  v_reservado integer;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido not in ('pendente','aguardando_pagamento') then
    return v_order;
  end if;

  -- PIX só confirma com o dinheiro na conta
  if v_order.forma_pagamento = 'pix' and v_order.status_pagamento <> 'aprovado' then
    raise exception 'PIX ainda não foi aprovado: o pedido não pode ser confirmado';
  end if;

  select * into v_cart from carts
   where conversation_id = v_order.conversation_id and status = 'ativo'
   order by created_at desc limit 1;

  for v_item in select * from order_items where order_id = p_order_id loop
    if v_item.product_flavor_id is not null then
      -- o que este carrinho já tinha reservado deste item
      select coalesce(sum(ci.quantidade), 0) into v_reservado
        from cart_items ci
       where ci.cart_id = v_cart.id
         and ci.product_flavor_id = v_item.product_flavor_id
         and ci.reservado;

      perform mover_estoque(
        v_item.product_flavor_id, 'venda', v_item.quantidade,
        'order', p_order_id::text, p_usuario_id,
        'Baixa por confirmação de pedido', null, v_reservado);
    end if;
  end loop;

  -- o carrinho vira histórico: nada mais o expira nem libera reserva
  if v_cart.id is not null then
    update cart_items set reservado = false where cart_id = v_cart.id;
    update carts set status = 'convertido' where id = v_cart.id;
  end if;

  update orders set
    status_pedido  = 'confirmado',
    confirmado_em  = coalesce(confirmado_em, now())
  where id = p_order_id returning * into v_order;

  select id into v_cat from financial_categories
   where store_id = v_order.store_id and tipo = 'receita' limit 1;

  insert into accounts_receivable (
    store_id, order_id, customer_id, categoria_id, descricao, valor,
    vencimento, pagamento, forma_pagamento, status)
  values (
    v_order.store_id, v_order.id, v_order.customer_id, v_cat,
    'Venda ' || v_order.numero_pedido, v_order.total,
    current_date,
    case when v_order.status_pagamento = 'aprovado' then current_date else null end,
    v_order.forma_pagamento,
    case when v_order.status_pagamento = 'aprovado' then 'pago'::financeiro_status
         else 'pendente'::financeiro_status end)
  on conflict (order_id) do nothing;

  insert into jobs (store_id, tipo, payload) values
    (v_order.store_id, 'imprimir_pedido', jsonb_build_object('order_id', p_order_id));

  return v_order;
end $$;

-- a conta a receber é uma por pedido — o ON CONFLICT acima dependia disto
create unique index if not exists idx_ar_order_unico
  on accounts_receivable (order_id) where order_id is not null;

-- ---------------------------------------------------------------------
-- 4) Liberar reservas: um carrinho com problema não pode travar os outros.
-- ---------------------------------------------------------------------
create or replace function liberar_reservas_expiradas() returns integer
language plpgsql security definer as $$
declare v_cart carts; v_item cart_items; v_count integer := 0;
begin
  for v_cart in select * from carts where status = 'ativo' and expires_at < now() loop
    begin
      for v_item in select * from cart_items where cart_id = v_cart.id and reservado loop
        perform mover_estoque(v_item.product_flavor_id, 'liberacao_reserva',
          v_item.quantidade, 'cart', v_cart.id::text, null, 'Carrinho expirado');
        update cart_items set reservado = false where id = v_item.id;
        v_count := v_count + 1;
      end loop;
      update carts set status = 'expirado' where id = v_cart.id;
    exception when others then
      -- segue para o próximo carrinho em vez de abortar a rotina inteira
      raise warning 'Falha ao liberar o carrinho %: %', v_cart.id, sqlerrm;
    end;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 5) Cancelar pedido: dinheiro já recebido vira ESTORNO, não some.
-- ---------------------------------------------------------------------
create or replace function cancelar_pedido(
  p_order_id uuid, p_motivo text, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare v_order orders; v_item order_items; v_recebido numeric;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido = 'cancelado' then return v_order; end if;

  if v_order.status_pedido in ('confirmado','em_separacao','saiu_para_entrega','entregue') then
    for v_item in select * from order_items where order_id = p_order_id loop
      if v_item.product_flavor_id is not null then
        perform mover_estoque(v_item.product_flavor_id, 'cancelamento', v_item.quantidade,
          'order', p_order_id::text, p_usuario_id, 'Devolução por cancelamento');
      end if;
    end loop;
  end if;

  update orders set status_pedido = 'cancelado', cancelado_em = now(),
    motivo_cancelamento = p_motivo where id = p_order_id returning * into v_order;

  -- o que ainda não entrou é só cancelado
  update accounts_receivable set status = 'cancelado'
   where order_id = p_order_id and status = 'pendente';

  -- o que JÁ entrou precisa de contrapartida: sumir com dinheiro recebido
  -- do financeiro é como perder o registro de uma devolução
  select coalesce(sum(valor), 0) into v_recebido
    from accounts_receivable where order_id = p_order_id and status = 'pago';

  if v_recebido > 0 then
    insert into accounts_payable (
      store_id, categoria_id, descricao, valor, vencimento, status, observacao)
    values (
      v_order.store_id,
      (select id from financial_categories
        where store_id = v_order.store_id and tipo = 'despesa' order by nome limit 1),
      'Estorno do pedido ' || v_order.numero_pedido,
      v_recebido, current_date, 'pendente',
      coalesce(p_motivo, 'Pedido cancelado após o pagamento'));

    update payments set status = 'estornado'
     where order_id = p_order_id and status = 'aprovado';
  end if;

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- 6) Métricas do cliente só contam venda que aconteceu de verdade.
-- ---------------------------------------------------------------------
create or replace function recalcular_cliente() returns trigger language plpgsql as $$
declare v_cid uuid;
begin
  v_cid := coalesce(new.customer_id, old.customer_id);
  if v_cid is null then return new; end if;

  update customers c set
    total_pedidos  = s.qtd,
    total_comprado = s.valor,
    ticket_medio   = case when s.qtd > 0 then s.valor / s.qtd else 0 end,
    ultima_compra  = s.ultima,
    primeira_compra = coalesce(c.primeira_compra, s.primeira)
  from (
    select count(*) qtd, coalesce(sum(total),0) valor,
           max(created_at) ultima, min(created_at) primeira
      from orders
     where customer_id = v_cid
       -- pendente e aguardando pagamento ainda não são compra
       and status_pedido in ('confirmado','em_separacao','saiu_para_entrega','entregue')
  ) s where c.id = v_cid;

  return new;
end $$;

-- ===================== 0010_rls_por_perfil.sql =====================

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
  -- text, não jsonb: jsonb_array_elements_text devolve o nome sem aspas,
  -- e atribuir `customers` a um jsonb estoura com "invalid input syntax"
  tabela text;
begin
  for grupo in select jsonb_object_keys(grupos) loop
    for tabela in select * from jsonb_array_elements_text(grupos -> grupo) loop
      t := tabela;

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

-- ===================== 0011_criar_pedido.sql =====================

-- =====================================================================
-- LUXX PODS — 0011 CRIAR PEDIDO
--
-- Até aqui o sistema sabia confirmar, separar, entregar e cobrar um pedido,
-- mas não existia nenhum caminho que CRIASSE um. Esta função é esse caminho:
-- uma transação só, do carrinho ao pedido, com reserva de estoque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CARRINHO: abrir, adicionar item (reservando), remover, limpar.
-- ---------------------------------------------------------------------

create or replace function abrir_carrinho(
  p_conversation_id uuid default null,
  p_customer_id uuid default null,
  p_store_id uuid default null
) returns carts
language plpgsql security definer as $$
declare
  v_cart carts;
  v_store uuid;
  v_customer uuid;
  v_minutos integer;
begin
  -- reaproveita o carrinho aberto desta conversa, se houver
  if p_conversation_id is not null then
    select * into v_cart from carts
     where conversation_id = p_conversation_id and status = 'ativo'
     order by created_at desc limit 1;
    if v_cart.id is not null then return v_cart; end if;
  end if;

  select store_id, customer_id into v_store, v_customer
    from conversations where id = p_conversation_id;
  v_store := coalesce(p_store_id, v_store);
  v_customer := coalesce(p_customer_id, v_customer);
  if v_store is null then raise exception 'Loja não identificada'; end if;

  -- o tempo de reserva é configurável, não fixo no código
  select coalesce((valor ->> 'reserva_minutos')::integer, 15) into v_minutos
    from settings where store_id = v_store and chave = 'estoque';

  insert into carts (store_id, customer_id, conversation_id, status, expires_at)
  values (v_store, v_customer, p_conversation_id, 'ativo',
          now() + make_interval(mins => coalesce(v_minutos, 15)))
  returning * into v_cart;

  return v_cart;
end $$;

/**
 * Põe o item no carrinho E reserva a unidade.
 * Reservar aqui é o que impede dois clientes fecharem a última peça: se o
 * estoque não der, esta função levanta erro e nada é gravado.
 */
create or replace function adicionar_ao_carrinho(
  p_cart_id uuid,
  p_product_flavor_id uuid,
  p_quantidade integer default 1
) returns cart_items
language plpgsql security definer as $$
declare
  v_cart  carts;
  v_item  cart_items;
  v_preco numeric(12,2);
  v_minutos integer;
begin
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_cart from carts where id = p_cart_id for update;
  if v_cart.id is null then raise exception 'Carrinho não encontrado'; end if;
  if v_cart.status <> 'ativo' then raise exception 'Carrinho já fechado'; end if;

  select coalesce(pf.preco_override, p.preco) into v_preco
    from product_flavors pf
    join products p on p.id = pf.product_id
   where pf.id = p_product_flavor_id and pf.ativo and p.status = 'ativo';

  if v_preco is null then
    raise exception 'Este produto não está disponível para venda';
  end if;

  -- reserva primeiro: se faltar estoque, a transação inteira volta atrás
  perform mover_estoque(
    p_product_flavor_id, 'reserva', p_quantidade,
    'cart', p_cart_id::text, null, 'Reserva por item no carrinho');

  select * into v_item from cart_items
   where cart_id = p_cart_id and product_flavor_id = p_product_flavor_id;

  if v_item.id is null then
    insert into cart_items (
      cart_id, product_flavor_id, quantidade, preco_unitario, subtotal, reservado)
    values (
      p_cart_id, p_product_flavor_id, p_quantidade, v_preco,
      v_preco * p_quantidade, true)
    returning * into v_item;
  else
    update cart_items set
      quantidade = quantidade + p_quantidade,
      subtotal = (quantidade + p_quantidade) * preco_unitario,
      reservado = true
    where id = v_item.id returning * into v_item;
  end if;

  -- cada interação estende o prazo: quem está escolhendo não perde a reserva
  select coalesce((valor ->> 'reserva_minutos')::integer, 15) into v_minutos
    from settings where store_id = v_cart.store_id and chave = 'estoque';

  perform recalcular_carrinho(p_cart_id);
  update carts set expires_at = now() + make_interval(mins => coalesce(v_minutos, 15))
   where id = p_cart_id;

  return v_item;
end $$;

create or replace function remover_do_carrinho(
  p_cart_id uuid, p_product_flavor_id uuid, p_quantidade integer default null
) returns void
language plpgsql security definer as $$
declare v_item cart_items; v_tirar integer;
begin
  select * into v_item from cart_items
   where cart_id = p_cart_id and product_flavor_id = p_product_flavor_id;
  if v_item.id is null then return; end if;

  v_tirar := least(coalesce(p_quantidade, v_item.quantidade), v_item.quantidade);

  if v_item.reservado then
    perform mover_estoque(p_product_flavor_id, 'liberacao_reserva', v_tirar,
      'cart', p_cart_id::text, null, 'Item retirado do carrinho');
  end if;

  if v_tirar >= v_item.quantidade then
    delete from cart_items where id = v_item.id;
  else
    update cart_items set
      quantidade = quantidade - v_tirar,
      subtotal = (quantidade - v_tirar) * preco_unitario
    where id = v_item.id;
  end if;

  perform recalcular_carrinho(p_cart_id);
end $$;

/** Soma o carrinho com a taxa de entrega e o cupom da loja. */
create or replace function recalcular_carrinho(p_cart_id uuid) returns carts
language plpgsql security definer as $$
declare
  v_cart carts;
  v_subtotal numeric(12,2);
  v_entrega numeric(12,2) := 0;
  v_gratis numeric(12,2);
  v_desconto numeric(12,2) := 0;
  v_cupom coupons;
begin
  select * into v_cart from carts where id = p_cart_id;
  if v_cart.id is null then raise exception 'Carrinho não encontrado'; end if;

  select coalesce(sum(subtotal), 0) into v_subtotal
    from cart_items where cart_id = p_cart_id;

  select coalesce((valor ->> 'taxa_padrao')::numeric, 0),
         coalesce((valor ->> 'taxa_gratis_acima')::numeric, 0)
    into v_entrega, v_gratis
    from settings where store_id = v_cart.store_id and chave = 'entrega';

  if v_gratis > 0 and v_subtotal >= v_gratis then v_entrega := 0; end if;

  if v_cart.coupon_id is not null then
    select * into v_cupom from coupons where id = v_cart.coupon_id;
    if v_cupom.id is not null and v_subtotal >= v_cupom.valor_minimo then
      v_desconto := case v_cupom.tipo_desconto
        when 'percentual' then round(v_subtotal * v_cupom.valor / 100, 2)
        else least(v_cupom.valor, v_subtotal) end;
    end if;
  end if;

  update carts set
    subtotal = v_subtotal,
    entrega = coalesce(v_entrega, 0),
    desconto = v_desconto,
    total = v_subtotal + coalesce(v_entrega, 0) - v_desconto,
    updated_at = now()
  where id = p_cart_id returning * into v_cart;

  return v_cart;
end $$;

-- ---------------------------------------------------------------------
-- CRIAR PEDIDO: o carrinho vira venda.
--
-- Uma transação só. Se qualquer passo falhar, nada é gravado — não existe
-- pedido pela metade, nem estoque baixado sem pedido.
-- ---------------------------------------------------------------------
create or replace function criar_pedido(
  p_cart_id uuid,
  p_address_id uuid default null,
  p_forma_pagamento pagamento_metodo default 'pix',
  p_troco_para numeric default null,
  p_observacoes text default null,
  p_atendente_id uuid default null,
  p_origem origem_acao default 'operador'
) returns orders
language plpgsql security definer as $$
declare
  v_cart   carts;
  v_order  orders;
  v_item   cart_items;
  v_cliente customers;
  v_endereco customer_addresses;
  v_custo  numeric(12,2) := 0;
  v_itens  integer;
begin
  select * into v_cart from carts where id = p_cart_id for update;
  if v_cart.id is null then raise exception 'Carrinho não encontrado'; end if;
  if v_cart.status <> 'ativo' then raise exception 'Este carrinho já virou pedido'; end if;

  select count(*) into v_itens from cart_items where cart_id = p_cart_id;
  if v_itens = 0 then raise exception 'Carrinho vazio'; end if;

  -- troco só faz sentido em dinheiro, e precisa cobrir a conta
  if p_forma_pagamento = 'dinheiro' and p_troco_para is not null
     and p_troco_para < v_cart.total then
    raise exception 'O valor do troco (%) é menor que o total do pedido (%)',
      p_troco_para, v_cart.total;
  end if;

  perform recalcular_carrinho(p_cart_id);
  select * into v_cart from carts where id = p_cart_id;

  select * into v_cliente from customers where id = v_cart.customer_id;
  select * into v_endereco from customer_addresses where id = p_address_id;

  select coalesce(sum(ci.quantidade * coalesce(i.custo_medio, p.custo)), 0) into v_custo
    from cart_items ci
    join product_flavors pf on pf.id = ci.product_flavor_id
    join products p on p.id = pf.product_id
    left join inventory i on i.product_flavor_id = pf.id
   where ci.cart_id = p_cart_id;

  insert into orders (
    store_id, customer_id, conversation_id, lead_id, address_id,
    endereco_snapshot, cliente_nome, cliente_telefone, atendente_id, canal, origem,
    subtotal, desconto, taxa_entrega, total, custo_total,
    forma_pagamento, status_pagamento, status_pedido,
    troco_para, valor_troco, coupon_id, observacoes)
  values (
    v_cart.store_id, v_cart.customer_id, v_cart.conversation_id,
    (select id from leads where conversation_id = v_cart.conversation_id
      and status = 'aberto' order by created_at desc limit 1),
    p_address_id,
    case when v_endereco.id is null then null else jsonb_build_object(
      'rua', v_endereco.rua, 'numero', v_endereco.numero,
      'bairro', v_endereco.bairro, 'cidade', v_endereco.cidade,
      'complemento', v_endereco.complemento, 'referencia', v_endereco.referencia)
    end,
    v_cliente.nome, v_cliente.telefone, p_atendente_id,
    coalesce((select canal from conversations where id = v_cart.conversation_id), 'manual'),
    p_origem,
    v_cart.subtotal, v_cart.desconto, v_cart.entrega, v_cart.total, v_custo,
    p_forma_pagamento,
    'aguardando',
    case when p_forma_pagamento = 'pix' then 'aguardando_pagamento'::pedido_status
         else 'pendente'::pedido_status end,
    p_troco_para,
    case when p_troco_para is not null then p_troco_para - v_cart.total else null end,
    v_cart.coupon_id, p_observacoes)
  returning * into v_order;

  -- snapshot comercial: o pedido antigo não muda quando o preço mudar
  insert into order_items (
    order_id, product_flavor_id, produto_nome, sabor_nome, marca_nome, sku,
    quantidade, custo_unitario, preco_unitario, desconto, subtotal)
  select
    v_order.id, ci.product_flavor_id, c.produto, c.sabor, c.marca, c.sku,
    ci.quantidade, c.custo_medio, ci.preco_unitario, ci.desconto, ci.subtotal
  from cart_items ci
  join v_catalogo c on c.product_flavor_id = ci.product_flavor_id
  where ci.cart_id = p_cart_id;

  -- o cupom só conta uso quando vira pedido de verdade
  if v_cart.coupon_id is not null then
    update coupons set usos = usos + 1 where id = v_cart.coupon_id;
  end if;

  -- o carrinho fica marcado, mas a reserva continua de pé até a confirmação:
  -- é ela que segura a peça enquanto o PIX não cai
  update carts set status = 'convertido' where id = p_cart_id;

  -- dinheiro não espera pagamento: já pode ser confirmado e separado
  if p_forma_pagamento = 'dinheiro' then
    v_order := confirmar_pedido(v_order.id, p_atendente_id);
  end if;

  return v_order;
end $$;

-- confirmar_pedido lê cart_items do carrinho 'ativo'; depois de convertido,
-- a reserva a consumir é a que ficou marcada nos itens
create or replace function confirmar_pedido(p_order_id uuid, p_usuario_id uuid default null)
returns orders language plpgsql security definer as $$
declare
  v_order orders;
  v_item  order_items;
  v_cat   uuid;
  v_cart  carts;
  v_reservado integer;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if v_order.status_pedido not in ('pendente','aguardando_pagamento') then
    return v_order;
  end if;

  if v_order.forma_pagamento = 'pix' and v_order.status_pagamento <> 'aprovado' then
    raise exception 'PIX ainda não foi aprovado: o pedido não pode ser confirmado';
  end if;

  select * into v_cart from carts
   where conversation_id = v_order.conversation_id
     and status in ('ativo','convertido')
   order by created_at desc limit 1;

  for v_item in select * from order_items where order_id = p_order_id loop
    if v_item.product_flavor_id is not null then
      select coalesce(sum(ci.quantidade), 0) into v_reservado
        from cart_items ci
       where ci.cart_id = v_cart.id
         and ci.product_flavor_id = v_item.product_flavor_id
         and ci.reservado;

      perform mover_estoque(
        v_item.product_flavor_id, 'venda', v_item.quantidade,
        'order', p_order_id::text, p_usuario_id,
        'Baixa por confirmação de pedido', null, coalesce(v_reservado, 0));
    end if;
  end loop;

  if v_cart.id is not null then
    update cart_items set reservado = false where cart_id = v_cart.id;
    update carts set status = 'convertido' where id = v_cart.id;
  end if;

  update orders set
    status_pedido  = 'confirmado',
    confirmado_em  = coalesce(confirmado_em, now())
  where id = p_order_id returning * into v_order;

  select id into v_cat from financial_categories
   where store_id = v_order.store_id and tipo = 'receita' limit 1;

  insert into accounts_receivable (
    store_id, order_id, customer_id, categoria_id, descricao, valor,
    vencimento, pagamento, forma_pagamento, status)
  values (
    v_order.store_id, v_order.id, v_order.customer_id, v_cat,
    'Venda ' || v_order.numero_pedido, v_order.total,
    current_date,
    case when v_order.status_pagamento = 'aprovado' then current_date else null end,
    v_order.forma_pagamento,
    case when v_order.status_pagamento = 'aprovado' then 'pago'::financeiro_status
         else 'pendente'::financeiro_status end)
  on conflict (order_id) do nothing;

  insert into jobs (store_id, tipo, payload) values
    (v_order.store_id, 'imprimir_pedido', jsonb_build_object('order_id', p_order_id));

  return v_order;
end $$;
