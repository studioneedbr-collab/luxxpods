# Luxx Pods — Sistema de Operação

Atendimento por WhatsApp e Instagram, catálogo, estoque, pedidos, entregas e
financeiro no mesmo fluxo, com **uma única fonte de verdade**.

**Next.js 16 · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + Realtime) · Vercel**

---

## Rodar

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 82 testes dos núcleos de regra
```

Sem nenhuma configuração o painel sobe com a **base de demonstração**: 20
clientes, 20 conversas, 16 pedidos, 10 modelos e 75 combinações produto+sabor.
Tudo é editável — criar, editar e excluir funcionam de verdade, com as mesmas
regras que o banco aplica. O que muda ao conectar o Supabase é só onde o dado
fica guardado.

**Login**: qualquer e-mail entra enquanto não há banco (só fora de produção).

---

## Conectar o Supabase (~5 min)

1. [supabase.com](https://supabase.com) → **New project** (região `South America (São Paulo)`)
2. **SQL Editor** → cole [`supabase/schema-completo.sql`](supabase/schema-completo.sql) inteiro → Run
3. **Settings → API** → copie `Project URL`, `anon public` e `service_role`
4. Preencha o `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_STORE_ID=22222222-2222-2222-2222-222222222222
```

5. Reinicie o `npm run dev`.

Depois disso, crie o primeiro usuário em **Authentication → Users** e ligue o
perfil dele a `admin` na tabela `profiles`.

---

## Onde está cada coisa

```
src/app/          rotas — (auth) login, (painel) o sistema, api/ webhooks e cron
src/components/   telas, por assunto: pedidos, estoque, financeiro, chat…
src/lib/          as regras — bot/, pagamento/, pix/, fila/, supabase/
supabase/         migrations/ é a fonte da verdade do banco
docs/             a especificação e os arquivos-fonte da marca
scripts/          utilitários de manutenção
public/marca/     só o que o navegador serve
```

Dois arquivos merecem nota:

- **`supabase/schema-completo.sql`** é gerado, não escrito. Ele junta as
  migrações num arquivo só para colar no SQL Editor de uma vez. Mudou o banco?
  Crie a migração e rode `npm run schema`. Editar o combinado à mão faz ele
  desencontrar das migrações — já aconteceu: ficou sem a que cria o pedido, e
  quem colasse montaria um banco que não vende.
- **`docs/marca/Logo Insta.psd`** fica fora do repositório de propósito. São
  90 MB que ninguém abre em revisão de código.

## Regras que o banco garante

Estas não dependem da tela: valem para o painel, para o bot e para quem chamar
a API direto.

| Regra | Onde |
|---|---|
| Estoque nunca fica negativo, mesmo com dois pedidos simultâneos | `mover_estoque()` com `SELECT … FOR UPDATE` |
| Nenhuma alteração de estoque sem histórico | `inventory_movements`, gravado na mesma função |
| Venda só consome a reserva que ela mesma criou | `mover_estoque`, tipo `venda` |
| PIX não confirma pedido enquanto não cair | `confirmar_pedido()` |
| Criar pedido é uma transação só | `criar_pedido()` |
| Cancelar devolve estoque e **estorna** o que já foi pago | `cancelar_pedido()` |
| Entregar em dinheiro **é** receber | `receber_na_entrega()` |
| Nota de entrada não mexe em nada até ser concluída | `concluir_nota_entrada()` |
| Reserva de carrinho expira e libera sozinha | `liberar_reservas_expiradas()` |
| Número público do pedido (`LX-2026-000123`) | trigger `gerar_numero_pedido()` |
| Preço do pedido antigo não muda quando o produto muda | snapshot em `order_items` |
| Lead fecha quando a venda fecha; cliente que volta abre outro | trigger `fechar_lead_do_pedido()` |
| Cada perfil vê e altera só o seu setor | RLS por perfil (`0010`) |
| Webhook não processa o mesmo evento duas vezes | `webhook_events (origem, event_id)` |

---

## O que está pronto

**Vender** — pedido de balcão em [/pedidos/novo](src/app/(painel)/pedidos/novo):
cliente, carrinho com reserva, endereço, PIX ou dinheiro com troco. Comanda
80 mm para impressão. Fluxo de status validado no servidor, uma etapa por vez.

**Atender** — caixa de entrada única (WhatsApp + Instagram), assumir do bot e
devolver, ficha do cliente ao lado. Kanban com o ciclo do atendimento.

**Estoque** — catálogo produto+sabor com ajuste inline, adicionar e remover
sabor, movimentações com saldo antes e depois. Nota de entrada em três etapas
(trânsito → conferência → concluída) com freteiro embutido no custo médio.

**Gerir** — clientes, produtos, cupons, upsell com conversão medida, trocas,
contas a pagar e receber, contas bancárias, categorias, calendário, tarefas.

**Ver** — dashboard com período livre, funil, relatórios de vendas, estoque e
chatbot, exportação CSV, busca global em ⌘K, notificações do que precisa de ação.

**Receber** — três caminhos, e a escolha é uma troca real:

| | copia-e-cola no chat | confirma sozinho |
|---|---|---|
| **Asaas** | sim | sim |
| PIX estático (sem gateway) | sim | não, baixa manual |

O Asaas usa QR Code estático com valor (`POST /pix/qrCodes/static`), que
devolve o `payload` — o copia-e-cola de verdade — e dispara webhook quando é
pago. A cobrança comum do Asaas também confirmaria sozinha, mas exige o CPF do
cliente antes de gerar o código, e pedir documento no meio da conversa derruba
venda.

A InfinitePay foi avaliada e descartada: o `POST /links` dela devolve só uma
URL de checkout, nunca o copia-e-cola, e isso custa um clique do cliente num
atendimento que acontece inteiro dentro do chat.

Painel e bot usam o mesmo `meioAtivo()`, para o bot nunca mandar um código
estático que o gateway não enxerga — isso deixaria um pedido pago parado
esperando baixa manual. Quando o webhook não chega, o painel pergunta ao
provedor em vez de esperar.

**Conversar** — webhook do WhatsApp recebendo, motor de conversa ligado às 20
ferramentas, fila de jobs consumida por cron a cada minuto (follow-up,
impressão, expiração de reserva), controle de ritmo de envio.

---

## O que falta

Levantado por uma varredura com um auditor por área, em 2 de outubro de 2026.
Ordenado por quanto custa, não por tamanho.

### Esperando migração no banco

As duas estão escritas e revisadas; falta rodar.

- **`0015`** — reserva presa quando PIX é abandonado e cancelado (algumas
  vezes e o sistema diz "esgotado" com produto na prateleira), o `ON CONFLICT`
  com índice parcial que sobrevivia em `payments` (nenhum pagamento era
  gravado), entrega paga em cartão ou transferência que não registrava o
  dinheiro, e o lucro bruto que descontava o desconto duas vezes.
- **`0016`** — a troca passa a mexer no estoque, com a peça de reposição
  baixando e a defeituosa não voltando à prateleira.

### Mexe em dinheiro ou estoque

- **Nota de entrada pode gerar conta a pagar duplicada.** Pagar o fornecedor,
  reabrir a nota e concluir de novo cria uma segunda conta: a reabertura só
  cancela conta não paga, mas limpa o vínculo sem condição.
- **"Dar baixa" no financeiro não fecha o pedido.** `baixarLancamento` só
  mexe em `accounts_receivable`; o painel do financeiro calcula recebido a
  partir de `orders.status_pagamento`. As duas telas mostram números
  diferentes para o mesmo dinheiro.
- **Baixa em lançamento cancelado ressuscita a receita.** O botão "Recebi"
  aparece em lançamento que o cancelamento de pedido já marcou como cancelado,
  e a ação não confere o status.
- **Saldo de conta bancária ignora venda e nota.** Nenhum lançamento
  automático preenche `bank_account_id`, e a baixa não pergunta em qual conta
  o dinheiro entrou. O saldo consolidado só reflete lançamento feito à mão.
- **Excluir pedido cancelado apaga a conta a receber paga** e deixa o estorno
  órfão em contas a pagar.
- **Categoria escolhida pelo banco é arbitrária** — o estorno cai na primeira
  despesa em ordem alfabética ("Aluguel"), e a receita da venda pode cair numa
  categoria inativa.

### Diz que fez e não fez

Todas pela mesma causa: `UPDATE`/`DELETE` barrado por controle de acesso não
é erro no Postgres — ele filtra as linhas e devolve sucesso com zero linhas.
São **47 escritas** sem conferência de quantas linhas mudaram. Só morde com
usuário que não é administrador, e hoje os dois são.

O agravante que custa: em "Marcar entregue" o update silenciosamente vazio é
seguido de `receber_na_entrega`, que ignora o controle de acesso — o dinheiro
é marcado como recebido num pedido que o sistema não considera entregue.

### Promessa falsa na interface

- **Tela de Permissões é só visual.** `user_permissions` nunca é escrita nem
  lida, e o texto promete concessão individual que não existe. Das 20
  permissões, só `gerenciar_usuarios` é consultada em algum lugar.
- **`audit_logs` nunca recebe escrita**, e a tela de Logs afirma que registra
  alteração de preço, exclusão e criação de usuário. O que ela mostra é o
  histórico de estoque.
- **`/impressao` mostra estado fixo no código** — configure a impressora e a
  tela continua dizendo que não há.
- **`notifications` nunca é escrita** — as notificações do topo são todas
  derivadas, o que funciona, mas a tabela existe sem uso.

### Falta tela

- **Cadastrar marca.** `salvarMarca` e `excluirMarca` existem e nada as chama:
  as 6 marcas atuais só existem porque o seed criou. E o cadastro de produto
  descobre a marca procurando outro produto que já a use, então marca sem
  produto nunca aparece.
- **Editar e desativar fornecedor.** `excluirFornecedor` existe e não é
  chamada; só há "Novo fornecedor".
- **Cancelar nota de entrada.** `cancelarNota` existe e não é chamada; nota
  lançada por engano não tem saída.
- **Reabrir troca.** `reabrir_troca` existe no banco e a tela não oferece.
- **SKU e estoque mínimo por sabor** não têm campo em lugar nenhum: os 80
  SKUs estão com `sku` nulo e `estoque_minimo` no padrão 3.

### Horário

Duas telas de servidor formatam sem fuso, então saem em UTC na Vercel — e
"entregues hoje" usa o relógio do servidor, fazendo toda entrega depois das
21h de Brasília contar como amanhã e desaparecer do painel.

### Canais e integrações

- **WhatsApp**: o Z-API está implementado e espera três credenciais. Sem
  credencial o canal simulado responde "enviada" para mensagem que não saiu.
- **Instagram Direct**: previsto na caixa de entrada, falta o adaptador. A
  tela de integrações anuncia um webhook que não existe.
- **Impressora térmica**: a comanda entra na fila ao confirmar o pedido e
  ninguém consome. Uma página web não detecta impressora USB nem imprime
  sozinha — precisa de WebUSB (Chrome, autorização uma vez) ou de um agente
  rodando no computador da loja.

### Dívida conhecida

- Upsell não aparece no fluxo de venda do painel (o bot já oferece).
- `limite_cliente` do cupom não é verificado em lugar nenhum.
- Telas de dinheiro truncadas em 300 registros, com filtro de período
  aplicado depois do corte.
- Relatórios de clientes e produtos; exportação em Excel e PDF (hoje só CSV).
- 2FA, rotina de backup, alertas de monitoramento.
- As políticas de acesso não filtram por loja — irrelevante com uma loja,
  vaza entre lojas no dia em que houver duas.

---

## Decisões que valem saber

**Erro do banco não vira dado de demonstração.** Se uma consulta falha com o
Supabase conectado, a tela diz que não carregou. Cair na demonstração ali
mostraria 16 pedidos fictícios como se fossem reais — o pior modo de falha num
sistema de dinheiro: silencioso e plausível.

**Rota nasce fechada.** O porteiro usa lista de permissão: tudo exige sessão, e
o que fica aberto está escrito e nomeado em [`src/proxy.ts`](src/proxy.ts). Um
teste lê esse arquivo como texto e falha se alguém abrir rota nova sem
atualizar o teste junto.

**Nada de controle nativo do navegador.** Select, calendário e campos de
dinheiro e documento são próprios — o nativo muda de cara em cada sistema
operacional e quebra a identidade do painel.

**Telefone é validado, nunca "consertado".** Um celular de 8 dígitos é
recusado, não ganha um 9 na frente: número remendado é mensagem entregue para
a pessoa errada.

**Regra de negócio fica no banco.** Estoque, confirmação de pedido e nota de
entrada são funções PL/pgSQL. Assim a regra vale igual para o painel, para o
bot e para qualquer integração futura.

**Webhook de pagamento não é prova de pagamento.** O corpo que chega diz o
valor, e ele é conferido contra o total do pedido antes de qualquer confirmação
— divergência para mais ou para menos abre tarefa urgente em vez de liberar a
venda. Um corpo sem valor conta como zero e também não passa. A decisão inteira
mora em [`conferencia-core.ts`](src/lib/pagamento/conferencia-core.ts), pura e
testada, e vale igual na base real e na de demonstração.

**O id do evento leva a situação junto, não o nome do evento.** O Asaas manda
`PAYMENT_CONFIRMED` e depois `PAYMENT_RECEIVED` da **mesma** cobrança — os dois dizem que o dinheiro entrou,
então viram o mesmo id de propósito. Sem isso, toda venda geraria uma tarefa
urgente de cobrança em duplicidade que não existe.

**Pagamento dobrado é só quando a transação é outra.** A recepção olha qual
transação pagou o pedido antes de gritar: o mesmo pagamento confirmando de novo
é progressão de status; outra transação num pedido pago é dinheiro a mais, e aí
abre tarefa urgente para conferir estorno.
