# Luxx Pods — Sistema de Operação

Atendimento por WhatsApp e Instagram, catálogo, estoque, pedidos, entregas e
financeiro — tudo no mesmo fluxo, com **uma única fonte de verdade**.

Stack: **Next.js 16 · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + Realtime) · Vercel**

---

## Rodar agora

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`. **Sem nenhuma configuração**, o painel sobe com a
base de demonstração: 20 clientes, 20 conversas, 16 pedidos, 10 modelos de pod e
75 combinações produto + sabor. Todas as telas funcionam e são navegáveis.

O aviso no topo mostra em qual modo você está: `Base de demonstração` ou `Supabase conectado`.

---

## Conectar ao Supabase (~5 minutos)

1. Crie o projeto em [supabase.com](https://supabase.com) → **New project**
   (região sugerida: `South America (São Paulo)`).
2. No painel do projeto, vá em **SQL Editor** → **New query**.
3. Cole o conteúdo inteiro de [`supabase/schema-completo.sql`](supabase/schema-completo.sql) e rode.
   Cria todas as tabelas, funções, views, RLS, realtime e o seed inicial.
   É idempotente — rodar de novo não duplica nada.
4. Vá em **Project Settings → API** e copie:
   - `Project URL`
   - `anon public` key
   - `service_role` key (só para o servidor)
5. Preencha o `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_STORE_ID=22222222-2222-2222-2222-222222222222
```

6. Reinicie o `npm run dev`. O aviso no topo vira **Supabase conectado** e todas
   as telas passam a ler e gravar no banco real.

---

## Deploy na Vercel

```bash
npx vercel            # primeira vez: vincula o projeto
npx vercel --prod     # publica
```

Depois adicione as mesmas variáveis em **Vercel → Settings → Environment Variables**.

---

## Arquitetura

```
src/
  app/(painel)/        telas do sistema (layout com sidebar + topbar)
  app/api/             rotas de leitura usadas pelo chat ao vivo
  components/          UI, dashboard, chat, kanban, catálogo, pedidos
  lib/
    data.ts            camada única de leitura (Supabase → fallback demo)
    actions.ts         escritas (Server Actions)
    demo.ts            base de demonstração, mesmo shape do banco
    types.ts           tipos do domínio
    labels.ts          rótulos e cores de status
supabase/
  migrations/          0001 core · 0002 CRM · 0003 catálogo/estoque
                       0004 vendas/financeiro · 0005 funções/RLS · 0006 seed
  schema-completo.sql  tudo junto, para colar no SQL Editor
```

### Regras críticas já implementadas no banco

| Regra | Onde |
|---|---|
| Estoque nunca fica negativo, mesmo com dois clientes simultâneos | `mover_estoque()` com `SELECT ... FOR UPDATE` |
| Nenhuma alteração de estoque sem histórico | `inventory_movements` gravado dentro da mesma função |
| Confirmar pedido é transacional (estoque + financeiro + impressão) | `confirmar_pedido()` |
| Cancelar pedido devolve o estoque | `cancelar_pedido()` |
| Reserva de carrinho expira e libera o estoque | `liberar_reservas_expiradas()` |
| Número público do pedido (`LX-2026-000123`) | trigger `gerar_numero_pedido()` |
| Histórico de todo status de pedido | trigger `registrar_status_pedido()` |
| Webhook não processa o mesmo evento duas vezes | `webhook_events (origem, event_id)` único |
| Preço do pedido antigo não muda quando o produto muda | snapshot em `order_items` |
| Multiloja desde o início | `companies → stores → warehouses` |

### Nada fica fixo no código

Taxa de entrega, tempo de follow-up, mensagens, catálogo PNG, estoque mínimo,
tempo de reserva, chave PIX, horário de funcionamento, etapas do Kanban,
formas de pagamento — tudo na tabela `settings`, por loja.

---

## Estado da entrega

**Etapa 1 — painel operacional ✅**

Dashboard em tempo real · Painel de atendimento · Conversas ao vivo (WhatsApp +
Instagram na mesma caixa, com assumir/devolver ao bot) · Kanban de leads ·
Clientes com ficha completa · Pedidos com comanda 80mm · Catálogo produto+sabor
com estoque editável · Produtos · Sabores · Estoque com movimentações ·
Entregas · Financeiro · Relatórios · Configurações · Permissões · Logs.

**MVP 2 — gestão completa ✅**

Cupons (CRUD) · Upsell com medição de conversão (CRUD) · Trocas com fluxo de
aprovação e devolução ao estoque · Notas de entrada que sobem o estoque e
recalculam o custo médio · Contas a pagar e a receber com baixa e vencimento ·
Contas bancárias com saldo · Categorias financeiras (CRUD) · Usuários e perfis ·
Calendário de rotinas (CRUD) · Tarefas (CRUD).

**Refinamentos ✅**

| Melhoria | Onde |
|---|---|
| Paginação em todas as listas longas (§47) | 25/50/100/200 por página, com janela de páginas |
| Busca global com `⌘K` / `Ctrl+K` (§48) | Cliente, telefone, pedido, marca, sabor e SKU |
| Central de notificações (§49) | Derivada do estado real: conversas sem resposta, estoque esgotado, contas vencidas, entregas paradas |
| Exportação CSV (§52) | Pedidos, clientes, catálogo, movimentações e financeiro — respeitando os filtros da tela |
| Período personalizado (§51) | Intervalo livre + atalhos de 7/15/30/90 dias |
| Aviso de cada ação | Toast de sucesso e de erro, com reversão do estado quando a gravação falha |
| Telas de erro e carregamento | `loading`, `error`, `not-found` e `global-error` |
| Acessibilidade | Foco visível, rótulos em todos os botões de ícone, `prefers-reduced-motion` e `prefers-contrast` |
| Kanban no celular | Botão "mover para" além do arrastar, que não funciona em toque |
| Estados vazios nos gráficos | Explica que o período não tem movimento, em vez de um gráfico em branco |
| Menos consultas por navegação | A barra lateral usa `count` em vez de carregar as listas inteiras |

**Próximo — o bot**

Webhook da Meta, motor de conversa com funções validadas
(`buscar_sabores`, `adicionar_carrinho`, `criar_pagamento`, `confirmar_pedido`),
follow-up de 5 minutos por fila e confirmação automática do PIX.

---

## Como o painel funciona sem o Supabase

Toda leitura passa por `lib/data.ts` e `lib/data-mvp2.ts`; toda escrita por
`lib/actions.ts` e `lib/actions-mvp2.ts`. Cada função tenta o Supabase e, quando
não há credenciais, usa a base de demonstração — **mesma assinatura, mesmo shape**.
Por isso conectar o banco depois não exige reescrever nenhuma tela: basta
preencher o `.env.local`.

No modo demonstração as alterações ficam em memória no servidor e se perdem ao
reiniciar. Com o Supabase conectado, tudo é persistido.
# luxxpods
