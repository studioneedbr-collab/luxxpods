import { describe, expect, it } from "vitest";
import { converter } from "./historico-core";

const linha = (sender_type: string, conteudo: string | null, tipo = "texto") =>
  ({ sender_type, conteudo, tipo });

describe("histórico da conversa", () => {
  it("vira turno de conversa, cliente como user e loja como assistant", () => {
    const t = converter([
      linha("cliente", "oi, quais marcas vocês tem?"),
      linha("bot", "Tenho Ignite e Elfbar 🖤"),
      linha("cliente", "e o de 20000 puffs?"),
    ], "e o de 20000 puffs?");

    expect(t).toEqual([
      { role: "user", content: "oi, quais marcas vocês tem?" },
      { role: "assistant", content: "Tenho Ignite e Elfbar 🖤" },
    ]);
  });

  /**
   * Sem isto o modelo lê a pergunta da vez duas vezes — uma no histórico e
   * uma na instrução final — e responde como se o cliente tivesse repetido.
   */
  it("não repete a mensagem que está sendo respondida agora", () => {
    const t = converter([
      linha("cliente", "quanto é o v150?"),
    ], "quanto é o v150?");
    expect(t).toEqual([]);
  });

  it("tira a repetição mesmo com espaço sobrando", () => {
    const t = converter([linha("cliente", "quero 2")], "  quero 2  ");
    expect(t).toEqual([]);
  });

  /**
   * Do lado do cliente é a mesma loja falando. Separar o atendente do bot
   * faria o modelo contradizer o que uma pessoa acabou de prometer.
   */
  it("conta o atendente humano como a mesma voz da loja", () => {
    const t = converter([
      linha("cliente", "tem como entregar hoje?"),
      linha("atendente", "Tem sim, até 23h"),
    ], "obrigado");

    expect(t[1]).toEqual({ role: "assistant", content: "Tem sim, até 23h" });
  });

  /**
   * São avisos internos — "conversa importada do WhatsApp", "bot pausado" —
   * que o cliente nunca viu. No histórico o modelo os leria como fala.
   */
  it("descarta aviso de sistema", () => {
    const t = converter([
      linha("sistema", "Conversa importada do WhatsApp"),
      linha("cliente", "oi"),
    ], "tudo bem?");

    expect(t).toEqual([{ role: "user", content: "oi" }]);
  });

  it("descarta mensagem sem texto, como mídia sem legenda", () => {
    const t = converter([
      linha("cliente", null, "imagem"),
      linha("cliente", "   "),
      linha("cliente", "esse aqui"),
    ], "qual o preço?");

    expect(t).toEqual([{ role: "user", content: "esse aqui" }]);
  });

  it("corta texto gigante para o catálogo colado não virar ruído", () => {
    const enorme = "x".repeat(2000);
    const t = converter([linha("bot", enorme)], "oi");
    const conteudo = (t[0] as { content: string }).content;

    expect(conteudo.length).toBeLessThan(700);
    expect(conteudo.endsWith("…")).toBe(true);
  });

  it("aguenta conversa vazia", () => {
    expect(converter([], "oi")).toEqual([]);
  });
});
