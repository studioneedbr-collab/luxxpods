"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  documentoValido, mascaraCEP, mascaraCNPJ, mascaraCPF, mascaraDocumento,
  mascaraTelefone, soDigitos,
} from "@/lib/mascaras";
import { cn } from "@/lib/utils";

type Tipo = "telefone" | "cpf" | "cnpj" | "documento" | "cep";

const MASCARA: Record<Tipo, (v: string) => string> = {
  telefone: mascaraTelefone,
  cpf: mascaraCPF,
  cnpj: mascaraCNPJ,
  documento: mascaraDocumento,
  cep: mascaraCEP,
};

const PLACEHOLDER: Record<Tipo, string> = {
  telefone: "(33) 91234-5678",
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  documento: "CPF ou CNPJ",
  cep: "39800-000",
};

/**
 * Campo com máscara. Guarda só os dígitos e mostra formatado.
 * Avisa quando o documento não passa no dígito verificador — mas só depois
 * que a pessoa sai do campo, para não acusar erro enquanto ela digita.
 */
export function CampoMascara({
  tipo, valor, aoMudar, className, id, placeholder, disabled, validar = true,
}: {
  tipo: Tipo;
  /** valor cru, só dígitos */
  valor: string;
  aoMudar: (digitos: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  validar?: boolean;
}) {
  const [tocado, setTocado] = useState(false);
  const formatado = MASCARA[tipo](valor ?? "");

  const documento = tipo === "cpf" || tipo === "cnpj" || tipo === "documento";
  const invalido =
    validar && documento && tocado && Boolean(valor) && !documentoValido(valor);

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        value={formatado}
        disabled={disabled}
        inputMode="numeric"
        placeholder={placeholder ?? PLACEHOLDER[tipo]}
        onChange={(e) => aoMudar(soDigitos(e.target.value))}
        onBlur={() => setTocado(true)}
        aria-invalid={invalido || undefined}
        className={cn(
          "h-8 w-full rounded-md bg-ink-950 px-2.5 text-[13px] tabular-nums text-ink-100",
          "ring-1 ring-inset transition-colors placeholder:text-ink-600",
          "focus:outline-none focus:ring-2 disabled:opacity-50",
          invalido
            ? "ring-bad-500/50 focus:ring-bad-500/60"
            : "ring-[var(--linha)] focus:ring-brand-500/60",
        )}
      />
      {invalido && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-bad-400">
          <AlertCircle className="size-2.5 shrink-0" />
          {soDigitos(valor).length > 11 ? "CNPJ" : "CPF"} inválido — confira os números
        </p>
      )}
    </div>
  );
}
