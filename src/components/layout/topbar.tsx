"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Radio, Wifi, WifiOff } from "lucide-react";
import { TITULOS } from "./nav";
import { BuscaGlobal } from "./busca-global";
import { Notificacoes } from "./notificacoes";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export function Topbar({ demo }: { demo: boolean }) {
  const pathname = usePathname();
  const [relogio, setRelogio] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setRelogio(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const meta =
    TITULOS[pathname] ??
    TITULOS[Object.keys(TITULOS).filter((k) => k !== "/" && pathname.startsWith(k)).sort((a, b) => b.length - a.length)[0]] ??
    { titulo: "Luxx Pods", descricao: "" };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/6 bg-ink-950/80 px-4 backdrop-blur-xl lg:px-6">
      <div className="min-w-0 flex-1 pl-11 lg:pl-0">
        <h1 className="truncate text-[15px] font-semibold leading-tight text-ink-100">{meta.titulo}</h1>
        {meta.descricao && (
          <p className="hidden truncate text-[11px] leading-tight text-ink-500 sm:block">{meta.descricao}</p>
        )}
      </div>

      <BuscaGlobal />

      <Badge tom={demo ? "warn" : "ok"} ponto className="hidden sm:inline-flex">
        {demo ? "Base de demonstração" : "Supabase conectado"}
      </Badge>

      <span className="hidden items-center gap-1.5 text-[11px] font-medium tabular-nums text-ink-400 md:flex">
        <Radio className="size-3 text-ok-400 live-dot" />
        {relogio}
      </span>

      <Notificacoes />

      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white">
        LX
      </div>
    </header>
  );
}

export function StatusRealtime({ ligado }: { ligado: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[11px] font-medium",
      ligado ? "text-ok-400" : "text-ink-500",
    )}>
      {ligado ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
      {ligado ? "ao vivo" : "offline"}
    </span>
  );
}
