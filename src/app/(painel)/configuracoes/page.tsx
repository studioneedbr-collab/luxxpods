import {
  Bot, Building2, Clock, CreditCard, Boxes, Printer, Truck, Image as ImageIcon,
} from "lucide-react";
import { Badge, Panel, PanelHeader } from "@/components/ui";

/**
 * Tudo que o bot e a operação consultam fica no banco (tabela settings),
 * nunca fixo no código. Esta tela mostra os valores em vigor.
 */
const GRUPOS = [
  {
    titulo: "Empresa", icone: Building2, chave: "empresa",
    campos: [
      ["Nome", "Luxx Pods"],
      ["Telefone", "(33) 99999-0000"],
      ["Endereço", "Teófilo Otoni - MG"],
      ["Logo", "não enviada"],
    ],
  },
  {
    titulo: "Atendimento", icone: Clock, chave: "atendimento",
    campos: [
      ["Horário", "10:00 às 23:59"],
      ["Mensagem inicial", "Fala! Aqui é da Luxx Pods 🖤 Como posso te ajudar?"],
      ["Fora do horário", "Estamos fechados agora. Retornamos às 10h!"],
      ["Follow-up do catálogo", "5 minutos"],
    ],
  },
  {
    titulo: "Chatbot", icone: Bot, chave: "chatbot",
    campos: [
      ["Bot ativo", "sim"],
      ["Validar maioridade", "sim"],
      ["Nome do bot", "Luxx"],
      ["Tom de voz", "comercial e direto"],
      ["Transferir para humano quando não souber", "sim"],
    ],
  },
  {
    titulo: "Catálogo", icone: ImageIcon, chave: "catalogo",
    campos: [
      ["Arquivo PNG do catálogo", "não configurado"],
      ["Envio automático", "sim"],
      ["Mostrar itens esgotados", "não"],
    ],
  },
  {
    titulo: "Entrega", icone: Truck, chave: "entrega",
    campos: [
      ["Taxa padrão", "R$ 5,00"],
      ["Entrega grátis acima de", "R$ 150,00"],
      ["Prazo estimado", "45 minutos"],
      ["Bairros atendidos", "todos"],
    ],
  },
  {
    titulo: "Pagamentos", icone: CreditCard, chave: "pagamentos",
    campos: [
      ["PIX", "ativo"],
      ["Dinheiro", "ativo"],
      ["Cartão", "inativo"],
      ["Gateway PIX", "não configurado"],
    ],
  },
  {
    titulo: "Estoque", icone: Boxes, chave: "estoque",
    campos: [
      ["Tempo de reserva do carrinho", "15 minutos"],
      ["Estoque mínimo padrão", "3 unidades"],
      ["Bloquear venda sem estoque", "sim"],
    ],
  },
  {
    titulo: "Impressão", icone: Printer, chave: "impressao",
    campos: [
      ["Impressora padrão", "não configurada"],
      ["Vias por pedido", "1"],
      ["Impressão automática ao confirmar", "sim"],
    ],
  },
];

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-400">
          Nenhum destes valores está fixo no código. Todos ficam na tabela{" "}
          <code className="rounded bg-white/6 px-1 py-0.5 text-[11px] text-brand-300">settings</code>,
          por loja, e o chatbot lê direto de lá a cada atendimento.
        </p>
        <Badge tom="warn">Edição inline no MVP 2</Badge>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        {GRUPOS.map((g) => (
          <Panel key={g.chave}>
            <PanelHeader titulo={g.titulo} icone={g.icone}
              descricao={`settings.${g.chave}`} />
            <dl className="divide-y divide-white/4">
              {g.campos.map(([rotulo, valor]) => (
                <div key={rotulo} className="flex items-start justify-between gap-4 px-5 py-2.5">
                  <dt className="shrink-0 text-xs text-ink-500">{rotulo}</dt>
                  <dd className="min-w-0 text-right text-xs font-medium text-ink-200">{valor}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        ))}
      </div>
    </div>
  );
}
