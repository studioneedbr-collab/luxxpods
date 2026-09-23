import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Este teste lê o porteiro como TEXTO e falha se alguém abrir uma rota nova
 * sem justificar. Não é sobre comportamento: é sobre não deixar passar uma
 * exceção de segurança no meio de um commit grande.
 */
const fonte = readFileSync(resolve(__dirname, "./proxy.ts"), "utf-8");

describe("porteiro de rotas", () => {
  it("usa lista de permissão, não de negação", () => {
    expect(fonte).toContain("API_ABERTA");
    expect(fonte).toContain("PAGINA_ABERTA");
  });

  it("as únicas APIs abertas são auth, webhooks e cron", () => {
    const linha = fonte.match(/const API_ABERTA = (.+);/)?.[1] ?? "";
    // se esta lista mudar, é decisão consciente — atualize o teste junto
    expect(linha).toBe(String.raw`/^\/api\/(auth|webhooks|cron)(\/|$)/`);
  });

  it("as únicas páginas abertas são as de entrar e recuperar senha", () => {
    const linha = fonte.match(/const PAGINA_ABERTA = (.+);/)?.[1] ?? "";
    expect(linha).toBe(String.raw`/^\/(login|recuperar-senha|redefinir-senha)(\/|$)/`);
  });

  it("API sem sessão responde 401, nunca redirect", () => {
    expect(fonte).toContain("status: 401");
    expect(fonte).toMatch(/if \(ehApi\)/);
  });

  it("o matcher cobre as rotas de API", () => {
    const matcher = fonte.match(/matcher: \[(.+)\]/)?.[1] ?? "";
    expect(matcher).not.toContain("api");  // não pode excluir /api do porteiro
  });
});
