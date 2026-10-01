import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { sistemaSemUsuarios } from "@/lib/actions-usuarios";
import { FormularioPrimeiroAcesso } from "@/components/auth/formulario-primeiro-acesso";
import { Simbolo, Wordmark } from "@/components/layout/marca";

export const metadata: Metadata = {
  title: "Primeiro acesso — Luxx Pods",
  description: "Criação do primeiro administrador do sistema.",
};

export const dynamic = "force-dynamic";

/**
 * O impasse da instalação: só administrador cria usuário, e no banco novo não
 * existe nenhum. Esta tela resolve isso uma vez e se fecha sozinha — assim que
 * houver qualquer perfil, ela manda para o login.
 */
export default async function PrimeiroAcessoPage() {
  if (!(await sistemaSemUsuarios())) redirect("/login");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink-990 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute left-[18%] top-1/2 size-[560px] -translate-y-1/2 rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, #9558e8 0%, #2a3f78 50%, transparent 72%)" }}
        />
        <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-[var(--linha)]" />

        <Wordmark altura={20} className="relative opacity-90" />

        <div className="relative max-w-[26rem]">
          <Simbolo tamanho={104} className="mb-9" />
          <h2 className="display text-[26px] font-semibold leading-[1.15] tracking-tight text-ink-100">
            Banco pronto.<br />Falta quem manda.
          </h2>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
            Esta conta nasce administradora: ela cria as outras, define o que
            cada perfil alcança e é a única que apaga. Daqui para frente todo
            acesso é dado aqui no painel.
          </p>

          <p className="mt-9 border-t border-[var(--linha)] pt-6 text-[11px] leading-relaxed text-ink-500">
            Esta tela só existe enquanto o sistema não tem ninguém. Depois deste
            cadastro ela se fecha e passa a mandar para o login.
          </p>
        </div>

        <p className="relative flex items-center gap-2 text-[11px] text-ink-600">
          <ShieldCheck className="size-3.5" />
          Uso restrito à equipe · Venda proibida para menores de 18 anos
        </p>
      </aside>

      <main className="flex items-center justify-center bg-ink-950 px-5 py-12">
        <div className="w-full max-w-[22rem]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Simbolo tamanho={44} />
            <Wordmark altura={17} />
          </div>

          <p className="rotulo flex items-center gap-1.5 text-brand-400">
            <KeyRound className="size-3" /> Primeiro acesso
          </p>
          <h1 className="display mt-2.5 text-[26px] font-semibold leading-none tracking-tight text-ink-100">
            Crie o administrador
          </h1>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-400">
            É a conta que vai dar acesso a todo mundo depois. Guarde a senha.
          </p>

          <FormularioPrimeiroAcesso />
        </div>
      </main>
    </div>
  );
}
