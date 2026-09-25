"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle, Bot, Boxes, Building2, Check, Clock, CreditCard,
  Image as ImageIcon, Printer, Send, Truck,
} from "lucide-react";
import { salvarConfiguracao } from "@/lib/actions-config";
import type { ChaveConfig, Configuracoes } from "@/lib/configuracoes";
import { Badge, Button, CampoMascara, CampoMoeda, Input } from "@/components/ui";
import { Campo, Switch, Textarea } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * As configurações que o banco e o bot leem de verdade.
 *
 * Cada grupo salva sozinho: mudar a taxa de entrega não deveria exigir
 * revisar o horário de atendimento.
 */
export function TelaConfiguracoes({ configuracoes }: { configuracoes: Configuracoes }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <p className="text-[12px] leading-relaxed text-ink-400">
        Estes valores ficam no banco, não no código. O carrinho lê a taxa de entrega
        daqui, a reserva de estoque lê o tempo, e o bot lê as mensagens — mudar aqui
        vale na próxima venda, sem publicar versão nova.
      </p>

      <Grupo
        chave="empresa"
        titulo="Empresa"
        descricao="Aparece na comanda impressa e nas mensagens ao cliente"
        icone={Building2}
        inicial={configuracoes.empresa}
      >
        {(v, set) => (
          <>
            <Campo rotulo="Nome da loja">
              <Input value={v.nome} onChange={(e) => set("nome", e.target.value)} />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Telefone">
                <CampoMascara tipo="telefone" valor={v.telefone}
                  aoMudar={(x) => set("telefone", x)} />
              </Campo>
              <Campo rotulo="Cidade e estado" dica="usado no código PIX">
                <Input value={v.endereco} onChange={(e) => set("endereco", e.target.value)}
                  placeholder="Teófilo Otoni - MG" />
              </Campo>
            </div>
          </>
        )}
      </Grupo>

      <Grupo
        chave="atendimento"
        titulo="Atendimento"
        descricao="Quando o bot responde e o que ele diz primeiro"
        icone={Clock}
        inicial={configuracoes.atendimento}
      >
        {(v, set) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Abre às">
                <Input value={v.horario_inicio} placeholder="10:00"
                  onChange={(e) => set("horario_inicio", e.target.value)} />
              </Campo>
              <Campo rotulo="Fecha às">
                <Input value={v.horario_fim} placeholder="23:59"
                  onChange={(e) => set("horario_fim", e.target.value)} />
              </Campo>
            </div>

            <Campo rotulo="Primeira mensagem" dica="o que o cliente lê ao chamar">
              <Textarea rows={2} value={v.mensagem_inicial}
                onChange={(e) => set("mensagem_inicial", e.target.value)} />
            </Campo>

            <Campo rotulo="Fora do horário">
              <Textarea rows={2} value={v.mensagem_fora_horario}
                onChange={(e) => set("mensagem_fora_horario", e.target.value)} />
            </Campo>

            <Switch
              ligado={v.followup_ativo}
              onChange={(x) => set("followup_ativo", x)}
              rotulo="Retomar quem sumiu depois do catálogo"
              descricao="Só envia se o cliente não tiver respondido nesse meio tempo"
            />

            {v.followup_ativo && (
              <Campo rotulo="Esperar quantos minutos" dica="o escopo pede 5">
                <Input type="number" min={1} max={1440} value={v.followup_minutos}
                  onChange={(e) => set("followup_minutos", Number(e.target.value))} />
              </Campo>
            )}
          </>
        )}
      </Grupo>

      <Grupo
        chave="entrega"
        titulo="Entrega"
        descricao="O carrinho soma a taxa a partir daqui"
        icone={Truck}
        inicial={configuracoes.entrega}
      >
        {(v, set) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Taxa de entrega">
              <CampoMoeda valor={v.taxa_padrao} aoMudar={(x) => set("taxa_padrao", x)} />
            </Campo>
            <Campo rotulo="Grátis acima de" dica="0 desliga">
              <CampoMoeda valor={v.taxa_gratis_acima}
                aoMudar={(x) => set("taxa_gratis_acima", x)} />
            </Campo>
            <Campo rotulo="Prazo (minutos)">
              <Input type="number" min={1} value={v.prazo_minutos}
                onChange={(e) => set("prazo_minutos", Number(e.target.value))} />
            </Campo>
          </div>
        )}
      </Grupo>

      <Grupo
        chave="pagamentos"
        titulo="Pagamentos"
        descricao="A chave PIX é o que gera o código de cobrança"
        icone={CreditCard}
        inicial={configuracoes.pagamentos}
      >
        {(v, set) => (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Switch ligado={v.pix_ativo} onChange={(x) => set("pix_ativo", x)} rotulo="PIX" />
              <Switch ligado={v.dinheiro_ativo} onChange={(x) => set("dinheiro_ativo", x)} rotulo="Dinheiro" />
              <Switch ligado={v.cartao_ativo} onChange={(x) => set("cartao_ativo", x)} rotulo="Cartão" />
            </div>

            {v.pix_ativo && (
              <Campo rotulo="Chave PIX" dica="CPF, CNPJ, e-mail, telefone ou chave aleatória">
                <Input value={v.chave_pix ?? ""} onChange={(e) => set("chave_pix", e.target.value)}
                  placeholder="contato@luxxpods.com.br" />
              </Campo>
            )}

            <div className="flex items-start gap-2 rounded-md bg-ink-950 px-3 py-2.5">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-ink-500" />
              <p className="text-[11px] leading-relaxed text-ink-400">
                Sem gateway configurado, o código PIX é gerado e funciona, mas a
                baixa é manual: alguém confere o comprovante e marca o pedido como pago.
              </p>
            </div>
          </>
        )}
      </Grupo>

      <Grupo
        chave="estoque"
        titulo="Estoque"
        descricao="Quanto tempo a peça fica reservada enquanto o cliente decide"
        icone={Boxes}
        inicial={configuracoes.estoque}
      >
        {(v, set) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Reserva do carrinho (minutos)" dica="entre 5 e 240">
                <Input type="number" min={5} max={240} value={v.reserva_minutos}
                  onChange={(e) => set("reserva_minutos", Number(e.target.value))} />
              </Campo>
              <Campo rotulo="Estoque mínimo padrão">
                <Input type="number" min={0} value={v.estoque_minimo_padrao}
                  onChange={(e) => set("estoque_minimo_padrao", Number(e.target.value))} />
              </Campo>
            </div>
            <Switch
              ligado={v.bloquear_venda_sem_estoque}
              onChange={(x) => set("bloquear_venda_sem_estoque", x)}
              rotulo="Bloquear venda sem estoque"
              descricao="Desligar isso permite vender o que não existe na prateleira"
            />
          </>
        )}
      </Grupo>

      <Grupo
        chave="chatbot"
        titulo="Chatbot"
        descricao="Como o robô se comporta na conversa"
        icone={Bot}
        inicial={configuracoes.chatbot}
      >
        {(v, set) => (
          <>
            <Campo rotulo="Nome do bot">
              <Input value={v.nome_bot} onChange={(e) => set("nome_bot", e.target.value)} />
            </Campo>
            <Switch ligado={v.ativo} onChange={(x) => set("ativo", x)}
              rotulo="Bot ativo" descricao="Desligado, toda conversa cai para atendimento humano" />
            <Switch ligado={v.validar_maioridade} onChange={(x) => set("validar_maioridade", x)}
              rotulo="Validar maioridade"
              descricao="Pergunta a idade antes de mostrar produto, uma vez por cliente" />
            <Switch ligado={v.fallback_humano} onChange={(x) => set("fallback_humano", x)}
              rotulo="Chamar gente quando travar"
              descricao="Depois de três tentativas sem entender, passa para um atendente" />
          </>
        )}
      </Grupo>

      <Grupo
        chave="whatsapp_envios"
        titulo="Envios pelo WhatsApp"
        descricao="O que pode sair pelo canal — protege o número de banimento"
        icone={Send}
        inicial={configuracoes.whatsapp_envios}
      >
        {(v, set) => (
          <>
            <Switch ligado={v.transacional} onChange={(x) => set("transacional", x)}
              rotulo="Transacional"
              descricao="Resposta do bot, status do pedido — o que a pessoa está esperando" />
            <Switch ligado={v.interno} onChange={(x) => set("interno", x)}
              rotulo="Interno" descricao="Avisos para a própria equipe" />
            <Switch ligado={v.cobranca} onChange={(x) => set("cobranca", x)}
              rotulo="Cobrança" descricao="No máximo 3 por pessoa a cada 60 dias" />
            <Switch ligado={v.marketing} onChange={(x) => set("marketing", x)}
              rotulo="Marketing" descricao="No máximo 1 por pessoa a cada 14 dias" />
          </>
        )}
      </Grupo>

      <Grupo
        chave="catalogo"
        titulo="Catálogo"
        descricao="A imagem que o bot envia quando o cliente pede"
        icone={ImageIcon}
        inicial={configuracoes.catalogo}
      >
        {(v, set) => (
          <>
            <Campo rotulo="Endereço da imagem" dica="link público do PNG do catálogo">
              <Input value={v.arquivo_png ?? ""} onChange={(e) => set("arquivo_png", e.target.value)}
                placeholder="https://…/catalogo.png" />
            </Campo>
            <Switch ligado={v.enviar_automatico} onChange={(x) => set("enviar_automatico", x)}
              rotulo="Enviar quando o cliente pedir" />
            <Switch ligado={v.mostrar_esgotados} onChange={(x) => set("mostrar_esgotados", x)}
              rotulo="Mostrar itens esgotados"
              descricao="Ligado, o bot mostra o que acabou marcado como indisponível" />
          </>
        )}
      </Grupo>

      <Grupo
        chave="impressao"
        titulo="Impressão"
        descricao="Comanda 80 mm emitida ao confirmar o pedido"
        icone={Printer}
        inicial={configuracoes.impressao}
      >
        {(v, set) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Impressora" dica="nome do agente local">
                <Input value={v.impressora_padrao ?? ""}
                  onChange={(e) => set("impressora_padrao", e.target.value)} />
              </Campo>
              <Campo rotulo="Vias por pedido">
                <Input type="number" min={1} max={5} value={v.vias}
                  onChange={(e) => set("vias", Number(e.target.value))} />
              </Campo>
            </div>
            <Switch ligado={v.automatica} onChange={(x) => set("automatica", x)}
              rotulo="Imprimir ao confirmar" />
          </>
        )}
      </Grupo>
    </div>
  );
}

/* --------------------------------------------------------------- GRUPO --- */

function Grupo<K extends ChaveConfig>({
  chave, titulo, descricao, icone: Icone, inicial, children,
}: {
  chave: K;
  titulo: string;
  descricao: string;
  icone: React.ComponentType<{ className?: string }>;
  inicial: Configuracoes[K];
  children: (
    valores: Configuracoes[K],
    set: <C extends keyof Configuracoes[K]>(campo: C, valor: Configuracoes[K][C]) => void,
  ) => React.ReactNode;
}) {
  const [valores, setValores] = useState<Configuracoes[K]>(inicial);
  const [salvo, setSalvo] = useState<Configuracoes[K]>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const toast = useToast();

  const mudou = JSON.stringify(valores) !== JSON.stringify(salvo);

  const set = <C extends keyof Configuracoes[K]>(campo: C, valor: Configuracoes[K][C]) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErro(null);
  };

  function salvar() {
    iniciar(async () => {
      const r = await salvarConfiguracao(
        chave, valores as unknown as Record<string, unknown>);
      if (r.ok) {
        setSalvo(valores);
        setErro(null);
        toast.ok(`${titulo} salvo`, "Já vale na próxima venda");
      } else {
        setErro(r.erro ?? "Não consegui salvar");
      }
    });
  }

  return (
    <section className="chapa overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-[var(--linha)] px-4 py-3">
        <Icone className="mt-0.5 size-4 shrink-0 text-ink-500" />
        <div className="min-w-0 flex-1">
          <h2 className="display text-[13px] font-semibold text-ink-100">{titulo}</h2>
          <p className="text-[11px] text-ink-500">{descricao}</p>
        </div>
        {mudou && <Badge tom="warn">não salvo</Badge>}
      </div>

      <div className="space-y-3 px-4 py-4">
        {children(valores, set)}

        {erro && (
          <p className="flex items-start gap-2 rounded-md bg-bad-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-bad-400">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {erro}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--linha)] px-4 py-2.5">
        <code className="font-mono text-[10px] text-ink-600">settings.{chave}</code>
        <div className="flex gap-2">
          {mudou && (
            <Button tamanho="sm" variante="fantasma"
              onClick={() => { setValores(salvo); setErro(null); }}>
              Desfazer
            </Button>
          )}
          <Button
            tamanho="sm"
            variante={mudou ? "primario" : "suave"}
            disabled={!mudou || salvando}
            onClick={salvar}
          >
            <Check className={cn("size-3.5", salvando && "animate-pulse")} />
            {salvando ? "Salvando…" : mudou ? "Salvar" : "Salvo"}
          </Button>
        </div>
      </div>
    </section>
  );
}
