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
