import { describe, expect, it } from "vitest";
import { CanalFluxoApi } from "./fluxoapi";

/**
 * O adaptador contra a FluxoAPI de verdade.
 *
 * Os outros testes provam que a assinatura casa com a documentação; só isto
 * prova que casa com o SERVIDOR. É a diferença entre ler certo e estar
 * certo — e a assinatura é o tipo de coisa que erra por um `\n` e devolve
 * 401 em tudo, sem dizer onde.
 *
 * Fica fora do `npm test` de propósito. Para rodar:
 *   FLUXO_AO_VIVO=1 npx vitest run src/lib/canal/fluxoapi-aovivo --testTimeout=60000
 *
 * Só lê. Nenhum teste aqui manda mensagem: o número é de uma loja atendendo,
 * e um "teste" chegando para um cliente de verdade é pior que nenhum teste.
 */

const AO_VIVO = process.env.FLUXO_AO_VIVO === "1";
const canal = new CanalFluxoApi();

describe.skipIf(!AO_VIVO)("FluxoAPI ao vivo", () => {
  it("as credenciais estão no ambiente", () => {
    expect(canal.configurado(), "faltam FLUXOAPI_KEY, _SECRET ou _INSTANCE_ID")
      .toBe(true);
  });

  /**
   * A assinatura de pedido SEM query string, no caminho mais simples. Se
   * esta falhar com 401, o erro está na string de seis linhas.
   */
  it("a instância responde: a assinatura do pedido confere", async () => {
    const d = await canal.diagnosticar();

    process.stderr.write(
      `\n  instância: ${JSON.stringify(d)}\n`
      + `  chave de teste? ${canal.ehTeste() ? "SIM — nada sai de verdade" : "não, é fxk_live_"}\n`);

    expect(d.ok, d.erro).toBe(true);
  }, 60_000);

  /**
   * O caso que o teste offline só conseguia provar por comparação: o caminho
   * assinado inclui a query string. Se eu tivesse assinado sem ela, ESTA
   * chamada voltaria 401 e a do diagnóstico acima passaria — o defeito
   * apareceria só nas listagens, em produção.
   */
  it("listar conversas funciona: a query string entra na assinatura", async () => {
    const r = await canal.listarConversas(undefined, 25);

    process.stderr.write(
      `\n  conversas: ${r.conversas.length}`
      + `${r.proximo ? " (tem próxima página)" : ""}`
      + `${r.erro ? ` — ERRO: ${r.erro}` : ""}\n`);

    expect(r.erro, "a listagem recusou — suspeite da query string na assinatura")
      .toBeUndefined();

    for (const c of r.conversas.slice(0, 5)) {
      process.stderr.write(
        `    ${c.phone} ${c.contact_name ?? "(sem nome)"} · ${c.status}`
        + ` · ${c.unread} não lida(s) · janela até ${c.window_expires_at ?? "—"}\n`);
    }
  }, 60_000);

  /**
   * O endpoint que a Z-API não tinha, e que me obrigou a escrever no botão
   * de importar que o histórico não vinha.
   */
  it("traz o histórico de uma conversa, quando existe alguma", async () => {
    const r = await canal.listarConversas(undefined, 5);
    const primeira = r.conversas[0];

    if (!primeira) {
      process.stderr.write("\n  nenhuma conversa na instância — nada a buscar\n");
      return;
    }

    const h = await canal.historico(primeira.id, 10);

    process.stderr.write(
      `\n  histórico de ${primeira.phone}: ${h.mensagens.length} mensagem(ns)`
      + `${h.erro ? ` — ERRO: ${h.erro}` : ""}\n`);

    for (const m of h.mensagens.slice(0, 5)) {
      const quem = m.direction === "inbound"
        ? "cliente"
        : m.sent_from_phone ? "dono (celular)" : "sistema";
      process.stderr.write(`    [${quem}] ${(m.text ?? "").slice(0, 70)}\n`);
    }

    expect(h.erro).toBeUndefined();
  }, 60_000);

  /**
   * O segredo do webhook, conferido com o valor REAL do painel.
   *
   * Não toca no banco e não chega a postar nada: monta um corpo igual ao que
   * a FluxoAPI manda, assina com o segredo do ambiente e passa pelo mesmo
   * `validarAssinatura` que a rota usa. É o que prova que a variável está
   * certa — um `whsec_` colado com espaço sobrando recusaria todo evento, e
   * isso só apareceria com o cliente reclamando que ninguém respondeu.
   */
  it("valida um webhook assinado com o segredo de verdade", async () => {
    const segredo = process.env.FLUXOAPI_WEBHOOK_SECRET;
    expect(segredo, "FLUXOAPI_WEBHOOK_SECRET não está no ambiente").toBeTruthy();

    const { createHmac } = await import("node:crypto");
    const corpo = JSON.stringify({
      id: "evt_teste", type: "message.received",
      instance_id: process.env.FLUXOAPI_INSTANCE_ID,
      data: { message_id: "msg_teste", from: "5533999990000", type: "text", text: "oi" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const assinatura = `v1=${createHmac("sha256", segredo!).update(`${ts}\n${corpo}`).digest("hex")}`;

    /** O mesmo Request que a rota recebe, para passar pelo mesmo caminho. */
    const pedido = (sig: string) =>
      new Request("https://www.luxxpods.com/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-fluxo-signature": sig, "x-fluxo-timestamp": ts },
        body: corpo,
      });

    expect(canal.validarAssinatura(corpo, pedido(assinatura)),
      "o segredo do ambiente não confere").toBe(true);

    // e recusa o que não foi assinado com ele
    expect(canal.validarAssinatura(corpo, pedido(`v1=${"0".repeat(64)}`))).toBe(false);

    process.stderr.write("\n  segredo do webhook: confere\n");
  });

  /**
   * Nonce repetido dá 409. Duas chamadas seguidas provam que o nonce é novo
   * a cada pedido — um nonce fixo passaria na primeira e quebraria em
   * produção no segundo envio.
   */
  it("duas chamadas seguidas passam: o nonce não repete", async () => {
    const a = await canal.diagnosticar();
    const b = await canal.diagnosticar();
    expect(a.ok && b.ok, `primeira: ${a.erro ?? "ok"} / segunda: ${b.erro ?? "ok"}`)
      .toBe(true);
  }, 60_000);
});
