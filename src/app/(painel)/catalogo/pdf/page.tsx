import type { Metadata } from "next";
import { getCatalogo } from "@/lib/data";
import { CatalogoImprimivel } from "@/components/catalogo/imprimivel";

export const metadata: Metadata = {
  title: "Catálogo Luxx Pods",
  description: "Catálogo para enviar ao cliente.",
};

export const dynamic = "force-dynamic";

/**
 * O catálogo em PDF.
 *
 * Esta é peça que vai para o cliente no WhatsApp, então ela não é a tela de
 * operação impressa: só o que interessa a quem compra — marca, modelo, puffs,
 * sabores que existem agora e o preço. Custo, margem e estoque ficam de fora
 * de propósito; o número de peças em casa não é assunto do cliente.
 */
export default async function CatalogoPdfPage() {
  const itens = await getCatalogo();
  return <CatalogoImprimivel itens={itens} geradoEm={new Date()} />;
}
