"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const deIso = (v?: string | null) => {
  if (!v) return null;
  const [a, m, d] = v.slice(0, 10).split("-").map(Number);
  return a && m && d ? new Date(a, m - 1, d) : null;
};

const exibir = (v?: string | null) => {
  const d = deIso(v);
  return d ? d.toLocaleDateString("pt-BR") : "";
};

/**
 * Calendário próprio — o date picker nativo muda de cara em cada navegador
 * e em pt-BR fica inconsistente. Aceita digitação em dd/mm/aaaa e tem
 * atalhos para o que a operação usa todo dia.
 */
export function CampoData({
  valor, aoMudar, className, placeholder = "dd/mm/aaaa", id, disabled,
  min, max, comHora,
}: {
  /** ISO: "2026-09-23" ou "2026-09-23T14:00" */
  valor: string | null;
  aoMudar: (v: string | null) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  comHora?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState(() => exibir(valor));
  const [ultimo, setUltimo] = useState(valor);
  const [mesVisivel, setMesVisivel] = useState(() => deIso(valor) ?? new Date());
  const [ancora, setAncora] = useState({ top: 0, left: 0 });

  const caixa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  const hora = comHora ? (valor?.slice(11, 16) || "09:00") : "";

  if (valor !== ultimo) {
    setUltimo(valor);
    setDigitado(exibir(valor));
    const d = deIso(valor);
    if (d) setMesVisivel(d);
  }

  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const r = caixa.current?.getBoundingClientRect();
      if (!r) return;
      const altura = comHora ? 340 : 300;
      const cabe = window.innerHeight - r.bottom > altura;
      setAncora({
        top: cabe ? r.bottom + 4 : Math.max(8, r.top - altura - 4),
        left: Math.min(r.left, window.innerWidth - 280),
      });
    };
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setAberto(false);
    };
    posicionar();
    document.addEventListener("mousedown", fora);
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto, comHora]);

  function escolher(dia: Date) {
    const base = iso(dia);
    aoMudar(comHora ? `${base}T${hora}` : base);
    setDigitado(dia.toLocaleDateString("pt-BR"));
    if (!comHora) setAberto(false);
  }

  /** aceita 23/09/2026 digitado à mão */
  function confirmarDigitado(texto: string) {
    const so = texto.replace(/\D/g, "");
    if (so.length !== 8) { setDigitado(exibir(valor)); return; }
    const d = Number(so.slice(0, 2));
    const m = Number(so.slice(2, 4));
    const a = Number(so.slice(4, 8));
    const data = new Date(a, m - 1, d);
    if (data.getDate() !== d || data.getMonth() !== m - 1) { setDigitado(exibir(valor)); return; }
    escolher(data);
    setMesVisivel(data);
  }

  const primeiroDia = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), 1);
  const totalDias = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 0).getDate();
  const offset = primeiroDia.getDay();
  const hoje = new Date();
  const escolhido = deIso(valor);

  const foraDoLimite = (d: Date) =>
    (min ? iso(d) < min.slice(0, 10) : false) || (max ? iso(d) > max.slice(0, 10) : false);

  return (
    <>
      <div ref={caixa} className={cn("relative", className)}>
        <input
          id={id}
          value={digitado}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            const so = e.target.value.replace(/\D/g, "").slice(0, 8);
            const partes = [so.slice(0, 2), so.slice(2, 4), so.slice(4, 8)].filter(Boolean);
            setDigitado(partes.join("/"));
          }}
          onBlur={(e) => confirmarDigitado(e.target.value)}
          onFocus={() => setAberto(true)}
          inputMode="numeric"
          className={cn(
            "h-8 w-full rounded-md bg-ink-950 pl-2.5 pr-14 text-[13px] tabular-nums text-ink-100",
            "ring-1 ring-inset ring-[var(--linha)] transition-colors",
            "placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60",
            "disabled:opacity-50",
          )}
        />

        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {valor && !disabled && (
            <button
              type="button"
              aria-label="Limpar data"
              onClick={() => { aoMudar(null); setDigitado(""); }}
              className="grid size-6 place-items-center rounded text-ink-600 transition-colors hover:bg-ink-800 hover:text-ink-300"
            >
              <X className="size-3" />
            </button>
          )}
          <button
            type="button"
            aria-label="Abrir calendário"
            disabled={disabled}
            onClick={() => setAberto((v) => !v)}
            className="grid size-6 place-items-center rounded text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
          >
            <CalendarDays className="size-3.5" />
          </button>
        </div>
      </div>

      {aberto && createPortal(
        <div
          ref={painel}
          style={{ top: ancora.top, left: ancora.left }}
          className="flutua fixed z-[110] w-[268px] animate-in-up p-2.5"
        >
          {/* cabeçalho do mês */}
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMesVisivel(new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() - 1, 1))}
              className="grid size-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="display text-[13px] font-semibold capitalize text-ink-100">
              {MESES[mesVisivel.getMonth()]} {mesVisivel.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setMesVisivel(new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 1))}
              className="grid size-6 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {DIAS.map((d, i) => (
              <span key={i} className="pb-1 text-center text-[10px] font-medium text-ink-600">
                {d}
              </span>
            ))}

            {Array.from({ length: offset }).map((_, i) => <span key={`v${i}`} />)}

            {Array.from({ length: totalDias }).map((_, i) => {
              const dia = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), i + 1);
              const ehHoje = iso(dia) === iso(hoje);
              const ativo = escolhido && iso(dia) === iso(escolhido);
              const bloqueado = foraDoLimite(dia);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => escolher(dia)}
                  className={cn(
                    "h-7 rounded text-[12px] tabular-nums transition-colors",
                    bloqueado && "cursor-not-allowed text-ink-700",
                    !bloqueado && ativo && "bg-brand-500 font-semibold text-white",
                    !bloqueado && !ativo && ehHoje && "bg-ink-800 font-semibold text-brand-300",
                    !bloqueado && !ativo && !ehHoje && "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {comHora && (
            <div className="mt-2 flex items-center gap-2 border-t border-[var(--linha)] pt-2">
              <span className="text-[11px] text-ink-500">Hora</span>
              <input
                type="time"
                value={hora}
                onChange={(e) => {
                  const base = valor?.slice(0, 10) ?? iso(new Date());
                  aoMudar(`${base}T${e.target.value}`);
                }}
                className="h-7 flex-1 rounded bg-ink-950 px-2 text-[12px] tabular-nums text-ink-100 ring-1 ring-inset ring-[var(--linha)] focus:outline-none focus:ring-2 focus:ring-brand-500/60"
              />
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="h-7 rounded bg-brand-500 px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-400"
              >
                Pronto
              </button>
            </div>
          )}

          {/* atalhos do dia a dia da operação */}
          <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--linha)] pt-2">
            {[
              { rotulo: "Hoje", dias: 0 },
              { rotulo: "Amanhã", dias: 1 },
              { rotulo: "7 dias", dias: 7 },
              { rotulo: "30 dias", dias: 30 },
            ].map((a) => (
              <button
                key={a.rotulo}
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + a.dias);
                  escolher(d);
                  setMesVisivel(d);
                }}
                className="rounded bg-ink-850 px-2 py-1 text-[10px] text-ink-400 transition-colors hover:bg-brand-500/15 hover:text-brand-200"
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
