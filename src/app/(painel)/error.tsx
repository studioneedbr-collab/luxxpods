"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";
import { Button, Panel } from "@/components/ui";

export default function ErroDaTela({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // em produção, este é o ponto de envio para o monitoramento (§61 do escopo)
    console.error("[luxx] erro na tela:", error);
  }, [error]);

  return (
    <Panel className="mx-auto max-w-lg overflow-hidden">
      <div className="flex items-start gap-4 px-6 py-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bad-500/12 text-bad-400 ring-1 ring-inset ring-bad-500/20">
          <AlertTriangle className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-100">Esta tela não carregou</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            O resto do sistema continua funcionando — nenhum pedido, estoque ou
            lançamento foi afetado. Tente carregar de novo.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-[10px] text-ink-600">código: {error.digest}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-white/6 px-6 py-3.5">
        <Link href="/">
          <Button variante="fantasma"><Home className="size-3.5" /> Ir para o dashboard</Button>
        </Link>
        <Button variante="primario" onClick={reset}>
          <RefreshCcw className="size-3.5" /> Tentar de novo
        </Button>
      </div>
    </Panel>
  );
}
