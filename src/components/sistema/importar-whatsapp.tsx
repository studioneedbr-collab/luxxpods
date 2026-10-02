"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { importarConversasDoWhatsapp } from "@/lib/actions-importar";

/**
 * Traz as conversas que já existem no WhatsApp para a caixa de entrada.
 *
 * O texto diz o que NÃO vem, de propósito: quem aperta isto espera ver as
 * conversas de ontem com o conteúdo, e o histórico de mensagem fica no
 * aparelho — a Z-API entrega a lista de conversas e as mensagens novas a
 * partir da conexão. Deixar a expectativa errada é pior que não ter o botão.
 */
export function ImportarWhatsapp() {
  const [importando, setImportando] = useState(false);
  const toast = useToast();

  async function importar() {
    setImportando(true);
    const r = await importarConversasDoWhatsapp();
    setImportando(false);

    if (!r.ok) {
      toast.erro("Não consegui importar", r.erro);
      return;
    }

    const partes = [
      r.conversas_novas ? `${r.conversas_novas} conversa(s)` : null,
      r.clientes_novos ? `${r.clientes_novos} cliente(s) novo(s)` : null,
      r.ja_existiam ? `${r.ja_existiam} já existia(m)` : null,
    ].filter(Boolean);

    if (!r.conversas_novas && !r.clientes_novos) {
      toast.aviso("Nada novo para importar", partes.join(" · ") || undefined);
      return;
    }
    toast.ok("Conversas importadas", partes.join(" · "));
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
        com o contador de não lidas. <strong className="text-ink-300">O
        histórico das mensagens não vem</strong> — ele fica no aparelho, e o
        conteúdo passa a ser gravado da conexão em diante. O bot entra
        desligado nas conversas importadas, porque não viu o começo delas.
      </p>
    </div>
  );
}
