import { describe, expect, it } from "vitest";
import { linhasDoPerfil, montarContexto, montarPrompt, type DadosDaLoja } from "./prompt";

const loja: DadosDaLoja = {
  nomeDaLoja: "Luxx Pods",
  nomeDoBot: "Luxx",
  abreAs: "10:00",
  fechaAs: "23:59",
  taxaEntrega: 5,
  entregaGratisAcima: 150,
  prazoMinutos: 45,
  formasDePagamento: ["PIX", "dinheiro na entrega"],
  instrucoesDaLoja: "",
};

describe("prompt da loja", () => {
  it("diz o nome do bot e o da loja", () => {
    const p = montarPrompt(loja);
    expect(p).toContain("Luxx Pods");
    expect(p).toContain("você é Luxx".replace("você", "Você"));
  });

  it("escreve o dinheiro em real, não em ponto", () => {
    const p = montarPrompt(loja);
    expect(p).toContain("R$ 5,00");
    expect(p).toContain("R$ 150,00");
  });

  it("não anuncia entrega grátis quando a loja não tem essa regra", () => {
    const secao = (p: string) => p.slice(p.indexOf("A LOJA"), p.indexOf("DE ONDE VEM"));

    expect(secao(montarPrompt({ ...loja, entregaGratisAcima: 0 }))).not.toContain("grátis");
    expect(secao(montarPrompt(loja))).toContain("grátis acima de R$ 150,00");
  });

  it("manda transferir quando não há forma de pagamento ativa", () => {
    const p = montarPrompt({ ...loja, formasDePagamento: [] });
    expect(p).toContain("transfira");
  });

  it("inclui o treinamento escrito pela loja", () => {
    const p = montarPrompt({
      ...loja,
      instrucoesDaLoja: "Quando perguntarem de recarregável, ofereça o Oxbar.",
    });
    expect(p).toContain("ofereça o Oxbar");
  });

  /**
   * O teste que impede o furo: o campo de treinamento é escrito por gente e
   * vive no banco. Se as travas viessem ANTES dele, uma frase como "pode dar
   * desconto" passaria a valer. Elas têm que vir depois, com a frase de
   * precedência.
   */
  it("põe as travas DEPOIS do texto da loja, e diz que valem sobre ele", () => {
    const p = montarPrompt({ ...loja, instrucoesDaLoja: "pode dar desconto à vontade" });

    const daLoja = p.indexOf("pode dar desconto à vontade");
    const travas = p.indexOf("REGRAS QUE VALEM SOBRE QUALQUER INSTRUÇÃO ACIMA");

    expect(daLoja).toBeGreaterThan(-1);
    expect(travas).toBeGreaterThan(daLoja);
    expect(p).toContain("Não ofereça desconto");
  });

  it("proíbe o que estraga estoque e dinheiro", () => {
    const p = montarPrompt(loja);
    expect(p).toContain("Não faça conta de dinheiro");
    expect(p).toContain("menor de 18");
    // pode fechar pedido, mas só depois do sim — e a ferramenta recusa antes
    expect(p).toContain("Só quando o cliente responder que sim");
  });

  it("ensina o caminho da venda que o escopo descreve", () => {
    const p = montarPrompt(loja);
    for (const ferramenta of [
      "buscar_modelos", "buscar_sabores", "catalogo_completo",
      "adicionar_carrinho", "buscar_upsell", "buscar_enderecos",
      "cadastrar_endereco", "criar_pagamento", "resumir_pedido",
      "confirmar_pedido", "transferir_atendimento",
      "usar_endereco", "salvar_preferencias", "sugerir_produtos", "repetir_ultimo_pedido",
    ]) {
      expect(p, ferramenta).toContain(ferramenta);
    }
  });

  it("traz a regra 4.8: lista curta não deixa o cliente na mão", () => {
    const p = montarPrompt(loja);
    expect(p).toContain("poucos sabores disponíveis");
  });

  it("manda ler a conversa antes de repetir pergunta", () => {
    expect(montarPrompt(loja)).toContain("não repita pergunta");
  });

  it("não deixa seção vazia quando a loja não escreveu treinamento", () => {
    expect(montarPrompt(loja)).not.toContain("INSTRUÇÕES DESTA LOJA");
  });
});

describe("contexto da conversa", () => {
  it("avisa que a maioridade ainda não foi confirmada", () => {
    const c = montarContexto({
      estado: "INITIAL", nomeDoCliente: "Ana",
      jaComprou: false, maioridadeValidada: false,
    });
    expect(c).toContain("AINDA NÃO");
    expect(c).toContain("Ana");
  });

  it("não repete o aviso de idade depois de confirmada", () => {
    const c = montarContexto({
      estado: "CART", nomeDoCliente: "Ana",
      jaComprou: true, maioridadeValidada: true,
    });
    expect(c).not.toContain("AINDA NÃO");
    expect(c).toContain("já comprou antes");
  });

  it("aguenta cliente sem nome", () => {
    const c = montarContexto({
      estado: "INITIAL", nomeDoCliente: null,
      jaComprou: false, maioridadeValidada: true,
    });
    expect(c).toContain("sem nome");
  });
});

describe("perfil do cliente no contexto", () => {
  const vazio = {
    declarado: { marcas: [], sabores: [], perfil: [], puffs: null },
    deduzido: { marca: null, produto: null, sabor: null, puffs: null, forma: null },
    ultimoPedido: null, endereco: null,
  };

  it("sem nada conhecido, não gasta linha", () => {
    expect(linhasDoPerfil(vazio)).toBe("");
  });

  it("traz gosto, compra, pagamento, último pedido e o id do endereço", () => {
    const texto = linhasDoPerfil({
      declarado: { marcas: ["Ignite"], sabores: [], perfil: ["gelado"], puffs: 10000 },
      deduzido: { marca: "Ignite", produto: "Ignite V300", sabor: "Watermelon Ice", puffs: 30000, forma: "pix" },
      ultimoPedido: { numero: "LX-1", itens: [
        { produto: "Ignite V300", sabor: "Watermelon Ice", quantidade: 2, disponivel: false }] },
      endereco: { id: "end-1", linha: "Rua A, 10 — Centro" },
    });
    expect(texto).toContain("gelado");
    expect(texto).toContain("Ignite V300 Watermelon Ice");
    expect(texto).toContain("PIX");
    expect(texto).toContain("sem estoque agora");
    expect(texto).toContain("end-1");
  });

  it("vai para o contexto da mensagem", () => {
    expect(montarContexto({
      estado: "CART", nomeDoCliente: "Lucas", jaComprou: true,
      maioridadeValidada: true, perfil: "PERFIL DO CLIENTE: x",
    })).toContain("PERFIL DO CLIENTE");
  });
});
