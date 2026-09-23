"use client";

import { usePathname } from "next/navigation";
import { TITULOS } from "./nav";
import { BuscaGlobal } from "./busca-global";
import { Notificacoes } from "./notificacoes";
import { MenuUsuario } from "./menu-usuario";

export function Topbar({ nome, email }: { nome: string; email: string }) {
  const pathname = usePathname();

  const meta =
    TITULOS[pathname] ??
    TITULOS[
      Object.keys(TITULOS)
        .filter((k) => k !== "/" && pathname.startsWith(k))
        .sort((a, b) => b.length - a.length)[0]
    ] ?? { titulo: "Luxx Pods", descricao: "" };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--linha)] bg-ink-990/90 px-4 backdrop-blur-xl lg:px-6">
      <div className="min-w-0 flex-1 pl-11 lg:pl-0">
        <h1 className="display truncate text-[15px] font-semibold leading-tight text-ink-100">
          {meta.titulo}
        </h1>
        {meta.descricao && (
          <p className="hidden truncate text-[11px] leading-tight text-ink-500 sm:block">
            {meta.descricao}
          </p>
        )}
      </div>

      {/* sem gatilho visível: a busca abre por ⌘K / Ctrl+K */}
      <BuscaGlobal />

      <Notificacoes />

      <MenuUsuario nome={nome} email={email} />
    </header>
  );
}
