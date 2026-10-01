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
