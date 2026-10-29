import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinarPedido, conferirWebhook, gerarNonce } from "./fluxoapi-assinatura";

const SEGREDO = "fxs_segredo_de_teste";
const WHSEC = "whsec_segredo_do_webhook";

describe("assinatura do pedido", () => {
  /**
   * A string assinada é calculada aqui de novo, à mão, a partir da
   * documentação. Se alguém trocar a ordem das seis linhas, este teste cai —
   * e é o único jeito de pegar isso sem gastar uma chamada que volta 401.
   */
  it("monta as seis linhas na ordem documentada", () => {
    const corpo = '{"to":"+5533999990000"}';
    const h = assinarPedido({
      chave: "fxk_live_abc", segredo: SEGREDO,
      metodo: "post", caminho: "/v1/instances/inst_1/messages",
      corpo, timestamp: 1_700_000_000, nonce: "nonce-fixo",
    });

    const esperado = createHmac("sha256", SEGREDO).update([
      "v1",
      "1700000000",
      "nonce-fixo",
      "POST",
      "/v1/instances/inst_1/messages",
      createHash("sha256").update(corpo).digest("hex"),
    ].join("\n")).digest("hex");

    expect(h["X-Fluxo-Signature"]).toBe(`v1=${esperado}`);
    expect(h["X-Fluxo-Key"]).toBe("fxk_live_abc");
    expect(h["X-Fluxo-Timestamp"]).toBe("1700000000");
    expect(h["X-Fluxo-Nonce"]).toBe("nonce-fixo");
  });

  it("escreve o método em maiúscula, como a string pede", () => {
    const a = assinarPedido({
      chave: "k", segredo: SEGREDO, metodo: "get",
      caminho: "/v1/conversations", timestamp: 1, nonce: "n",
    });
    const b = assinarPedido({
      chave: "k", segredo: SEGREDO, metodo: "GET",
      caminho: "/v1/conversations", timestamp: 1, nonce: "n",
    });
    expect(a["X-Fluxo-Signature"]).toBe(b["X-Fluxo-Signature"]);
  });

  /**
   * A documentação é explícita: o caminho assinado inclui a query string, e
   * o exemplo dela é `/v1/messages?limit=10`. Assinar sem a query faria
   * TODA chamada paginada voltar 401 — e só as paginadas, que é o tipo de
   * defeito que aparece em produção e não no primeiro teste.
   */
  it("a query string muda a assinatura", () => {
    const sem = assinarPedido({
      chave: "k", segredo: SEGREDO, metodo: "GET",
      caminho: "/v1/conversations", timestamp: 1, nonce: "n",
    });
    const com = assinarPedido({
      chave: "k", segredo: SEGREDO, metodo: "GET",
      caminho: "/v1/conversations?limit=10", timestamp: 1, nonce: "n",
    });
    expect(sem["X-Fluxo-Signature"]).not.toBe(com["X-Fluxo-Signature"]);
  });

  it("corpo vazio assina o sha256 da string vazia, não omite a linha", () => {
    const h = assinarPedido({
      chave: "k", segredo: SEGREDO, metodo: "GET",
      caminho: "/v1/health", timestamp: 1, nonce: "n",
    });
    const esperado = createHmac("sha256", SEGREDO).update([
      "v1", "1", "n", "GET", "/v1/health",
      createHash("sha256").update("").digest("hex"),
    ].join("\n")).digest("hex");

    expect(h["X-Fluxo-Signature"]).toBe(`v1=${esperado}`);
  });

  it("o nonce cabe na faixa que a API aceita e não repete", () => {
    const a = gerarNonce();
    const b = gerarNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(128);
  });
});

/* ------------------------------------------------------------- WEBHOOK -- */

const assinarWebhook = (corpo: string, ts: string, segredo = WHSEC) =>
  `v1=${createHmac("sha256", segredo).update(`${ts}\n${corpo}`).digest("hex")}`;

describe("conferência do webhook", () => {
  const corpo = '{"id":"evt_1","type":"message.received"}';
  const agora = 1_700_000_000;
  const ts = String(agora);

  it("aceita a assinatura certa", () => {
    const v = conferirWebhook({
      segredo: WHSEC, corpoCru: corpo,
      assinatura: assinarWebhook(corpo, ts), timestamp: ts, agora,
    });
    expect(v.valida).toBe(true);
  });

  /**
   * A string do webhook é `timestamp\ncorpo` — sem nonce, sem método, sem
   * caminho. Usar a do pedido aqui é o erro fácil, e dá "assinatura não
   * confere" em todo evento.
   */
  it("não confunde com a string assinada do pedido", () => {
    const daApi = assinarPedido({
      chave: "k", segredo: WHSEC, metodo: "POST",
      caminho: "/webhook", corpo, timestamp: agora, nonce: "n",
    })["X-Fluxo-Signature"];

    const v = conferirWebhook({
      segredo: WHSEC, corpoCru: corpo, assinatura: daApi, timestamp: ts, agora,
    });
    expect(v.valida).toBe(false);
  });

  it("recusa corpo alterado", () => {
    const v = conferirWebhook({
      segredo: WHSEC,
      corpoCru: corpo.replace("evt_1", "evt_2"),
      assinatura: assinarWebhook(corpo, ts), timestamp: ts, agora,
    });
    expect(v.valida).toBe(false);
  });

  it("recusa segredo errado", () => {
    const v = conferirWebhook({
      segredo: "whsec_outro", corpoCru: corpo,
      assinatura: assinarWebhook(corpo, ts), timestamp: ts, agora,
    });
    expect(v.valida).toBe(false);
  });

  /**
   * Durante a rotação vêm DUAS assinaturas separadas por vírgula, e basta
   * uma bater. Sem tratar isso, trocar o segredo derruba o canal — que é
   * justamente o que a rotação com janela de 24h existe para evitar.
   */
  it("aceita quando só a segunda assinatura bate, na rotação", () => {
    const antiga = `v1=${"0".repeat(64)}`;
    const nova = assinarWebhook(corpo, ts);

    const v = conferirWebhook({
      segredo: WHSEC, corpoCru: corpo,
      assinatura: `${antiga}, ${nova}`, timestamp: ts, agora,
    });
    expect(v.valida).toBe(true);
  });

  it("recusa evento velho, para corpo capturado não valer para sempre", () => {
    const v = conferirWebhook({
      segredo: WHSEC, corpoCru: corpo,
      assinatura: assinarWebhook(corpo, ts), timestamp: ts,
      agora: agora + 3600,
    });
    expect(v.valida).toBe(false);
    if (!v.valida) expect(v.motivo).toContain("idade");
  });

  it("aceita relógio adiantado dentro da tolerância", () => {
    const v = conferirWebhook({
      segredo: WHSEC, corpoCru: corpo,
      assinatura: assinarWebhook(corpo, ts), timestamp: ts,
      agora: agora - 120,
    });
    expect(v.valida).toBe(true);
  });

  it("recusa sem assinatura e sem timestamp", () => {
    expect(conferirWebhook({
      segredo: WHSEC, corpoCru: corpo, assinatura: null, timestamp: ts,
    }).valida).toBe(false);

    expect(conferirWebhook({
      segredo: WHSEC, corpoCru: corpo,
      assinatura: assinarWebhook(corpo, ts), timestamp: null,
    }).valida).toBe(false);
  });

  it("aceita a assinatura sem o prefixo v1=", () => {
    const hex = assinarWebhook(corpo, ts).slice(3);
    const v = conferirWebhook({
      segredo: WHSEC, corpoCru: corpo, assinatura: hex, timestamp: ts, agora,
    });
    expect(v.valida).toBe(true);
  });
});
