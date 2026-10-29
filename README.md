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
src/lib/          as regras — bot/, ia/, pagamento/, pix/, fila/, supabase/
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

### Migrações

`0015` foi aplicada em 29/10/2026. As seguintes vieram de linhas de trabalho
diferentes e precisam ser conferidas antes de confiar no sistema:

- **`0016`** — a troca passa a mexer no estoque, com a peça de reposição
  baixando e a defeituosa não voltando à prateleira.
- **`0017`** — `v_perfil_cliente`, as preferências do cliente.
- **`0018`** — a auditoria de segurança e velocidade do banco.

Rodar fora de ordem, ou pular uma, deixa o sistema num estado que o código
não espera. `supabase/schema-completo.sql` é gerado e junta todas.

### Corrigido na auditoria de 28/10/2026 (migração `0018`)

- Webhooks do WhatsApp e do Asaas recusam tudo em produção quando falta o
  segredo, e só aceitam o provedor que está no ar. Antes, sem
  `ZAPI_WEBHOOK_SECRET`, qualquer pessoa forjava mensagem de cliente.
- As funções críticas do banco (estoque, pedido, dinheiro) só rodam pela
  chave de serviço; o painel chama por `src/lib/rpc-autorizada.ts`, que
  confere o perfil antes. Ninguém mais se promove a admin editando o perfil.
- Baixa em lançamento cancelado é recusada, e a baixa da conta a receber
  atualiza o pedido. Lançamento pago ou de pedido não pode ser excluído;
  pedido com dinheiro recebido ou estornado não pode ser apagado.
- Reabrir e concluir nota de entrada não duplica mais a conta a pagar, e a
  conclusão não engole mais o erro do financeiro.
- "Marcar entregue" confere que o pedido mudou antes de registrar o
  recebimento; PIX manual só confirma pedido que espera pagamento.
- Troca grava o sabor de reposição; pedido do painel não herda mais o
  carrinho do bot; a conversa mostra as 400 mensagens mais recentes.
- Horário: o "hoje" do painel, das entregas, do financeiro e do banco é o de
  Brasília.
- Velocidade: o webhook responde antes do bot terminar; políticas de acesso
  avaliadas uma vez por consulta; `v_perfil_cliente` sem varrer a loja
  inteira; índices de fila e lead; a caixa de entrada não recarrega a lista
  a cada mensagem; jobs e eventos antigos são apagados de hora em hora.

### Corrigido na varredura de 29/10/2026

- **A mídia da FluxoAPI nunca apareceria.** O arquivo deles só sai por GET
  assinado, e a bolha do chat põe a URL direto num `<img src>`: o navegador
  levaria 401 e o atendente veria ícone quebrado — pior que nada, porque
  parece defeito do sistema. Agora sai por `/api/midia/[id]`, que busca
  assinado do lado do servidor, confere a sessão e a permissão de chat, e
  repassa os bytes como stream (documento vai a 100 MB; carregar em memória
  derruba a função).
- **"Já paguei" não perguntava ao provedor.** `consultar_pagamento` só lia o
  nosso banco. Com o webhook perdido — provedor fora do ar, deploy no meio,
  rede — o cliente que PAGOU ouvia "ainda não caiu" e o pedido ficava parado
  esperando alguém desconfiar. `conferirPagamentoDoPedido` existia escrita e
  órfã; agora é chamada, e com o cliente de SISTEMA, porque o bot roda sem
  sessão e o de sessão devolvia "pedido não encontrado".
- **Webhook da FluxoAPI sem segredo aceitava qualquer corpo.** Em produção
  agora recusa, como o da Meta já fazia.
- **Conversas do cliente sem teto** na ficha: um contato antigo trazia a
  lista inteira para a tela.

### Conferido e sem problema

- `src/proxy.ts` **não** é arquivo esquecido: no Next 16 o `middleware` foi
  renomeado para `proxy`, e é ele que exige sessão. Conferido em produção —
  `/chats` e `/pedidos` redirecionam para o login, `/api/mensagens` dá 401.
- Índices cobrem os caminhos quentes: fila, mensagem por conversa, conversa
  por última mensagem, telefone do cliente, pedido por loja e data.
- A faxina horária apaga job concluído com mais de 30 dias e evento de
  webhook processado com mais de 90, sem tocar em mensagem, pedido ou
  dinheiro.
- 189 arquivos, zero órfãos depois desta varredura. Dependências: 11 pacotes,
  2,8 MB estáticos, e o grosso é o `recharts`, usado por 4 telas.

### Ainda em aberto

- **Saldo de conta bancária ignora venda e nota.** Nenhum lançamento
  automático preenche `bank_account_id`.
- **Categoria escolhida pelo banco é arbitrária** — o estorno cai na primeira
  despesa em ordem alfabética.
- **Escritas sem conferência de linhas.** As de dinheiro e pedido foram
  corrigidas; restam as de cadastro (produto, cliente, tarefa), que só mordem
  com perfil sem permissão.
- **Mídia do WhatsApp fica no servidor da Z-API**: se o link expirar, a imagem
  ou o áudio somem da conversa. Falta copiar para um bucket privado.
- **Excluir usuário apaga o perfil** e zera o autor nos históricos; o certo é
  desativar.

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

### Canais e integrações

- **WhatsApp**: três caminhos implementados, nesta ordem de preferência em
  `canalAtivo()` — **FluxoAPI** (Cloud API oficial da Meta por baixo; o número
  continua funcionando no celular do dono), **Meta** direto, e **Z-API** (a
  única com risco de banimento). Sem credencial o canal simulado responde
  "enviada" para mensagem que não saiu. Ver "A janela de 24 horas" abaixo.
- **IA do bot (DeepSeek)**: ligada. Entra onde a palavra-chave não resolveu, e
  conduz a venda pelas mesmas funções validadas do sistema — ver "O que a IA
  faz, e o que o sistema garante" abaixo. O treinamento fica em Configurações ›
  Inteligência do bot.
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

### Limites da IA que valem saber

- O conferidor pega preço inventado, mas **não** pega sabor inventado sem
  preço: não há como separar com segurança um nome de sabor de qualquer outro
  par de palavras numa frase. Contra isso vale a regra do prompt e o fato de
  o caminho determinístico sempre tirar o sabor de consulta.
- O modelo lê os 20 últimos turnos, não a conversa inteira. Compra de outro dia
  não entra — e é de propósito, senão viraria outro assunto dentro deste.
- `confirmar_pedido` pela IA é caminho raro: um "sim" quase sempre é
  classificado como `confirmar` e tratado pela máquina de estados. A trava
  existe para quando não for.
- Áudio e imagem do cliente chegam como `[áudio de voz 12s]`; a IA não ouve
  nem vê. O `deepseek-flash` aceita imagem, mas nada está ligado nisso.

### A janela de 24 horas

A FluxoAPI e a Meta são a Cloud API oficial, e com ela vem uma regra que a
Z-API não tinha: **passadas 24 horas desde a última mensagem do cliente, só
sai modelo aprovado.** A API devolve 422 `window_closed`, e tentar de novo não
resolve — por isso esse código entra como `tentarDeNovo: false` em
`fluxoapi.ts`, senão a fila bateria na mesma porta para sempre.

Isso muda o que já existe no sistema: o follow-up de 5 minutos cabe na janela,
mas cobrança e marketing dias depois **não**. `window_expires_at` vem em cada
conversa da FluxoAPI; a tela de chat ainda não usa esse dado, e enquanto não
usar a mensagem fora da janela falha com motivo escrito no log em vez de sair.

### O dono respondendo pelo celular

A diferença que importa entre FluxoAPI e Z-API não é preço: é que o número
segue funcionando no aplicativo do dono. Quando ele digita por lá chega o
evento `message.sent_from_phone`, e `registrarRespostaDoDono` faz duas coisas,
nesta ordem de importância: **desliga o bot naquela conversa** e grava a fala
como `atendente`. Sem a primeira, o bot responderia por cima de uma pessoa que
já está atendendo e o cliente leria duas respostas diferentes para a mesma
pergunta.

Na rota do webhook essas respostas são processadas **antes** das mensagens do
cliente, porque o mesmo lote pode trazer as duas — na outra ordem o bot ainda
estaria ligado quando a mensagem nova fosse processada.

### O diagnóstico que quase mentiu

A instância da loja respondeu `connected`, com número, nome verificado e
limite de 250 conversas por dia — e `webhook_url: null`.

Isso é o canal pela metade: o número conecta, **o envio funciona**, e nenhuma
mensagem de cliente chega. Por isso `diagnostico-fluxoapi.ts` trata webhook
ausente como **vermelho**, antes de qualquer outro aviso, e com prioridade
sobre todos. Verde ali faria alguém conferir a tela, ler "no ar", e descobrir
pelo cliente reclamando que ninguém respondeu.

A mesma chamada de verdade pegou um defeito meu: a resposta vem embrulhada em
`data`, a especificação não declara o corpo desse endpoint, e eu lia o nível
de cima. Voltava `ok: true` com número vazio — então a tela diria "no ar" sem
conseguir avisar que a instância caiu. O teste parte do JSON real que a loja
devolveu, não de um exemplo inventado.

O módulo também avisa o que vence ou degrada sozinho: `access_expires_at`
(existe um webhook `instance.access_expiring` só por isso), a qualidade do
número na Meta, e a troca de `coexistence` para `api_only` — que tiraria o
WhatsApp do celular do dono, que é a razão de ter escolhido a FluxoAPI.

### Duas assinaturas, e não dá para trocá-las

`fluxoapi-assinatura.ts` existe separado e com teste próprio porque a FluxoAPI
assina **coisas diferentes** no pedido e no webhook:

- pedido: seis linhas — `v1`, timestamp, nonce, método, **caminho com a query
  string**, e o sha256 do corpo. Segredo `fxs_`, que nunca trafega.
- webhook: duas linhas — timestamp e o corpo cru. Segredo `whsec_`.

Três detalhes dão erro que só aparece em produção, e cada um tem teste:
assinar o caminho sem a query faz só as chamadas **paginadas** voltarem 401;
usar o JSON re-serializado no webhook muda espaço e ordem e a assinatura
deixa de bater; e na rotação do segredo vêm **duas** assinaturas separadas por
vírgula — não tratar isso derruba o canal justamente durante a troca que
existe para não ter downtime.

### O histórico que a Z-API não tinha

A importação de conversas antes trazia só quem havia conversado, e eu tive que
escrever no próprio botão que o conteúdo não vinha. A FluxoAPI tem
`GET /conversations/{id}/messages`, então vem.

Com um teto: cada histórico é uma chamada assinada à parte, e cem conversas
seriam cem chamadas com a ação do servidor estourando o tempo no meio da
gravação — o usuário veria erro com metade já importada. Traz o das 20 mais
recentes, que é quem o atendente abre hoje, e o resto se preenche conforme as
pessoas escrevem. O texto do botão muda conforme o provedor.

E `classificarAutor` separa o que `outbound` sozinho não diz: saída pela API é
o bot, saída com `sent_from_phone` é a pessoa. Creditar tudo ao bot faria o
relatório de atendimento dar ao robô o trabalho de quem atendeu.

---

## Decisões que valem saber

### O que a IA faz, e o que o sistema garante

O bot era 100% determinístico. A parte que vende continua sendo — palavra-chave
→ máquina de estados → ferramenta → frase pronta — e a IA entra em **quatro**
pontos de `motor.ts`, todos eles lugares onde aquele caminho já tinha desistido:

- `default:`, quando a intenção não foi reconhecida;
- `modelo`, `preco` e `estoque`, quando a busca não achou o produto citado.

Esses três respondiam listando as marcas ou pedindo o modelo de novo, o que
ignora a pergunta: a regra de palavra-chave manda qualquer "tem ..." para
`estoque`, então **"tem como pagar depois?" virava "me fala qual modelo que eu
confiro"**. Agora a IA lê a pergunta e responde.

**O que ela pode fazer** segue o §24 do escopo: "o modelo de IA nunca deverá
executar diretamente alterações críticas no banco. Deverá chamar funções
previamente programadas e validadas." Não é um bot sem mãos — são mãos que
passam por funções conferidas. `src/lib/ia/politica.ts` entrega todas, menos
`validar_maioridade`, que é trava legal e sai do `ehSim`/`idadeDeclarada` do
sistema, não de inferência.

O que protege o estoque é a própria função, no lugar certo:
`adicionar_carrinho` falha sem unidade disponível; `criar_pagamento` tira o
total do CARRINHO (o modelo escolhe a forma, nunca o valor) e recusa troco
menor que o total; `confirmar_pedido` exige carrinho, endereço e forma, e no
PIX exige o dinheiro aprovado; a reserva expira sozinha.

Sobrava **uma** condição que função nenhuma consegue conferir: se o cliente
disse sim ao resumo. A ETAPA 14 manda criar o pedido "somente após confirmação
do cliente", então `podeChamar("confirmar_pedido")` exige
`clienteConfirmou` — calculado pelo `ehSim` do sistema em `atender.ts`, nunca
pelo que o modelo achou que o cliente quis dizer. Rodando ao vivo ele foi além
sozinho: em "pode confirmar" com PIX pendente, consultou o pagamento e disse
que confirma quando cair.

E mandar só as ferramentas permitidas no pedido não bastaria — o modelo pode
chamar um nome que inventou — então `podeChamar` recusa do nosso lado também, e
devolve o motivo escrito, porque recusa muda vira insistência no mesmo erro.

Depois de tudo isso, `src/lib/ia/conferir.ts` lê a frase antes de ela sair.
Todo valor em reais tem que ter saído de uma consulta, da configuração da loja
ou da boca do cliente — e, nesse último caso, **menos quando o número está
virando preço**, senão concordar com "faz R$ 60?" passaria. Ele também não pode
dizer que separou, reservou, ou que o PIX caiu, sem a ferramenta ter rodado.
Recusou? o cliente recebe o caminho determinístico e o motivo vai para o log.

Três coisas foram descobertas testando contra a API de verdade, não supondo:

1. O modelo raciocina dentro de `max_tokens`. Com teto apertado ele gasta a cota
   pensando e devolve texto **vazio** — o bot ficaria mudo. Daí o teto folgado e
   a recusa explícita quando volta vazio com `finish_reason: "length"`.
2. Ele devolve **várias** chamadas de ferramenta de uma vez, e às vezes com um
   texto de enchimento junto ("vou verificar isso pra você"). Esse texto não
   pode virar mensagem: o cliente receberia duas, a primeira sem conteúdo.
3. Pedindo "adiciona 2 no meu carrinho", ele respondia "Fechou, 2 Watermelon
   Ice 👌" **sem nada ter sido reservado**. Pior falha possível: o cliente
   desliga achando que tem duas guardadas. Hoje o prompt lhe dá o movimento
   certo — confirmar modelo e sabor e devolver ao fluxo — e o conferidor barra
   a frase se ele insistir.

E três recusas FALSAS minhas, achadas do mesmo jeito — cada uma derrubava uma
resposta certa e jogava o cliente no "não entendi" no meio da venda:

4. "a entrega fica R$ 5,00" era barrado porque a taxa vem da configuração da
   loja, não de consulta. É fato do sistema: entrou como origem válida.
5. "troco pra 100" → "você paga com R$ 100" era barrado por ser do cliente, e
   no turno seguinte era barrado de novo porque eu só olhava a mensagem da vez.
   Hoje vale o que ele escreveu na conversa inteira.
6. "vocês fazem fiado?" → "temos PIX e dinheiro" era barrado porque "temos"
   bateu na regra de disponibilidade de PRODUTO. Hoje essa regra só vale quando
   a frase cita uma marca, modelo ou sabor DESTA loja — exato, não chute. E
   "vou separar" saiu da lista de "disse que fez": oferecer é o passo certo
   antes de agir.

**A memória** foi o maior salto. O modelo via só a mensagem da vez, e "e o
outro, quanto sai?" não quer dizer nada sozinho. `src/lib/ia/historico.ts` passa
os 20 últimos turnos como conversa de verdade, com o atendente humano contando
como a mesma voz da loja — separar faria o modelo contradizer o que uma pessoa
acabou de prometer.

`npm test` roda tudo offline com um modelo de mentira. Para exercitar o modelo
de verdade, `IA_AO_VIVO=1 npx vitest run src/lib/ia/aovivo --testTimeout=180000`
— treze casos com carrinho, endereço e pagamento simulados, entre eles a venda
inteira, menor de idade, pedido de desconto, "ignore suas instruções", PIX não
pago e tentativa de fechar pedido sem o sim. O executor de mentira repete as
travas do real de propósito: sem isso ele deixou "confirmar" passar com carrinho
vazio e o teste viu um pedido criado do nada.

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
