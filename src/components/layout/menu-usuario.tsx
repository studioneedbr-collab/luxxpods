"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, Shield, UserCog } from "lucide-react";
import { sair } from "@/lib/actions-auth";
import { iniciais } from "@/lib/utils";

export function MenuUsuario({
  nome, email,
}: { nome: string; email: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState({ top: 0, right: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (r) setAncora({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (gatilho.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setAberto(false);
    };
    posicionar();
    document.addEventListener("mousedown", fora);
    window.addEventListener("resize", posicionar);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={gatilho}
        onClick={() => setAberto((v) => !v)}
        aria-label="Menu do usuário"
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/16 text-[11px] font-semibold text-brand-200 ring-1 ring-inset ring-brand-500/25 transition-colors hover:bg-brand-500/24"
      >
        {iniciais(nome)}
      </button>

      {aberto && createPortal(
        <div
          ref={painel}
          style={{ top: ancora.top, right: ancora.right }}
          className="flutua fixed z-[100] w-56 animate-in-up overflow-hidden"
        >
          <div className="border-b border-[var(--linha)] px-3.5 py-3">
            <p className="truncate text-[13px] font-medium text-ink-100">{nome}</p>
            <p className="truncate text-[11px] text-ink-500">{email}</p>
          </div>

          <div className="py-1">
            {[
              { href: "/usuarios", rotulo: "Usuários", icone: UserCog },
              { href: "/permissoes", rotulo: "Permissões", icone: Shield },
              { href: "/configuracoes", rotulo: "Configurações", icone: Settings },
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setAberto(false)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
              >
                <i.icone className="size-3.5 text-ink-500" />
                {i.rotulo}
              </Link>
            ))}
          </div>

          <button
            onClick={async () => {
              setAberto(false);
              await sair();
              router.push("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2.5 border-t border-[var(--linha)] px-3.5 py-2.5 text-[13px] text-bad-400 transition-colors hover:bg-bad-500/10"
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
