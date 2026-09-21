import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NaoEncontrado() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel w-full max-w-md overflow-hidden text-center">
        <div className="px-6 py-8">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-500/20">
            <Compass className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink-100">Página não encontrada</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-ink-400">
            O endereço acessado não existe no sistema. Pode ter sido um link antigo
            ou um pedido que já foi removido.
          </p>
        </div>
        <div className="border-t border-white/6 px-6 py-3.5">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400"
          >
            <Home className="size-3.5" /> Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
