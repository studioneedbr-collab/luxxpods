import { NextResponse } from "next/server";
import { getCatalogo, getClientes, getPedidos } from "@/lib/data";

export const dynamic = "force-dynamic";

export interface ResultadoBusca {
  tipo: "cliente" | "pedido" | "produto" | "conversa";
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
}

const normalizar = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Busca única sobre cliente, telefone, pedido e produto (§48 do escopo). */
export async function GET(req: Request) {
  const termo = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (termo.length < 2) return NextResponse.json({ resultados: [] });

  const alvo = normalizar(termo);
  const digitos = soDigitos(termo);
  const [clientes, pedidos, catalogo] = await Promise.all([
    getClientes(), getPedidos(300), getCatalogo(),
  ]);

  const resultados: ResultadoBusca[] = [];

  for (const c of clientes) {
    const bate =
      normalizar(c.nome ?? "").includes(alvo) ||
      (digitos.length >= 3 && soDigitos(c.telefone ?? "").includes(digitos)) ||
      normalizar(c.instagram_username ?? "").includes(alvo);
    if (!bate) continue;
    resultados.push({
      tipo: "cliente", id: c.id,
      titulo: c.nome || "Sem nome",
      detalhe: `${c.total_pedidos} pedido(s) · ${c.telefone ?? "sem telefone"}`,
      href: `/clientes/${c.id}`,
    });
    if (resultados.length > 40) break;
  }

  for (const p of pedidos) {
    const bate =
      normalizar(p.numero_pedido).includes(alvo) ||
      normalizar(p.cliente_nome ?? "").includes(alvo) ||
      (digitos.length >= 3 && soDigitos(p.cliente_telefone ?? "").includes(digitos));
    if (!bate) continue;
    resultados.push({
      tipo: "pedido", id: p.id,
      titulo: p.numero_pedido,
      detalhe: `${p.cliente_nome ?? "—"} · ${p.status_pedido.replace(/_/g, " ")}`,
      href: `/pedidos/${p.id}`,
    });
    if (resultados.length > 60) break;
  }

  const produtosVistos = new Set<string>();
  for (const item of catalogo) {
    const bate =
      normalizar(item.produto).includes(alvo) ||
      normalizar(item.sabor).includes(alvo) ||
      normalizar(item.marca ?? "").includes(alvo) ||
      normalizar(item.sku ?? "").includes(alvo);
    if (!bate || produtosVistos.has(item.product_id)) continue;
    produtosVistos.add(item.product_id);
    resultados.push({
      tipo: "produto", id: item.product_id,
      titulo: item.produto,
      detalhe: `${item.marca ?? "—"} · ${item.estoque_disponivel} em estoque`,
      href: "/catalogo",
    });
    if (produtosVistos.size > 12) break;
  }

  return NextResponse.json({ resultados: resultados.slice(0, 24) });
}
