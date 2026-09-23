"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./index";
import { cn } from "@/lib/utils";

export function Modal({
  titulo, descricao, aberto, onFechar, children, rodape, largura = "md",
}: {
  titulo: string;
  descricao?: string;
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!aberto) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const larguras = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className={cn("panel my-auto w-full animate-in-up overflow-hidden", larguras[largura])}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--linha)] px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-100">{titulo}</h3>
            {descricao && <p className="mt-0.5 text-[11px] text-ink-500">{descricao}</p>}
          </div>
          <Button tamanho="iconeSm" variante="fantasma" onClick={onFechar} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {rodape && (
          <div className="flex justify-end gap-2 border-t border-[var(--linha)] px-5 py-3">{rodape}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Campo */
export function Campo({
  rotulo, children, dica, className,
}: {
  rotulo: string;
  children: React.ReactNode;
  dica?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">
        {rotulo}
      </span>
      {children}
      {dica && <span className="mt-1 block text-[10px] text-ink-500">{dica}</span>}
    </label>
  );
}

export function Textarea({
  className, ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg bg-ink-850 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500",
        "ring-1 ring-inset ring-[var(--linha)] transition resize-y",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/60",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- Switch */
export function Switch({
  ligado, onChange, rotulo, descricao,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
  descricao?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!ligado)}
      className="flex w-full items-center justify-between gap-3 rounded-lg bg-ink-850 px-3 py-2.5 text-left transition hover:bg-ink-800"
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink-200">{rotulo}</span>
        {descricao && <span className="mt-0.5 block text-[10px] text-ink-500">{descricao}</span>}
      </span>
      <span className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition",
        ligado ? "bg-brand-500" : "bg-ink-700",
      )}>
        <span className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white transition-all",
          ligado ? "left-[18px]" : "left-0.5",
        )} />
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- Confirmar */
export function Confirmar({
  aberto, titulo, mensagem, onConfirmar, onCancelar, textoConfirmar = "Confirmar", perigo,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  textoConfirmar?: string;
  perigo?: boolean;
}) {
  return (
    <Modal aberto={aberto} onFechar={onCancelar} titulo={titulo} largura="sm"
      rodape={
        <>
          <Button variante="fantasma" onClick={onCancelar}>Cancelar</Button>
          <Button variante={perigo ? "perigo" : "primario"} onClick={onConfirmar}>
            {textoConfirmar}
          </Button>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-ink-400">{mensagem}</p>
    </Modal>
  );
}
