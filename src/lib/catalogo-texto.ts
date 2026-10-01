/**
 * O catálogo em texto, para mandar no WhatsApp.
 *
 * Montado na hora do envio a partir do estoque, nunca de arquivo salvo: uma
 * imagem de catálogo envelhece no minuto seguinte, e aí o bot oferece sabor
 * que acabou. O cliente escolhe, o atendente diz que não tem, e a venda morre
 * com o cliente achando que a loja é desorganizada.
 *
 * A regra que não pode quebrar: só entra aqui o que está DISPONÍVEL — e
 * disponível já desconta o que outro cliente reservou.
 */

export interface ItemParaCatalogo {
  marca: string | null;
  produto: string;
  puffs: number | null;
  preco: number;
  sabor: string;
  estoque_disponivel: number;
  vendavel: boolean;
}

export interface CatalogoAgrupado {
  marca: string;
  produtos: Array<{
    produto: string;
    puffs: number | null;
    preco: number;
    sabores: string[];
    ultimas: string[];
  }>;
}

/** Quantas unidades fazem um sabor ser anunciado como "últimas". */
const POUCAS = 2;

export function agruparCatalogo(itens: ItemParaCatalogo[]): CatalogoAgrupado[] {
  const porProduto = new Map<string, {
    marca: string; produto: string; puffs: number | null; preco: number;
    sabores: string[]; ultimas: string[];
  }>();

  for (const i of itens) {
    // a trava: nada sem estoque disponível entra no catálogo
    if (!i.vendavel || i.estoque_disponivel <= 0) continue;

    const chave = `${i.marca ?? "Outros"}|${i.produto}`;
    const atual = porProduto.get(chave);

    if (atual) {
      atual.sabores.push(i.sabor);
      if (i.estoque_disponivel <= POUCAS) atual.ultimas.push(i.sabor);
      // o menor preço entre os sabores, para não prometer menos do que cobra
      atual.preco = Math.min(atual.preco, i.preco);
    } else {
      porProduto.set(chave, {
        marca: i.marca ?? "Outros", produto: i.produto, puffs: i.puffs,
        preco: i.preco, sabores: [i.sabor],
        ultimas: i.estoque_disponivel <= POUCAS ? [i.sabor] : [],
      });
    }
  }

  const porMarca = new Map<string, CatalogoAgrupado["produtos"]>();
  for (const p of porProduto.values()) {
    porMarca.set(p.marca, [...(porMarca.get(p.marca) ?? []), {
      produto: p.produto, puffs: p.puffs, preco: p.preco,
      sabores: [...p.sabores].sort((a, b) => a.localeCompare(b, "pt-BR")),
      ultimas: p.ultimas,
    }]);
  }

  return [...porMarca.entries()]
    .map(([marca, produtos]) => ({
      marca,
      // o de mais puffs primeiro: é o que a loja quer vender
      produtos: produtos.sort((a, b) => (b.puffs ?? 0) - (a.puffs ?? 0)),
    }))
    .sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR"));
}

const dinheiro = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",")}`;

/**
 * O texto que vai para o cliente.
 *
 * Sem asterisco de negrito nem emoji em excesso: a mensagem é longa, e
 * enfeite demais atrapalha quem está lendo no celular para escolher.
 */
export function catalogoEmTexto(
  itens: ItemParaCatalogo[],
  opcoes: { limiteSabores?: number } = {},
): string {
  const grupos = agruparCatalogo(itens);

  if (grupos.length === 0) {
    return "Estamos repondo o estoque agora. Me chama daqui a pouco que já te mostro tudo!";
  }

  const limite = opcoes.limiteSabores ?? 0;
  const partes: string[] = [];

  for (const g of grupos) {
    const linhas: string[] = [g.marca.toUpperCase()];

    for (const p of g.produtos) {
      const puffs = p.puffs ? ` · ${Math.round(p.puffs / 1000)}k puffs` : "";
      linhas.push(`${p.produto} — ${dinheiro(p.preco)}${puffs}`);

      const mostrar = limite > 0 && p.sabores.length > limite
        ? p.sabores.slice(0, limite)
        : p.sabores;
      const resto = p.sabores.length - mostrar.length;

      const comMarca = mostrar.map((s) =>
        p.ultimas.includes(s) ? `${s} (últimas)` : s);

      linhas.push(
        `  ${comMarca.join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}`,
      );
    }

    partes.push(linhas.join("\n"));
  }

  const total = grupos.reduce(
    (a, g) => a + g.produtos.reduce((x, p) => x + p.sabores.length, 0), 0,
  );

  return [
    partes.join("\n\n"),
    "",
    // "disponível" vira "disponíveis" no plural: trocar o l por is, não
    // emendar sufixo — já saiu "disponíveleis" numa versão
    total === 1
      ? "1 sabor disponível agora."
      : `${total} sabores disponíveis agora.`,
    "Me fala o modelo e o sabor que você quer 🖤",
  ].join("\n");
}
