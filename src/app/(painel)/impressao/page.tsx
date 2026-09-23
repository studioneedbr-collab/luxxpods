import Link from "next/link";
import { Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge, Button, Panel, PanelHeader, Table, Td, Th, Tr, Vazio } from "@/components/ui";
import { dataHora } from "@/lib/utils";
import { getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ImpressaoPage() {
  const pedidos = await getPedidos(60);
  const paraImprimir = pedidos.filter((p) =>
    ["confirmado", "em_separacao", "saiu_para_entrega"].includes(p.status_pedido));

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader titulo="Impressora" icone={Printer}
          descricao="Comanda 80mm gerada a partir do pedido confirmado"
          acao={<Badge tom="warn" ponto>nenhuma impressora configurada</Badge>} />
        <div className="grid gap-px bg-ink-850 sm:grid-cols-3">
          {[
            ["Impressora padrão", "não configurada"],
            ["Vias por pedido", "1"],
            ["Impressão automática", "ativada"],
          ].map(([r, v]) => (
            <div key={r} className="bg-ink-900 px-5 py-4">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">{r}</p>
              <p className="mt-0.5 text-sm font-medium text-ink-200">{v}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2.5 border-t border-[var(--linha)] px-5 py-3.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn-400" />
          <p className="text-[11px] leading-relaxed text-ink-400">
            Enquanto a impressora não está ligada ao sistema, a comanda pode ser impressa
            direto do navegador: abra o pedido e use <strong className="text-ink-200">Imprimir comanda</strong>.
            O layout já sai no formato 80mm, com destaque para <strong className="text-warn-400">RECEBER NA ENTREGA</strong> quando
            o pagamento é em dinheiro.
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader titulo="Fila de impressão" icone={Printer}
          descricao="Pedidos confirmados aguardando ou já impressos" />
        {paraImprimir.length === 0 ? (
          <Vazio icone={CheckCircle2} titulo="Fila vazia" descricao="Nenhum pedido pendente de impressão." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th><Th>Cliente</Th><Th>Confirmado</Th>
                <Th className="text-center">Situação</Th>
                <Th className="text-right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {paraImprimir.map((p) => (
                <Tr key={p.id}>
                  <Td className="tabular-nums font-medium text-brand-300">{p.numero_pedido}</Td>
                  <Td className="text-ink-200">{p.cliente_nome}</Td>
                  <Td className="text-[11px] tabular-nums text-ink-400">
                    {dataHora(p.confirmado_em ?? p.created_at)}
                  </Td>
                  <Td className="text-center">
                    <Badge tom={p.impresso ? "ok" : "warn"}>
                      {p.impresso ? "impresso" : "aguardando"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Link href={`/pedidos/${p.id}`}>
                      <Button tamanho="sm" variante="suave">
                        <Printer className="size-3.5" /> abrir
                      </Button>
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
