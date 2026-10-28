import { describe, it, expect } from "vitest";
import { CanalZApi } from "./zapi";

const canal = new CanalZApi();

/** o que a Z-API manda em comum, em todo tipo */
const base = {
  isGroup: false, isNewsletter: false, fromMe: false,
  phone: "5533999990000", senderName: "Lucas", chatName: "Lucas",
  momment: 1_760_000_000_000, messageId: "3EB0", type: "ReceivedCallback",
};

const ler = (extra: Record<string, unknown>) =>
  canal.interpretarWebhook({ ...base, ...extra })?.mensagens[0];

describe("o que chega do WhatsApp pela Z-API", () => {
  it("texto", () => {
    const m = ler({ text: { message: "tem watermelon?" } })!;
    expect(m.tipo).toBe("texto");
    expect(m.texto).toBe("tem watermelon?");
    expect(m.de).toBe("5533999990000");
    expect(m.nome).toBe("Lucas");
  });

  it("áudio de voz — o caso mais comum e o que estava quebrado", () => {
    // antes isto virava "desconhecido" SEM TEXTO: o atendente via uma
    // mensagem vazia na conversa e achava que era bug do sistema
    const m = ler({ audio: { audioUrl: "https://x/a.ogg", seconds: 12, ptt: true } })!;
    expect(m.tipo).toBe("audio");
    expect(m.texto).toBe("[áudio de voz 12s]");
    expect(m.arquivo).toBe("https://x/a.ogg");
  });

  it("imagem com legenda usa a legenda", () => {
    const m = ler({ image: { imageUrl: "https://x/i.jpg", caption: "é esse?" } })!;
    expect(m.texto).toBe("é esse?");
    expect(m.arquivo).toBe("https://x/i.jpg");
  });

  it("imagem sem legenda avisa que veio imagem", () => {
    expect(ler({ image: { imageUrl: "https://x/i.jpg" } })!.texto).toBe("[imagem]");
  });

  it("vídeo", () => {
    const m = ler({ video: { videoUrl: "https://x/v.mp4", seconds: 8 } })!;
    expect(m.tipo).toBe("video");
    expect(m.texto).toBe("[vídeo 8s]");
  });

  it("documento diz o nome do arquivo", () => {
    const m = ler({ document: { documentUrl: "https://x/d.pdf", fileName: "comprovante.pdf" } })!;
    expect(m.tipo).toBe("documento");
    expect(m.texto).toBe("[documento: comprovante.pdf]");
  });

  it("figurinha não vira mensagem vazia", () => {
    expect(ler({ sticker: { stickerUrl: "https://x/s.webp" } })!.texto).toBe("[figurinha]");
  });

  it("localização mostra o endereço, que é o que serve para entregar", () => {
    const m = ler({ location: {
      latitude: -17.8, longitude: -41.5,
      address: "Rua Sete de Setembro, 212 — Centro", url: "https://maps/x",
    } })!;
    expect(m.tipo).toBe("localizacao");
    expect(m.texto).toContain("Rua Sete de Setembro");
  });

  it("localização sem endereço cai nas coordenadas", () => {
    expect(ler({ location: { latitude: -17.8, longitude: -41.5 } })!.texto)
      .toContain("-17.8");
  });

  it("contato compartilhado", () => {
    const m = ler({ contact: { displayName: "Maria", phones: ["5533988887777"] } })!;
    expect(m.texto).toBe("[contato] Maria — 5533988887777");
  });

  it("resposta de botão guarda o id, que é o que o bot usa", () => {
    const m = ler({ buttonsResponseMessage: { buttonId: "sim_18", message: "Sim" } })!;
    expect(m.tipo).toBe("botoes");
    expect(m.botaoId).toBe("sim_18");
  });

  it("resposta de lista também", () => {
    const m = ler({ listResponseMessage: { selectedRowId: "ignite-v300", message: "Ignite V300" } })!;
    expect(m.botaoId).toBe("ignite-v300");
  });
});

describe("o que NÃO deve virar conversa", () => {
  it("o eco do que o próprio sistema mandou pela API", () => {
    // já está gravado na conversa; gravar de novo duplicaria
    expect(canal.interpretarWebhook({
      ...base, fromMe: true, fromApi: true, text: { message: "oi" },
    })).toBeNull();
  });

  it("grupo — o número da loja entra em grupo o tempo todo", () => {
    // sem isto cada mensagem de grupo criava um "cliente" com o id do grupo
    // no lugar do telefone, e o kanban enchia de lixo
    expect(canal.interpretarWebhook({ ...base, isGroup: true, text: { message: "oi" } }))
      .toBeNull();
  });

  it("canal de transmissão e status", () => {
    expect(canal.interpretarWebhook({ ...base, isNewsletter: true, text: { message: "x" } }))
      .toBeNull();
    expect(canal.interpretarWebhook({ ...base, isStatusReply: true, text: { message: "x" } }))
      .toBeNull();
    expect(canal.interpretarWebhook({ ...base, broadcast: true, text: { message: "x" } }))
      .toBeNull();
  });

  it("corpo sem conteúdo nenhum", () => {
    expect(canal.interpretarWebhook({ ...base })).toBeNull();
    expect(canal.interpretarWebhook(null)).toBeNull();
  });
});

describe("o que a loja escreve direto no celular", () => {
  it("entra na conversa do cliente, marcado como nosso", () => {
    // antes era descartado e a conversa no painel ficava só com um lado
    const m = canal.interpretarWebhook({
      ...base, fromMe: true, senderName: "Luxx Pods", chatName: "Lucas",
      text: { message: "já te mando" },
    })!.mensagens[0];
    expect(m.enviadaPorMim).toBe(true);
    expect(m.de).toBe("5533999990000");
    expect(m.nome).toBe("Lucas");
    expect(m.texto).toBe("já te mando");
  });

  it("mensagem do cliente não vem marcada", () => {
    expect(ler({ text: { message: "oi" } })!.enviadaPorMim).toBeUndefined();
  });
});

describe("status de entrega", () => {
  // o corpo real da Z-API: os ids vêm numa lista, sem `messageId`
  const status = (s: string, extra: Record<string, unknown> = {}) => canal.interpretarWebhook({
    instanceId: "I", type: "MessageStatusCallback", status: s,
    ids: ["ABC"], momment: 1_760_000_000_000, phone: "5533999990000", ...extra,
  });

  it("lida, entregue, enviada e erro", () => {
    const st = (s: string) => status(s)?.statusAtualizados[0]?.status;
    expect(st("READ")).toBe("lida");
    expect(st("PLAYED")).toBe("lida");
    expect(st("RECEIVED")).toBe("entregue");
    expect(st("DELIVERED")).toBe("entregue");
    expect(st("SENT")).toBe("enviada");
    expect(st("ERROR")).toBe("erro");
  });

  it("lê o id da lista — era o que deixava todo tique parado", () => {
    expect(status("READ")!.statusAtualizados[0].idExterno).toBe("ABC");
    expect(status("READ", { ids: ["A", "B"] })!.statusAtualizados.map((x) => x.idExterno))
      .toEqual(["A", "B"]);
  });

  it("a loja lendo a mensagem do cliente não muda nada", () => {
    expect(status("READ_BY_ME")).toBeNull();
  });

  it("status de mensagem nossa não é descartado como eco", () => {
    expect(status("READ", { fromMe: true })?.statusAtualizados).toHaveLength(1);
  });

  it("horário em segundos não vira 1970", () => {
    const em = status("READ", { momment: 1_760_000_000 })!.statusAtualizados[0].em;
    expect(em.getFullYear()).toBeGreaterThan(2020);
  });

  it("mensagem com conteúdo não é confundida com status", () => {
    // o corpo de "ao receber" também traz `status`; sem a distinção uma
    // mensagem de texto gerava uma atualização de status fantasma
    const e = canal.interpretarWebhook({
      ...base, status: "RECEIVED", text: { message: "oi" },
    })!;
    expect(e.mensagens).toHaveLength(1);
    expect(e.statusAtualizados).toHaveLength(0);
  });
});
