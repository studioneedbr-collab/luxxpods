"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** "1234,5" -> 123450 (centavos) | "R$ 1.234,50" -> 123450 */
function paraCentavos(texto: string): number {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? parseInt(digitos, 10) : 0;
}

/** 123450 -> "1.234,50" */
function formatar(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Campo de dinheiro. O operador digita só os números e a vírgula anda sozinha,
 * como numa maquininha — sem precisar acertar ponto, vírgula ou casa decimal.
 * O valor sai em reais (número), não em centavos.
 */
export function CampoMoeda({
  valor, aoMudar, className, id, placeholder = "0,00", disabled, autoFocus,
}: {
  valor: number;
  aoMudar: (v: number) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState(() => (valor ? formatar(Math.round(valor * 100)) : ""));
  const [ultimoValor, setUltimoValor] = useState(valor);

  // se o valor mudar por fora (abriu outro registro), reflete no campo
  if (valor !== ultimoValor) {
    setUltimoValor(valor);
    setTexto(valor ? formatar(Math.round(valor * 100)) : "");
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-500">
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        autoFocus={autoFocus}
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          const centavos = paraCentavos(e.target.value);
          const formatado = centavos ? formatar(centavos) : "";
          setTexto(formatado);
          setUltimoValor(centavos / 100);
          aoMudar(centavos / 100);
        }}
        className={cn(
          "h-8 w-full rounded-md bg-ink-950 pl-8 pr-2.5 text-right text-[13px] tabular-nums text-ink-100",
          "ring-1 ring-inset ring-[var(--linha)] transition-colors",
          "placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60",
          "disabled:opacity-50",
        )}
      />
    </div>
  );
}

/** Versão só leitura, para exibir valor alinhado com os campos editáveis. */
export function ValorMoeda({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn("numero tabular-nums", className)}>
      <span className="mr-1 text-ink-500">R$</span>
      {formatar(Math.round(valor * 100))}
    </span>
  );
}
