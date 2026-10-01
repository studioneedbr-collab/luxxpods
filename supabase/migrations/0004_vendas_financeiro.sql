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
