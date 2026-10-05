import { describe, expect, it } from "vitest";
import { montarContexto, montarPrompt, type DadosDaLoja } from "./prompt";

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
    expect(p).toContain("Você não fecha pedido");
    expect(p).toContain("menor de 18");
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
