"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { entrar } from "@/lib/actions-auth";
import { cn } from "@/lib/utils";

export function FormularioLogin({ voltarPara }: { voltarPara?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const r = await entrar(email.trim(), senha, lembrar);

    if (r.ok) {
      // só aceita destino interno: "//outro.site" seria redirecionamento aberto
      const destino =
        voltarPara?.startsWith("/") && !voltarPara.startsWith("//") ? voltarPara : "/";
      router.push(destino);
      router.refresh();
    } else {
      setErro(r.erro ?? "Não consegui entrar. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-8 space-y-4">
      <label className="block">
        <span className="rotulo mb-2 block">E-mail</span>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@luxxpods.com.br"
          className="h-11 w-full rounded-lg bg-ink-900 px-3.5 text-[14px] text-ink-100 ring-1 ring-inset ring-[var(--linha-forte)] transition-colors placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/70"
        />
      </label>

      <label className="block">
        <span className="rotulo mb-2 block">Senha</span>
        <div className="relative">
          <input
            id="senha"
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            className="h-11 w-full rounded-lg bg-ink-900 pl-3.5 pr-11 text-[14px] text-ink-100 ring-1 ring-inset ring-[var(--linha-forte)] transition-colors placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-brand-500/70"
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
          >
            {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      <div className="flex items-center justify-between pt-0.5">
        <button
          type="button"
          onClick={() => setLembrar((v) => !v)}
          className="flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-ink-200"
        >
          <span className={cn(
            "grid size-4 place-items-center rounded transition-colors",
            lembrar ? "bg-brand-500" : "bg-ink-800 ring-1 ring-inset ring-[var(--linha-forte)]",
          )}>
            {lembrar && (
              <svg viewBox="0 0 10 8" className="size-2.5 fill-none stroke-white stroke-[1.8]">
                <path d="M1 4l2.5 2.5L9 1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          Manter conectado
        </button>

        <span className="text-[12px] text-ink-600">Esqueceu a senha? Fale com o admin</span>
      </div>

      {erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-bad-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-bad-400"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || !email || !senha}
        className="display mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[14px] font-semibold text-white transition-colors hover:bg-brand-400 disabled:pointer-events-none disabled:opacity-40"
      >
        {enviando
          ? <><Loader2 className="size-4 animate-spin" /> Entrando…</>
          : <><LogIn className="size-4" /> Entrar</>}
      </button>
    </form>
  );
}
