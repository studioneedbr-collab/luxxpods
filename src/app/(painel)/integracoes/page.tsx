import { AtSign, MessageCircle, Printer, QrCode, Database, Webhook } from "lucide-react";
import { Badge, Panel, PanelHeader } from "@/components/ui";
import { usandoDemo } from "@/lib/data";

export const dynamic = "force-dynamic";

const INTEGRACOES = [
  {
    nome: "WhatsApp Business (Meta)", icone: MessageCircle, cor: "#25D366",
    status: "pendente" as const,
    descricao: "Recebe e envia texto, imagem, catálogo e PIX. Guarda ID, status, entrega e leitura de cada mensagem.",
    campos: ["Phone Number ID", "WABA ID", "Access Token", "Verify Token do webhook"],
    endpoint: "POST /api/webhooks/whatsapp",
  },
  {
    nome: "Instagram Direct (Meta)", icone: AtSign, cor: "#E1306C",
    status: "pendente" as const,
    descricao: "Centraliza o Direct na mesma caixa de entrada. Um cliente pode ter contato nos dois canais.",
    campos: ["Instagram Business Account ID", "Page Access Token"],
    endpoint: "POST /api/webhooks/instagram",
  },
  {
    nome: "Asaas", icone: QrCode, cor: "#00b46e",
    status: "pendente" as const,
    descricao:
      "PIX com copia e cola no próprio chat e confirmação automática por " +
      "webhook — as duas coisas. Usa QR Code com valor, sem exigir o CPF do " +
      "cliente. Preenchido, ganha da InfinitePay.",
    campos: [
      "ASAAS_API_KEY",
      "ASAAS_WEBHOOK_TOKEN (cadastrado no painel do Asaas)",
      "ASAAS_AMBIENTE = producao",
    ],
    endpoint: "POST /api/webhooks/pagamento",
  },
  {
    nome: "InfinitePay", icone: QrCode, cor: "#9563ff",
    status: "pendente" as const,
    descricao:
      "Checkout com PIX e cartão, e confirmação automática por webhook. " +
      "O cliente abre um link — a InfinitePay não devolve o copia e cola. " +
      "Sem gateway o sistema gera um PIX válido, mas a baixa é manual.",
    campos: ["INFINITEPAY_HANDLE (seu InfiniteTag sem o $)", "NEXT_PUBLIC_SITE_URL"],
    endpoint: "POST /api/webhooks/pagamento",
  },
  {
    nome: "Impressora térmica", icone: Printer, cor: "#38bdf8",
    status: "pendente" as const,
    descricao: "Impressão da comanda 80mm ao confirmar o pedido. Registra falha e permite reimpressão.",
    campos: ["Nome da impressora", "Endereço do agente local"],
    endpoint: "fila jobs → imprimir_pedido",
  },
];

export default async function IntegracoesPage() {
  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader titulo="Banco de dados" icone={Database}
          descricao="Fonte única de verdade de todo o sistema"
          acao={<Badge tom={usandoDemo ? "warn" : "ok"} ponto>
            {usandoDemo ? "base de demonstração" : "Supabase conectado"}
          </Badge>} />
        <div className="px-5 py-4 text-[11px] leading-relaxed text-ink-400">
          {usandoDemo ? (
            <>
              O painel está rodando com a base de demonstração. Para conectar ao Supabase, preencha{" "}
              <code className="rounded bg-ink-800 px-1 py-0.5 text-[11px] text-brand-300">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
              <code className="rounded bg-ink-800 px-1 py-0.5 text-[11px] text-brand-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              no arquivo <code className="rounded bg-ink-800 px-1 py-0.5 text-[11px]">.env.local</code> e rode as migrations de{" "}
              <code className="rounded bg-ink-800 px-1 py-0.5 text-[11px]">supabase/migrations</code>.
            </>
          ) : (
            "Conectado. Estoque, catálogo, pedidos e financeiro vêm todos do mesmo banco."
          )}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        {INTEGRACOES.map((i) => (
          <Panel key={i.nome}>
            <div className="flex items-start gap-3 border-b border-[var(--linha)] px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-850"
                style={{ color: i.cor }}>
                <i.icone className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-ink-100">{i.nome}</h3>
                  <Badge tom="warn">aguardando credenciais</Badge>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{i.descricao}</p>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                  Credenciais necessárias
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {i.campos.map((c) => <Badge key={c} tom="neutro">{c}</Badge>)}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-2">
                <Webhook className="size-3 shrink-0 text-ink-500" />
                <code className="truncate text-[11px] text-ink-300">{i.endpoint}</code>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
