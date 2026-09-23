import {
  Bot, Building2, Clock, CreditCard, Boxes, Printer, Truck, Image as ImageIcon,
  Circle, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

type Estado = "pronto" | "pendente";

interface Campo {
  rotulo: string;
  valor: string;
  estado?: Estado;
}

interface Grupo {
  titulo: string;
  chave: string;
  resumo: string;
  icone: React.ComponentType<{ className?: string }>;
  campos: Campo[];
}

/**
 * Tudo que o bot e a operação consultam vive na tabela `settings`.
 * Esta tela mostra o que está valendo agora e o que ainda falta preencher.
 */
const GRUPOS: Grupo[] = [
  {
    titulo: "Empresa", chave: "empresa", icone: Building2,
    resumo: "Aparece na comanda e nas mensagens ao cliente",
    campos: [
      { rotulo: "Nome", valor: "Luxx Pods", estado: "pronto" },
      { rotulo: "Telefone", valor: "(33) 99999-0000", estado: "pronto" },
      { rotulo: "Endereço", valor: "Teófilo Otoni — MG", estado: "pronto" },
      { rotulo: "Logo", valor: "enviada", estado: "pronto" },
    ],
  },
  {
    titulo: "Atendimento", chave: "atendimento", icone: Clock,
    resumo: "Quando o bot responde e o que ele diz primeiro",
    campos: [
      { rotulo: "Horário", valor: "10:00 às 23:59", estado: "pronto" },
      { rotulo: "Primeira mensagem", valor: "Fala! Aqui é da Luxx Pods 🖤", estado: "pronto" },
      { rotulo: "Fora do horário", valor: "Estamos fechados. Voltamos às 10h!", estado: "pronto" },
      { rotulo: "Follow-up do catálogo", valor: "5 minutos", estado: "pronto" },
    ],
  },
  {
    titulo: "Chatbot", chave: "chatbot", icone: Bot,
    resumo: "Comportamento do robô na conversa",
    campos: [
      { rotulo: "Bot ativo", valor: "sim", estado: "pronto" },
      { rotulo: "Validar maioridade", valor: "sim", estado: "pronto" },
      { rotulo: "Nome do bot", valor: "Luxx", estado: "pronto" },
      { rotulo: "Passa para humano quando trava", valor: "sim", estado: "pronto" },
    ],
  },
  {
    titulo: "Catálogo", chave: "catalogo", icone: ImageIcon,
    resumo: "A imagem que o bot envia quando o cliente pede o catálogo",
    campos: [
      { rotulo: "Arquivo PNG", valor: "não enviado", estado: "pendente" },
      { rotulo: "Envio automático", valor: "sim", estado: "pronto" },
      { rotulo: "Mostrar esgotados", valor: "não", estado: "pronto" },
    ],
  },
  {
    titulo: "Entrega", chave: "entrega", icone: Truck,
    resumo: "Taxa e prazo informados no fechamento",
    campos: [
      { rotulo: "Taxa padrão", valor: "R$ 5,00", estado: "pronto" },
      { rotulo: "Grátis acima de", valor: "R$ 150,00", estado: "pronto" },
      { rotulo: "Prazo estimado", valor: "45 minutos", estado: "pronto" },
      { rotulo: "Bairros atendidos", valor: "todos", estado: "pronto" },
    ],
  },
  {
    titulo: "Pagamentos", chave: "pagamentos", icone: CreditCard,
    resumo: "Formas aceitas e a conta que recebe o PIX",
    campos: [
      { rotulo: "PIX", valor: "ativo", estado: "pronto" },
      { rotulo: "Dinheiro", valor: "ativo", estado: "pronto" },
      { rotulo: "Cartão", valor: "inativo", estado: "pronto" },
      { rotulo: "Gateway PIX", valor: "não configurado", estado: "pendente" },
    ],
  },
  {
    titulo: "Estoque", chave: "estoque", icone: Boxes,
    resumo: "Reserva do carrinho e ponto de reposição",
    campos: [
      { rotulo: "Reserva do carrinho", valor: "15 minutos", estado: "pronto" },
      { rotulo: "Estoque mínimo padrão", valor: "3 unidades", estado: "pronto" },
      { rotulo: "Bloquear venda sem estoque", valor: "sim", estado: "pronto" },
    ],
  },
  {
    titulo: "Impressão", chave: "impressao", icone: Printer,
    resumo: "Comanda emitida quando o pedido é confirmado",
    campos: [
      { rotulo: "Impressora padrão", valor: "não configurada", estado: "pendente" },
      { rotulo: "Vias por pedido", valor: "1", estado: "pronto" },
      { rotulo: "Imprimir automaticamente", valor: "sim", estado: "pronto" },
    ],
  },
];

export default function ConfiguracoesPage() {
  const pendentes = GRUPOS.flatMap((g) =>
    g.campos.filter((c) => c.estado === "pendente").map((c) => ({ grupo: g.titulo, ...c })));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* o que falta, antes do que já está feito */}
      {pendentes.length > 0 && (
        <div className="chapa realce overflow-hidden">
          <span className="realce-barra bg-warn-500" />
          <div className="px-5 py-4">
            <h2 className="display text-sm font-semibold text-ink-100">
              {pendentes.length} ajuste{pendentes.length > 1 ? "s" : ""} pendente{pendentes.length > 1 ? "s" : ""}
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              A operação funciona sem eles, mas estes pontos limitam o que o bot consegue fazer sozinho.
            </p>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {pendentes.map((p) => (
                <li key={`${p.grupo}-${p.rotulo}`} className="flex items-baseline gap-2 text-xs">
                  <Circle className="size-2 shrink-0 translate-y-0.5 text-warn-400" />
                  <span className="text-ink-300">{p.rotulo}</span>
                  <span className="text-ink-600">·</span>
                  <span className="text-ink-500">{p.grupo}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {GRUPOS.map((grupo) => (
          <section key={grupo.chave}>
            <div className="flex items-baseline gap-2.5 pb-2">
              <grupo.icone className="size-4 shrink-0 translate-y-0.5 text-ink-500" />
              <div className="min-w-0">
                <h2 className="display text-[13px] font-semibold text-ink-100">{grupo.titulo}</h2>
                <p className="text-[11px] text-ink-500">{grupo.resumo}</p>
              </div>
              <code className="ml-auto shrink-0 font-mono text-[10px] text-ink-600">
                settings.{grupo.chave}
              </code>
            </div>

            <dl className="chapa divide-y divide-[var(--linha)] overflow-hidden">
              {grupo.campos.map((campo) => (
                <div
                  key={campo.rotulo}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <dt className="shrink-0 text-xs text-ink-400">{campo.rotulo}</dt>
                  <dd className={cn(
                    "flex min-w-0 items-center gap-2 text-right text-xs",
                    campo.estado === "pendente" ? "text-warn-400" : "text-ink-200",
                  )}>
                    <span className="truncate">{campo.valor}</span>
                    {campo.estado === "pronto"
                      ? <CheckCircle2 className="size-3 shrink-0 text-ok-500/70" />
                      : <Circle className="size-3 shrink-0 text-warn-500/70" />}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-500">
        <Badge tom="brand">nada fixo no código</Badge>
        <span className="min-w-0">
          Taxa, prazos, mensagens, tempo de reserva e etapas do funil ficam no banco, por loja.
          Mudar aqui muda o atendimento na próxima mensagem — sem publicar versão nova.
          A edição pela tela entra junto com a conexão ao Supabase.
        </span>
      </p>
    </div>
  );
}
