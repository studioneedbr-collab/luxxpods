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
