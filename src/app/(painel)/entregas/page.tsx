import Link from "next/link";
import { Banknote, Bike, MapPin, Package, Printer, QrCode } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge, Panel, PanelHeader, Vazio } from "@/components/ui";
import { Realtime } from "@/components/realtime";
import { STATUS_PEDIDO } from "@/lib/labels";
import { brl, hora, num, telefone } from "@/lib/utils";
import { getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EntregasPage() {
  const pedidos = await getPedidos(200);

  const separando = pedidos.filter((p) => p.status_pedido === "em_separacao");
  const emRota = pedidos.filter((p) => p.status_pedido === "saiu_para_entrega");
  const confirmados = pedidos.filter((p) => p.status_pedido === "confirmado");

  const hojeStr = new Date().toDateString();
  const entreguesHoje = pedidos.filter(
    (p) => p.status_pedido === "entregue" && new Date(p.entregue_em ?? p.created_at).toDateString() === hojeStr,
  );

  const aReceber = [...emRota, ...separando, ...confirmados]
    .filter((p) => p.status_pagamento !== "aprovado")
    .reduce((a, p) => a + p.total, 0);

  const fila = [...confirmados, ...separando, ...emRota];

  return (
    <div className="space-y-4">
      <Realtime tabelas={["orders"]} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Aguardando separação" valor={num(confirmados.length)} icone={Package} tom="warn" />
        <StatCard rotulo="Em separação" valor={num(separando.length)} icone={Package} tom="info" />
        <StatCard rotulo="Em rota" valor={num(emRota.length)} icone={Bike} tom="brand" destaque />
        <StatCard rotulo="A receber na entrega" valor={brl(aReceber)} icone={Banknote}
          tom={aReceber > 0 ? "gold" : "ok"} sub={`${num(entreguesHoje.length)} entregues hoje`} />
      </div>

      <Panel>
        <PanelHeader titulo="Fila de entrega" icone={Bike}
          descricao="O entregador vê cliente, endereço, forma de pagamento e troco" />
        {fila.length === 0 ? (
          <Vazio icone={Bike} titulo="Nenhuma entrega na fila" descricao="Os pedidos confirmados aparecem aqui automaticamente." />
        ) : (
          <div className="grid gap-px bg-white/4 md:grid-cols-2 xl:grid-cols-3">
            {fila.map((p) => {
              const st = STATUS_PEDIDO[p.status_pedido];
              const receber = p.status_pagamento !== "aprovado";
              return (
                <Link key={p.id} href={`/pedidos/${p.id}`}
                  className="bg-ink-900/70 p-4 transition hover:bg-ink-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-100">{p.cliente_nome}</p>
                      <p className="text-[11px] tabular-nums text-ink-500">
                        {p.numero_pedido} · {hora(p.created_at)}
                      </p>
                    </div>
                    <Badge tom={st.tom}>{st.rotulo}</Badge>
                  </div>

                  <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-ink-300">
                    <MapPin className="mt-0.5 size-3 shrink-0 text-ink-500" />
                    <span className="min-w-0">
                      {p.endereco_snapshot
                        ? `${p.endereco_snapshot.rua}, ${p.endereco_snapshot.numero} — ${p.endereco_snapshot.bairro}`
                        : "Endereço não informado"}
                      {p.endereco_snapshot?.referencia && (
                        <span className="block text-ink-500">Ref: {p.endereco_snapshot.referencia}</span>
                      )}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] tabular-nums text-ink-500">
                    {telefone(p.cliente_telefone)}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/6 pt-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-400">
                      {p.forma_pagamento === "pix"
                        ? <QrCode className="size-3" />
                        : <Banknote className="size-3" />}
                      {p.forma_pagamento === "pix" ? "PIX" : "Dinheiro"}
                    </span>
                    {receber ? (
                      <span className="rounded-md bg-warn-500/14 px-2 py-0.5 text-[11px] font-bold tabular-nums text-warn-400">
                        receber {brl(p.total)}
                      </span>
                    ) : (
                      <span className="rounded-md bg-ok-500/14 px-2 py-0.5 text-[11px] font-bold text-ok-400">
                        pago
                      </span>
                    )}
                  </div>

                  {p.troco_para && (
                    <p className="mt-1.5 text-[11px] font-medium text-gold-400">
                      Troco para {brl(p.troco_para)} — levar {brl(p.valor_troco ?? 0)}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader titulo="Entregues hoje" icone={Printer}
          descricao={`${num(entreguesHoje.length)} pedidos · ${brl(entreguesHoje.reduce((a, p) => a + p.total, 0))}`} />
        {entreguesHoje.length === 0 ? (
          <Vazio icone={Package} titulo="Nenhuma entrega concluída hoje" />
        ) : (
          <ul className="divide-y divide-white/4">
            {entreguesHoje.map((p) => (
              <li key={p.id}>
                <Link href={`/pedidos/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-white/4">
                  <span className="text-[11px] tabular-nums text-ink-500">{hora(p.entregue_em)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-200">{p.cliente_nome}</span>
                  <span className="text-[11px] tabular-nums text-ink-500">{p.numero_pedido}</span>
                  <span className="text-xs font-semibold tabular-nums text-ok-400">{brl(p.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
