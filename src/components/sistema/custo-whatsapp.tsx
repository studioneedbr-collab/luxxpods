import { CircleDollarSign, Clock, MessageSquare } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui";

/**
 * O que o WhatsApp custa e quanto já foi usado hoje.
 *
 * Existe porque esses três números moram em lugares diferentes — a fatura na
 * FluxoAPI, o teto na Meta, e o uso só aparece quando alguém pergunta à API —
 * e quem opera a loja precisa dos três no mesmo lugar para saber se pode
 * mandar a próxima campanha.
 *
 * O que NÃO está aqui, de propósito: o preço que a Meta cobra por conversa.
 * Ele varia por país e por categoria, muda com o tempo, e nenhuma API do
 * caminho devolve o valor. Estimar daria um número errado em silêncio, que é
 * pior que não mostrar.
 */

export interface DadosDeCusto {
  /** mensalidade da plataforma, por número */
  porMes?: number;
  conversas24h?: number;
  mensagens24h?: number;
  limite24h?: number;
  erro?: string;
}

const reais = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",")}`;

export function CustoWhatsapp({ dados }: { dados: DadosDeCusto }) {
  const usadas = dados.conversas24h ?? 0;
  const teto = dados.limite24h ?? 0;
  const proporcao = teto > 0 ? Math.min(100, Math.round((usadas / teto) * 100)) : 0;
  const apertado = teto > 0 && proporcao >= 80;

  return (
    <Panel>
      <PanelHeader
        titulo="WhatsApp: custo e uso"
        icone={CircleDollarSign}
        descricao="O que sai da conta, e quanto do dia já foi gasto"
      />

      <div className="grid gap-px bg-[var(--linha)] sm:grid-cols-3">
        <Numero
          rotulo="Plataforma"
          valor={dados.porMes != null ? `${reais(dados.porMes)}/mês` : "—"}
          nota="FluxoAPI, por número"
        />
        <Numero
          rotulo="Conversas hoje"
          valor={teto > 0 ? `${usadas} de ${teto}` : String(usadas)}
          nota={teto > 0 ? `${proporcao}% do teto da Meta` : "teto ainda não informado"}
          tom={apertado ? "alerta" : undefined}
        />
        <Numero
          rotulo="Mensagens hoje"
          valor={String(dados.mensagens24h ?? 0)}
          nota="enviadas e recebidas"
        />
      </div>

      <div className="space-y-2.5 px-5 py-4 text-[11px] leading-relaxed text-ink-400">
        <p className="flex items-start gap-2">
          <Clock className="mt-px size-3.5 shrink-0 text-ink-500" />
          <span>
            <strong className="text-ink-300">A janela de 24 horas.</strong>{" "}
            Depois de 24h sem o cliente escrever, só sai{" "}
            <strong className="text-ink-300">modelo aprovado</strong> pela Meta.
            Mensagem livre é recusada, e tentar de novo não resolve. O
            follow-up de 5 minutos do bot cabe na janela; cobrança e marketing
            dias depois, não.
          </span>
        </p>

        <p className="flex items-start gap-2">
          <MessageSquare className="mt-px size-3.5 shrink-0 text-ink-500" />
          <span>
            <strong className="text-ink-300">A Meta cobra por conversa</strong>,
            não por mensagem, e o preço muda conforme a categoria — atendimento,
            utilidade, marketing ou autenticação — e conforme o país. Esse valor
            não vem por nenhuma API daqui, então não é estimado nesta tela:
            confira na fatura da sua conta da Meta. O que dá para acompanhar
            aqui é o volume, acima.
          </span>
        </p>

        {dados.erro && (
          <p className="text-[11px] text-ink-500">
            Não consegui ler a tabela de preços agora ({dados.erro}).
          </p>
        )}
      </div>
    </Panel>
  );
}

function Numero({ rotulo, valor, nota, tom }: {
  rotulo: string;
  valor: string;
  nota: string;
  tom?: "alerta";
}) {
  return (
    <div className="bg-[var(--chapa)] px-5 py-4">
      <p className="text-[11px] text-ink-500">{rotulo}</p>
      <p className={`display mt-1 text-[18px] font-semibold ${
        tom === "alerta" ? "text-gold-400" : "text-ink-100"}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-600">{nota}</p>
    </div>
  );
}
