import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Button, Panel } from "@/components/ui";

/** 404 dentro do painel — mantém a navegação lateral visível. */
export default function NaoEncontradoNoPainel() {
  return (
    <Panel className="mx-auto max-w-md overflow-hidden text-center">
      <div className="px-6 py-8">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-500/20">
          <PackageSearch className="size-5" />
        </span>
        <h1 className="mt-4 text-base font-semibold text-ink-100">Registro não encontrado</h1>
        <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-ink-400">
          O pedido, cliente ou produto que você tentou abrir não existe mais
          ou o link está desatualizado.
        </p>
      </div>
      <div className="flex justify-center gap-2 border-t border-white/6 px-6 py-3.5">
        <Link href="/pedidos"><Button variante="fantasma">Ver pedidos</Button></Link>
        <Link href="/"><Button variante="primario">Ir para o dashboard</Button></Link>
      </div>
    </Panel>
  );
}
