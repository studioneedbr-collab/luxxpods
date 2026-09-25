import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { FormularioLogin } from "@/components/auth/formulario-login";
import { Simbolo, Wordmark } from "@/components/layout/marca";

export const metadata: Metadata = {
  title: "Entrar — Luxx Pods",
  description: "Acesso ao sistema de operação da Luxx Pods.",
};

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { voltar } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------ a marca ------------------------------ */}
      <aside className="relative hidden overflow-hidden bg-ink-990 lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* o brilho do diamante, saindo de trás do símbolo */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[18%] top-1/2 size-[560px] -translate-y-1/2 rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, #9558e8 0%, #2a3f78 50%, transparent 72%)" }}
        />
        {/* hairline vertical separando os dois lados */}
        <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-[var(--linha)]" />

        <Wordmark altura={20} className="relative opacity-90" />

        <div className="relative max-w-[26rem]">
          <Simbolo tamanho={104} className="mb-9" />
          <h2 className="display text-[26px] font-semibold leading-[1.15] tracking-tight text-ink-100">
            O atendimento, o estoque<br />e o caixa no mesmo lugar.
          </h2>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
            WhatsApp e Instagram numa caixa de entrada só. O bot lê o catálogo
            direto do estoque, e cada venda cai no financeiro sem ninguém
            digitar duas vezes.
          </p>

          <dl className="mt-9 grid grid-cols-3 gap-5 border-t border-[var(--linha)] pt-6">
            {[
              ["Canais", "WhatsApp e Instagram"],
              ["Estoque", "produto + sabor"],
              ["Pagamento", "PIX e dinheiro"],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="rotulo">{rotulo}</dt>
                <dd className="mt-1 text-[11px] leading-snug text-ink-300">{valor}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative flex items-center gap-2 text-[11px] text-ink-600">
          <ShieldCheck className="size-3.5" />
          Uso restrito à equipe · Venda proibida para menores de 18 anos
        </p>
      </aside>

      {/* ---------------------------- o formulário ---------------------------- */}
      <main className="flex items-center justify-center bg-ink-950 px-5 py-12">
        <div className="w-full max-w-[22rem]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Simbolo tamanho={44} />
            <Wordmark altura={17} />
          </div>

          <p className="rotulo text-brand-400">Entrar</p>
          <h1 className="display mt-2.5 text-[26px] font-semibold leading-none tracking-tight text-ink-100">
            Acesse o painel
          </h1>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-400">
            Use o e-mail que a administração cadastrou para você.
          </p>

          <FormularioLogin voltarPara={voltar} />
        </div>
      </main>
    </div>
  );
}
