import "server-only";

/**
 * A chave que ignora todo o controle de acesso do banco.
 *
 * Fica num módulo `server-only` de propósito, longe de `config.ts`: aquele é
 * importado pelo cliente do navegador, e uma chave assim num grafo que chega
 * ao navegador depende de o empacotador apagá-la. Aqui a importação a partir
 * de um componente de cliente é erro de build — a proteção é estrutural, não
 * uma gentileza da ferramenta.
 *
 * Quem tem esta chave lê, altera e apaga qualquer linha, sem login.
 */
export const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";
