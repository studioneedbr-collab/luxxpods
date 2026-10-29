"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { importarConversasDoWhatsapp } from "@/lib/actions-importar";

/**
 * Traz as conversas que já existem no WhatsApp para a caixa de entrada.
 *
 * O que vem depende do provedor, e o texto muda junto — de propósito. Na
 * FluxoAPI o histórico existe (`GET /conversations/{id}/messages`) e vem o
 * conteúdo das mais recentes; na Z-API não existe endpoint de histórico, e a
 * conversa nasce só com o contato. Quem aperta isto espera ver as conversas
 * de ontem: deixar a expectativa errada é pior que não ter o botão.
 */
export function ImportarWhatsapp() {
  const [importando, setImportando] = useState(false);
  const [comHistorico, setComHistorico] = useState<boolean | null>(null);
  const toast = useToast();

  async function importar() {
    setImportando(true);
    const r = await importarConversasDoWhatsapp();
    setImportando(false);

    if (!r.ok) {
      toast.erro("Não consegui importar", r.erro);
      return;
    }

    setComHistorico((r.mensagens_importadas ?? 0) > 0);

    const partes = [
      r.conversas_novas ? `${r.conversas_novas} conversa(s)` : null,
      r.clientes_novos ? `${r.clientes_novos} cliente(s) novo(s)` : null,
      r.mensagens_importadas
        ? `${r.mensagens_importadas} mensagem(ns) em ${r.com_historico} conversa(s)`
        : null,
      r.ja_existiam ? `${r.ja_existiam} já existia(m)` : null,
    ].filter(Boolean);

    if (!r.conversas_novas && !r.clientes_novos) {
      toast.aviso("Nada novo para importar", partes.join(" · ") || undefined);
      return;
    }
    toast.ok(`Importado da ${r.provedor ?? "API"}`, partes.join(" · "));
  }

  return (
    <div className="space-y-2.5 border-t border-[var(--linha)] pt-3">
      <Button variante="suave" tamanho="sm" onClick={importar} disabled={importando}>
        {importando
          ? <><Loader2 className="size-3.5 animate-spin" /> Importando…</>
          : <><Download className="size-3.5" /> Trazer conversas do WhatsApp</>}
      </Button>

      <p className="text-[11px] leading-relaxed text-ink-500">
        Traz os contatos e as conversas que já existem no número conectado,
        com o contador de não lidas.{" "}
        {comHistorico === false ? (
          <>
            <strong className="text-ink-300">
              Deste provedor o histórico das mensagens não vem
            </strong>{" "}
            — ele fica no aparelho, e o conteúdo passa a ser gravado da
            conexão em diante.
          </>
        ) : (
          <>
            Na FluxoAPI vem também o{" "}
            <strong className="text-ink-300">conteúdo das conversas mais
            recentes</strong>; o resto se preenche conforme as pessoas
            escrevem. Na Z-API o histórico não existe e fica no aparelho.
          </>
        )}{" "}
        O bot entra desligado nas conversas importadas, porque não viu o
        começo delas.
      </p>
    </div>
  );
}
