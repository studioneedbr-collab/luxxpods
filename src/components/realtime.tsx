"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Mantém a tela sincronizada com o banco.
 * Com Supabase: escuta as mudanças nas tabelas informadas.
 * Sem Supabase: revalida em intervalo — pausando enquanto a aba está em
 * segundo plano, para não gastar requisição à toa.
 */
export function Realtime({
  tabelas, intervalo = 60000,
}: { tabelas: string[]; intervalo?: number }) {
  const router = useRouter();
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chave = tabelas.join(",");

  useEffect(() => {
    const lista = chave.split(",");

    // agrupa rajadas de eventos num único refresh
    const atualizar = () => {
      if (document.hidden) return;
      if (pendente.current) clearTimeout(pendente.current);
      pendente.current = setTimeout(() => router.refresh(), 400);
    };

    const supabase = getSupabaseBrowser();

    if (!supabase) {
      const ciclo = setInterval(atualizar, intervalo);
      // ao voltar para a aba, atualiza na hora
      const aoVoltar = () => { if (!document.hidden) atualizar(); };
      document.addEventListener("visibilitychange", aoVoltar);
      return () => {
        clearInterval(ciclo);
        document.removeEventListener("visibilitychange", aoVoltar);
        if (pendente.current) clearTimeout(pendente.current);
      };
    }

    const canal = supabase.channel(`painel-${chave}`);
    lista.forEach((table) => {
      canal.on("postgres_changes", { event: "*", schema: "public", table }, atualizar);
    });
    canal.subscribe();

    return () => {
      if (pendente.current) clearTimeout(pendente.current);
      supabase.removeChannel(canal);
    };
  }, [router, chave, intervalo]);

  return null;
}

/** Indicador visual de que a tela está se atualizando sozinha. */
export function PulsoAoVivo({ className }: { className?: string }) {
  const [batendo, setBatendo] = useState(false);

  useEffect(() => {
    const ciclo = setInterval(() => {
      if (document.hidden) return;
      setBatendo(true);
      setTimeout(() => setBatendo(false), 900);
    }, 5000);
    return () => clearInterval(ciclo);
  }, []);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium text-ok-400", className)}
      title="A tela se atualiza sozinha quando algo muda"
    >
      <span className={cn("size-1.5 rounded-full bg-ok-400", batendo && "live-dot")} />
      ao vivo
    </span>
  );
}
