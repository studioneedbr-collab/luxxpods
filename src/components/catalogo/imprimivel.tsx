"use client";

import { useEffect, useMemo } from "react";
import { Printer, X } from "lucide-react";
import Link from "next/link";
import { brl } from "@/lib/utils";
import type { ItemCatalogo } from "@/lib/types";

/**
 * Catálogo pronto para virar PDF.
 *
 * Abre o diálogo de impressão sozinho: com o destino "Salvar como PDF" sai um
 * arquivo. Fizemos assim em vez de montar o PDF em código porque esta peça é
 * comercial — a tipografia, os acentos e o encaixe das colunas saem certos de
 * graça, e o arquivo acompanha a identidade do painel sem fonte embutida.
 */
export function CatalogoImprimivel({
  itens, geradoEm,
}: { itens: ItemCatalogo[]; geradoEm: Date }) {
  // o cliente não compra o que não existe: só sabor com peça disponível
  const porMarca = useMemo(() => {
    type Produto = {
      marca: string; produto: string; modelo: string | null;
      puffs: number | null; preco: number; sabores: string[];
    };

    const produtos = new Map<string, Produto>();

    for (const i of itens) {
      if (!i.vendavel || i.estoque_disponivel <= 0) continue;

      const atual = produtos.get(i.product_id);
      if (atual) {
        atual.sabores.push(i.sabor);
        // o preço mostrado é o menor entre os sabores, para o catálogo nunca
        // prometer menos do que o cliente vê quando escolhe
        atual.preco = Math.min(atual.preco, i.preco);
      } else {
        produtos.set(i.product_id, {
          marca: i.marca ?? "Outros", produto: i.produto, modelo: i.modelo,
          puffs: i.puffs, preco: i.preco, sabores: [i.sabor],
        });
      }
    }

    const marcas = new Map<string, Produto[]>();
    for (const p of produtos.values()) {
      marcas.set(p.marca, [...(marcas.get(p.marca) ?? []), p]);
    }

    return [...marcas.entries()]
      .map(([marca, lista]) => ({
        marca,
        // o de mais puffs primeiro: é o que a loja quer vender
        produtos: lista.sort((a, b) => (b.puffs ?? 0) - (a.puffs ?? 0)),
      }))
      .sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR"));
  }, [itens]);

  const totalSabores = porMarca.reduce(
    (a, m) => a + m.produtos.reduce((x, p) => x + p.sabores.length, 0), 0,
  );

  useEffect(() => {
    // um quadro para a fonte assentar antes do diálogo abrir
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const data = geradoEm.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <>
      {/* ------------------------- só na tela ------------------------- */}
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="display text-[15px] font-semibold text-ink-100">
            Catálogo para o cliente
          </h1>
          <p className="text-[11px] text-ink-500">
            {totalSabores} sabor{totalSabores === 1 ? "" : "es"} em estoque · no
            diálogo de impressão escolha <strong>Salvar como PDF</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-400"
          >
            <Printer className="size-3.5" /> Salvar em PDF
          </button>
          <Link
            href="/catalogo"
            className="grid size-9 place-items-center rounded-lg bg-ink-800 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100"
            aria-label="Voltar ao catálogo"
          >
            <X className="size-4" />
          </Link>
        </div>
      </div>

      {/* --------------------------- a peça --------------------------- */}
      <article className="peca mx-auto w-full max-w-[820px] bg-white px-10 py-9 text-[#111] shadow-xl print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-end justify-between gap-6 border-b-2 border-[#111] pb-4">
          <div>
            <p className="display text-[30px] font-bold leading-none tracking-tight">
              LUXX PODS
            </p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[#666]">
              Teófilo Otoni · MG
            </p>
          </div>
          <div className="text-right text-[10px] leading-relaxed text-[#666]">
            <p>Atualizado em {data}</p>
            <p className="font-medium text-[#111]">{totalSabores} sabores em estoque</p>
            <p>WhatsApp (33) 99999-0000</p>
          </div>
        </header>

        {porMarca.length === 0 ? (
          <p className="py-14 text-center text-[12px] text-[#666]">
            Nenhum sabor em estoque agora. Dê entrada na mercadoria e gere o
            catálogo de novo.
          </p>
        ) : (
          porMarca.map((m) => (
            <section key={m.marca} className="mt-7 break-inside-avoid">
              <h2 className="display border-b border-[#ddd] pb-1 text-[15px] font-bold uppercase tracking-wide">
                {m.marca}
              </h2>

              {m.produtos.map((p) => (
                <div key={p.produto} className="mt-3.5 break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[13px] font-semibold">
                      {p.produto}
                      {p.puffs ? (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-[#777]">
                          {p.puffs.toLocaleString("pt-BR")} puffs
                        </span>
                      ) : null}
                    </h3>
                    <span className="numero shrink-0 text-[14px] font-bold tabular-nums">
                      {brl(p.preco)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-[1.7] text-[#444]">
                    {p.sabores.sort((a, b) => a.localeCompare(b, "pt-BR")).join(" · ")}
                  </p>
                </div>
              ))}
            </section>
          ))
        )}

        <footer className="mt-9 border-t border-[#ddd] pt-3.5 text-[9.5px] leading-relaxed text-[#777]">
          <p className="font-semibold uppercase tracking-wider text-[#111]">
            Venda proibida para menores de 18 anos
          </p>
          <p className="mt-1">
            Preços e sabores sujeitos a alteração sem aviso · Sabor fora desta
            lista é porque acabou · Entrega em Teófilo Otoni
          </p>
        </footer>
      </article>

    </>
  );
}
