import { describe, expect, it, vi, type Mock } from "vitest";
import {
  responderComIa, type Conversador, type Dependencias, type Entrada,
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
   * O teste central. Mandar só as ferramentas permitidas no pedido não
   * basta — o modelo pode chamar qualquer nome. A ferramenta NÃO pode
   * executar, e o modelo tem que receber o motivo escrito.
   */
  it("não executa confirmar_pedido, e diz ao modelo por quê", async () => {
    const conversar = roteiro(
      chama("confirmar_pedido", {}),
      fala("Vou chamar alguém pra fechar isso com você"),
    );
    const executar = executorQueDevolve({});

    const r = await responderComIa(entrada("confirma meu pedido"), { conversar, executar });

    expect(executar).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);

    const devolvido = resultadoDevolvido(conversar, 1);
    expect(devolvido).toContain("não tem permissão");
    expect(devolvido).toContain("irreversível");
  });

  it("não executa adicionar_carrinho: reserva de estoque é da máquina", async () => {
    const conversar = roteiro(
      chama("adicionar_carrinho", { produto: "Ignite", sabor: "Uva", quantidade: 1 }),
      fala("Me confirma o sabor que eu separo"),
    );
    const executar = executorQueDevolve({});

    await responderComIa(entrada("põe um de uva"), { conversar, executar });
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

  it("desiste depois de três rodadas em vez de girar pedindo ferramenta", async () => {
    const conversar = vi.fn<Conversador>(async () => chama("buscar_marcas", {}));
    const r = await responderComIa(entrada("oi"), {
      conversar, executar: executorQueDevolve({ marcas: [] }),
    });

    expect(r.ok).toBe(false);
    expect(r.rodadas).toBe(3);
    expect(conversar).toHaveBeenCalledTimes(3);
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
