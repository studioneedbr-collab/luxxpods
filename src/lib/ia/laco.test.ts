import { describe, expect, it, vi, type Mock } from "vitest";
import {
  responderComIa, type Conversador, type Dependencias, type Entrada,
  type Executor,
} from "./laco";
import type { Ambiente, Saida } from "../bot/executor";
import type { Resposta } from "./deepseek";

/**
 * O laço inteiro testado sem rede e sem banco — é para isso que `conversar`
 * e `executar` entram por parâmetro. Os corpos abaixo são os que a DeepSeek
 * devolve de verdade: conferi contra a API antes de escrever.
 */

const ambiente: Ambiente = {
  conversationId: "conv-1",
  customerId: "cli-1",
  estado: "PRODUCT_SELECTION",
  contexto: {},
};

const entrada = (texto: string): Entrada => ({
  textoDoCliente: texto,
  prompt: "você é atendente",
  contexto: "etapa: PRODUCT_SELECTION",
  ferramentas: [],
  ambiente,
});

function fala(texto: string, fim = "stop"): Resposta {
  return {
    texto,
    ferramentas: [],
    mensagemCrua: { role: "assistant", content: texto },
    motivoDoFim: fim,
    tokens: { entrada: 0, saida: 0, raciocinio: 0, cache: 0 },
  };
}

function chama(
  nome: string,
  argumentos: Record<string, unknown>,
  texto = "",
): Resposta {
  return {
    texto,
    ferramentas: [{ id: `call-${nome}`, nome, argumentos }],
    mensagemCrua: { role: "assistant", content: texto || null, tool_calls: [{}] },
    motivoDoFim: "tool_calls",
    tokens: { entrada: 0, saida: 0, raciocinio: 0, cache: 0 },
  };
}

/** Responde na ordem, uma por rodada. */
const roteiro = (...rs: Resposta[]) => {
  let i = 0;
  return vi.fn<Conversador>(async () => rs[i++] ?? fala("acabou o roteiro"));
};

/** O que o laço devolveu ao modelo como resultado da ferramenta. */
function resultadoDevolvido(conversar: Mock<Conversador>, rodada: number): string {
  const chamada = conversar.mock.calls[rodada];
  if (!chamada) throw new Error(`não houve a rodada ${rodada}`);
  const ultima = chamada[0].mensagens.at(-1);
  if (!ultima || ultima.role !== "tool") {
    throw new Error("a última mensagem não é resultado de ferramenta");
  }
  return ultima.content;
}

const executorQueDevolve = (dados: unknown): Dependencias["executar"] =>
  vi.fn(async (): Promise<Saida> => ({ ok: true, dados }));

describe("laço de ferramentas da IA", () => {
  it("consulta, recebe e responde com o que a consulta trouxe", async () => {
    const conversar = roteiro(
      chama("consultar_preco", { produto: "Ignite V150" }),
      fala("O Ignite V150 sai por R$ 85,00 🖤"),
    );
    const executar = executorQueDevolve({ encontrado: true, produto: "Ignite V150", preco: 85 });

    const r = await responderComIa(entrada("quanto é o ignite v150?"), { conversar, executar });

    expect(r.ok).toBe(true);
    expect(r.texto).toContain("85,00");
    expect(executar).toHaveBeenCalledWith(
      "consultar_preco", { produto: "Ignite V150" }, ambiente);
    expect(r.rodadas).toBe(2);
  });

  /**
   * O teste central. O cliente escreveu "confirma meu pedido", que NÃO é um
   * sim a um resumo que ele viu — é um pedido para fechar. A ferramenta não
   * pode rodar, e o modelo tem que receber o motivo escrito, senão insiste.
   */
  it("não fecha o pedido sem o sim do cliente, e diz ao modelo por quê", async () => {
    const conversar = roteiro(
      chama("confirmar_pedido", {}),
      fala("Deixa eu te mostrar o resumo antes"),
    );
    const executar = executorQueDevolve({});

    const r = await responderComIa(
      { ...entrada("confirma meu pedido"), clienteConfirmou: false },
      { conversar, executar });

    expect(executar).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);

    const devolvido = resultadoDevolvido(conversar, 1);
    expect(devolvido).toContain("ainda não disse sim");
    expect(devolvido).toContain("resumir_pedido");
  });

  it("fecha o pedido quando o cliente respondeu que sim, em ORDER_REVIEW", async () => {
    const emRevisao = { ...ambiente, estado: "ORDER_REVIEW" };
    const conversar = roteiro(
      chama("confirmar_pedido", {}),
      fala("Pedido LX-2026-0042 fechado! 🖤"),
    );
    const executar = executorQueDevolve({ numero: "LX-2026-0042" });

    const r = await responderComIa(
      { ...entrada("isso, pode confirmar"), ambiente: emRevisao, clienteConfirmou: true },
      { conversar, executar });

    expect(executar).toHaveBeenCalledWith("confirmar_pedido", {}, emRevisao);
    expect(r.ok).toBe(true);
  });

  /**
   * A segunda trava, que já existia e vale também para o modelo: a etapa.
   * Nem com o cliente dizendo sim dá para fechar um pedido que ainda não
   * passou pelo resumo — foi este teste que me mostrou que o gate pegava.
   */
  it("não fecha pedido fora de ORDER_REVIEW nem com o sim do cliente", async () => {
    const conversar = roteiro(
      chama("confirmar_pedido", {}),
      fala("Vamos escolher os produtos primeiro?"),
    );
    const executar = executorQueDevolve({});

    await responderComIa(
      { ...entrada("sim, confirma"), clienteConfirmou: true },
      { conversar, executar });

    expect(executar).not.toHaveBeenCalled();
    expect(resultadoDevolvido(conversar, 1)).toContain("não pode ser usada");
  });

  /**
   * O escopo quer o bot vendendo (§24 lista adicionar_carrinho entre as
   * ferramentas dele). O que protege o estoque é a função: ela falha quando
   * não há unidade. Aqui só se verifica que o laço deixa passar.
   */
  it("deixa o modelo pôr no carrinho, que é o trabalho dele", async () => {
    const conversar = roteiro(
      chama("adicionar_carrinho", { produto: "Ignite V150", sabor: "Mint", quantidade: 2 }),
      fala("Fechou! 2 Mint do V150 no carrinho 🖤"),
    );
    const executar = executorQueDevolve(
      { produto: "Ignite V150", sabor: "Mint", quantidade: 2, preco: 85 });

    const r = await responderComIa(entrada("quero 2 mint do v150"), { conversar, executar });

    expect(executar).toHaveBeenCalledWith(
      "adicionar_carrinho",
      { produto: "Ignite V150", sabor: "Mint", quantidade: 2 },
      ambiente);
    expect(r.ok).toBe(true);
  });

  /**
   * E o contrário: a função recusou por falta de estoque. O laço não pode
   * transformar isso em sucesso, e o conferidor não pode deixar o modelo
   * dizer que separou.
   */
  it("a recusa por falta de estoque chega ao modelo, e ele não pode mentir", async () => {
    const conversar = roteiro(
      chama("adicionar_carrinho", { produto: "Ignite V150", sabor: "Mint", quantidade: 9 }),
      fala("Separei as 9 unidades pra você"),
    );
    const executar = vi.fn<Executor>(async (): Promise<Saida> =>
      ({ ok: false, erro: "Só tenho 4 unidades desse sabor" }));

    const r = await responderComIa(entrada("quero 9 mint"), { conversar, executar });

    expect(resultadoDevolvido(conversar, 1)).toContain("Só tenho 4");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("reservado");
  });

  it("recusa validar maioridade: isso é do sistema", async () => {
    const conversar = roteiro(
      chama("validar_maioridade", { confirmou: true }),
      fala("Me fala sua idade"),
    );
    const executar = executorQueDevolve({});

    await responderComIa(entrada("sou de maior sim"), { conversar, executar });
    expect(executar).not.toHaveBeenCalled();
  });

  it("pedir gente volta como transferência, sem executar a ferramenta", async () => {
    const conversar = roteiro(
      chama("transferir_atendimento", { motivo: "cliente relatou defeito" }));
    const executar = executorQueDevolve({});

    const r = await responderComIa(entrada("meu pod veio vazando"), { conversar, executar });

    expect(r.ok).toBe(true);
    expect(r.transferir).toBe("cliente relatou defeito");
    // o motor tem o caminho de transferência pronto; executar aqui faria duas vezes
    expect(executar).not.toHaveBeenCalled();
  });

  /**
   * Medido contra a API: o modelo pode gastar max_tokens inteiro no
   * raciocínio e devolver conteúdo vazio. Sem esta recusa o cliente recebe
   * uma mensagem em branco.
   */
  it("recusa quando o modelo gastou a cota raciocinando", async () => {
    const conversar = roteiro(fala("", "length"));
    const r = await responderComIa(entrada("oi"), {
      conversar, executar: executorQueDevolve({}),
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("raciocinando");
  });

  it("recusa a resposta que inventou preço", async () => {
    const conversar = roteiro(
      chama("consultar_preco", { produto: "Ignite V150" }),
      fala("Pra você eu faço R$ 60,00"),
    );
    const r = await responderComIa(entrada("faz mais barato?"), {
      conversar,
      executar: executorQueDevolve({ preco: 85 }),
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("60,00");
    expect(r.texto).toBeUndefined();
  });

  it("não deixa o texto de enchimento virar mensagem ao cliente", async () => {
    const conversar = roteiro(
      chama("buscar_marcas", {}, "Vou verificar isso pra você."),
      fala("Tenho Ignite e Elfbar 🖤"),
    );
    const r = await responderComIa(entrada("o que vocês tem?"), {
      conversar,
      executar: executorQueDevolve({ marcas: ["Ignite", "Elfbar"] }),
    });

    expect(r.ok).toBe(true);
    expect(r.texto).not.toContain("Vou verificar");
  });

  it("devolve o erro de JSON torto em vez de executar às cegas", async () => {
    const conversar = vi.fn<Conversador>()
      .mockResolvedValueOnce({
        texto: "",
        ferramentas: [{ id: "c1", nome: "consultar_preco", argumentos: {}, argumentosCrus: "{produto:" }],
        mensagemCrua: { role: "assistant", content: null },
        motivoDoFim: "tool_calls",
        tokens: { entrada: 0, saida: 0, raciocinio: 0, cache: 0 },
      })
      .mockResolvedValueOnce(fala("Me fala qual modelo que eu confiro"));
    const executar = executorQueDevolve({});

    const r = await responderComIa(entrada("preço?"), { conversar, executar });

    expect(executar).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it("passa o erro da ferramenta ao modelo, sem derrubar a conversa", async () => {
    const conversar = roteiro(
      chama("buscar_sabores", { produto: "Ignite V999" }),
      fala("Esse modelo eu não tenho, mas tenho outros"),
    );
    const executar = vi.fn(async (): Promise<Saida> =>
      ({ ok: false, erro: "não achei esse produto" }));

    const r = await responderComIa(entrada("tem ignite v999?"), { conversar, executar });

    expect(r.ok).toBe(true);
    expect(resultadoDevolvido(conversar, 1)).toContain("não achei");
  });

  it("não quebra quando a ferramenta estoura", async () => {
    const conversar = roteiro(
      chama("buscar_marcas", {}),
      fala("Deixa eu te ajudar de outro jeito"),
    );
    const executar = vi.fn(async (): Promise<Saida> => { throw new Error("banco caiu"); });

    const r = await responderComIa(entrada("oi"), { conversar, executar });
    expect(r.ok).toBe(true);
  });

  it("a falha da DeepSeek não responde nada: o motor assume", async () => {
    const conversar = vi.fn<Conversador>(async () => { throw new Error("502"); });
    const r = await responderComIa(entrada("oi"), {
      conversar, executar: executorQueDevolve({}),
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("502");
  });

  it("desiste depois do limite de rodadas em vez de girar pedindo ferramenta", async () => {
    const conversar = vi.fn<Conversador>(async () => chama("buscar_marcas", {}));
    const r = await responderComIa(entrada("oi"), {
      conversar, executar: executorQueDevolve({ marcas: [] }),
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("rodadas");
    // o limite subiu de 3 para 5 quando a política abriu: ele encadeia
    // buscar_sabores → adicionar_carrinho → consultar_carrinho
    expect(conversar).toHaveBeenCalledTimes(r.rodadas);
    expect(r.rodadas).toBeGreaterThanOrEqual(5);
  });

  it("desiste quando o prazo estoura, sem deixar o cliente esperando", async () => {
    let t = 0;
    const r = await responderComIa(entrada("oi"), {
      conversar: roteiro(fala("oi")),
      executar: executorQueDevolve({}),
      // segunda leitura do relógio já passou do prazo
      agora: () => (t += 40_000),
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("prazo");
  });

  it("recolhe o contexto que as ferramentas devolveram, não o que o modelo disse", async () => {
    const conversar = roteiro(
      chama("buscar_sabores", { produto: "Ignite V150" }),
      fala("Tem Watermelon e Mint"),
    );
    const executar = vi.fn(async (): Promise<Saida> => ({
      ok: true,
      dados: { produto: "Ignite V150", sabores: [{ nome: "Watermelon" }] },
      contexto: { modelo_interesse: "Ignite V150" },
    }));

    const r = await responderComIa(entrada("sabores do v150"), { conversar, executar });

    expect(r.ok).toBe(true);
    expect(r.mudancasDeContexto).toEqual({ modelo_interesse: "Ignite V150" });
  });
});
