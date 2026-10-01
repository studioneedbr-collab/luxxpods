"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { criarPrimeiroAdministrador } from "@/lib/actions-usuarios";
import { entrar } from "@/lib/actions-auth";

const MIN_SENHA = 8;

const campo =
  "h-11 w-full rounded-lg bg-ink-900 px-3.5 text-[13px] text-ink-100 ring-1 ring-inset " +
  "ring-[var(--linha-forte)] transition-colors placeholder:text-ink-600 " +
  "focus:outline-none focus:ring-2 focus:ring-brand-500/70";

export function FormularioPrimeiroAcesso() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const curta = senha.length > 0 && senha.length < MIN_SENHA;
  const diferente = repetir.length > 0 && senha !== repetir;
  const pronto = nome.trim() && email && senha.length >= MIN_SENHA && senha === repetir;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const r = await criarPrimeiroAdministrador(nome.trim(), email.trim(), senha);

    if (!r.ok) {
      setErro(r.erro ?? "Não consegui criar a conta.");
      setEnviando(false);
      return;
    }

    // já entra: a pessoa acabou de digitar a senha, pedir de novo é atrito
    const sessao = await entrar(email.trim(), senha, true);
    router.push(sessao.ok ? "/" : "/login");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="mt-8 space-y-4">
      <label className="block">
        <span className="rotulo mb-2 block">Seu nome</span>
        <input
          type="text" autoComplete="name" required value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Como aparece no painel" className={campo}
        />
      </label>

      <label className="block">
        <span className="rotulo mb-2 block">E-mail</span>
        <input
          type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@luxxpods.com.br" className={campo}
        />
      </label>

      <label className="block">
        <span className="rotulo mb-2 block">Senha</span>
        <div className="relative">
          <input
            type={verSenha ? "text" : "password"}
            autoComplete="new-password" required value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="pelo menos 8 caracteres"
            className={campo.replace("px-3.5", "pl-3.5 pr-11")}
          />
          <button
            type="button" onClick={() => setVerSenha((v) => !v)}
            aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
          >
            {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {curta && (
          <span className="mt-1.5 block text-[11px] text-warn-400">
            Faltam {MIN_SENHA - senha.length} caracteres.
          </span>
        )}
      </label>

      <label className="block">
        <span className="rotulo mb-2 block">Repita a senha</span>
        <input
          type={verSenha ? "text" : "password"}
          autoComplete="new-password" required value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          placeholder="••••••••" className={campo}
        />
        {diferente && (
          <span className="mt-1.5 block text-[11px] text-warn-400">
            As duas senhas estão diferentes.
          </span>
        )}
      </label>

      {erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-bad-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-bad-400"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || !pronto}
        className="display mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[13px] font-semibold text-white transition-colors hover:bg-brand-400 disabled:pointer-events-none disabled:opacity-40"
      >
        {enviando
          ? <><Loader2 className="size-4 animate-spin" /> Criando…</>
          : <><UserPlus className="size-4" /> Criar e entrar</>}
      </button>

      <p className="pt-1 text-center text-[11px] leading-relaxed text-ink-600">
        Não existe recuperação por e-mail: quem esquecer a senha pede a um
        administrador. Por isso esta primeira senha precisa ficar guardada.
      </p>
    </form>
  );
}
