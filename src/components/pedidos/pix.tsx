"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle, Check, Copy, ExternalLink, Loader2, QrCode, RefreshCcw,
} from "lucide-react";
import { Button, Panel, PanelHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { brl, cn } from "@/lib/utils";

interface Cobranca {
  copiaECola: string;
  link?: string;
  qrCode: string;
  valor: number;
  chave: string;
  tipoChave: string;
  recebedor: string;
  confirmacaoAutomatica: boolean;
  identificador: string;
}

/**
 * Cobrança PIX na tela.
 *
 * O código sai do próprio sistema (BR Code do Banco Central), então funciona
 * sem gateway. Quando não há gateway, a tela avisa que a baixa é manual — é
 * melhor dizer isso do que deixar alguém achando que confirma sozinho.
 */
export function CobrancaPix({
  pedidoId, numeroPedido,
}: { pedidoId: string; numeroPedido: string }) {
  const router = useRouter();
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pedidoCarregado, setPedidoCarregado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let vivo = true;

    fetch(`/api/pix?pedido=${pedidoId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d.erro) setErro(d.erro);
        else setCobranca(d.cobranca);
      })
      .catch(() => { if (vivo) setErro("Não consegui gerar a cobrança."); })
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
        setPedidoCarregado(pedidoId);
      });

    return () => { vivo = false; };
  }, [pedidoId]);

  // outro pedido na tela: volta a carregar, sem efeito extra
  if (pedidoCarregado !== null && pedidoCarregado !== pedidoId && !carregando) {
    setCarregando(true);
    setCobranca(null);
    setErro(null);
  }

  async function copiar() {
    if (!cobranca) return;
    try {
      await navigator.clipboard.writeText(cobranca.link ?? cobranca.copiaECola);
      setCopiado(true);
      toast.ok("Código copiado", "Cole no aplicativo do banco ou mande para o cliente");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.erro("Não consegui copiar", "Selecione o código e copie à mão");
    }
  }

  /**
   * Pergunta ao provedor se o pagamento caiu, em vez de esperar o webhook.
   * O webhook pode não chegar, e sem isto um pedido pago fica parado.
   */
  async function conferir() {
    setConferindo(true);
    try {
      const r = await fetch(`/api/pix?pedido=${pedidoId}`, { method: "POST" })
        .then((res) => res.json());

      if (r.pago) {
        toast.ok("Pagamento confirmado", "O pedido já entrou em separação");
        router.refresh();
      } else {
        toast.aviso("Ainda não consta pago", r.motivo ?? "Tente de novo em instantes");
      }
    } catch {
      toast.erro("Não consegui consultar", "Tente de novo em instantes");
    } finally {
      setConferindo(false);
    }
  }

  if (carregando) {
    return (
      <Panel className="overflow-hidden">
        <PanelHeader titulo="Cobrança PIX" icone={QrCode} />
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-ink-500">
          <Loader2 className="size-4 animate-spin" /> Gerando o código…
        </div>
      </Panel>
    );
  }

  if (erro || !cobranca) {
    return (
      <Panel className="overflow-hidden">
        <PanelHeader titulo="Cobrança PIX" icone={QrCode} />
        <div className="flex items-start gap-2.5 px-4 py-4">
          <AlertTriangle className="mt-px size-4 shrink-0 text-warn-400" />
          <p className="text-[12px] leading-relaxed text-ink-400">{erro}</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        titulo="Cobrança PIX"
        icone={QrCode}
        descricao={`${numeroPedido} · ${brl(cobranca.valor)}`}
      />

      <div className="flex flex-col items-center gap-3 px-4 py-4">
        {cobranca.qrCode ? (
          <div className="rounded-lg bg-white p-2">
            <Image
              src={cobranca.qrCode}
              alt={`QR Code do PIX de ${brl(cobranca.valor)}`}
              width={200}
              height={200}
              unoptimized
            />
          </div>
        ) : cobranca.link ? (
          <a
            href={cobranca.link}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[13px] font-medium text-white transition-colors hover:bg-brand-400"
          >
            <ExternalLink className="size-4" /> Abrir o checkout
          </a>
        ) : null}

        <p className="text-center text-[11px] leading-relaxed text-ink-500">
          Recebedor: <span className="text-ink-300">{cobranca.recebedor}</span>
          {cobranca.chave && (
            <>
              <br />
              Chave ({cobranca.tipoChave}): <span className="text-ink-300">{cobranca.chave}</span>
            </>
          )}
        </p>
      </div>

      <div className="border-t border-[var(--linha)] px-4 py-3">
        <p className="rotulo mb-1.5">{cobranca.link ? "Link de pagamento" : "Copia e cola"}</p>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-ink-950 px-2.5 py-2 font-mono text-[11px] text-ink-400 ring-1 ring-inset ring-[var(--linha)]">
            {cobranca.link ?? cobranca.copiaECola}
          </code>
          <Button
            variante={copiado ? "ok" : "primario"}
            tamanho="icone"
            onClick={copiar}
            aria-label="Copiar código PIX"
            title="Copiar código"
          >
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>

      <div className={cn(
        "flex items-start gap-2 border-t border-[var(--linha)] px-4 py-3",
        cobranca.confirmacaoAutomatica ? "bg-ok-500/6" : "bg-warn-500/6",
      )}>
        {cobranca.confirmacaoAutomatica ? (
          <>
            <RefreshCcw className="mt-px size-3.5 shrink-0 text-ok-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-relaxed text-ok-300">
                O pagamento é confirmado sozinho quando cair — o pedido entra em
                separação na hora.
              </p>
              <button
                type="button"
                onClick={conferir}
                disabled={conferindo}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-ok-400 underline-offset-2 transition-colors hover:text-ok-300 hover:underline disabled:opacity-50"
              >
                {conferindo
                  ? <><Loader2 className="size-3 animate-spin" /> Consultando…</>
                  : <><RefreshCcw className="size-3" /> O cliente diz que pagou? Conferir agora</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn-400" />
            <p className="text-[11px] leading-relaxed text-warn-300">
              Sem gateway configurado, a baixa é manual: confira o comprovante e
              marque como pago. O comprovante chega com <strong>{cobranca.identificador}</strong> no
              identificador.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
