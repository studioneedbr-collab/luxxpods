import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

/**
 * Aplica as migrações no Postgres do Supabase, na ordem, uma vez cada.
 *
 * Existe porque DDL não passa pela API REST: colar no SQL Editor funciona,
 * mas depende de alguém lembrar quais já rodaram. Aqui o próprio banco
 * guarda o registro, então rodar de novo é seguro e barato.
 *
 * Uso:  DATABASE_URL="postgresql://…" node scripts/migrar.mjs
 *       (a URL sai do Supabase em Settings → Database → Connection string)
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Falta DATABASE_URL.\n" +
    "No Supabase: Settings → Database → Connection string → URI\n" +
    "Troque [YOUR-PASSWORD] pela senha do banco.",
  );
  process.exit(1);
}

const pasta = join(import.meta.dirname, "..", "supabase", "migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();

const cliente = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  // uma migração grande pode passar do padrão
  statement_timeout: 300_000,
});

await cliente.connect();

await cliente.query(`
  create table if not exists _migracoes (
    nome text primary key,
    aplicada_em timestamptz not null default now(),
    duracao_ms integer
  )
`);

const { rows } = await cliente.query("select nome from _migracoes");
const jaAplicadas = new Set(rows.map((r) => r.nome));

let aplicadas = 0;

for (const nome of arquivos) {
  if (jaAplicadas.has(nome)) {
    console.log(`  · ${nome} — já aplicada`);
    continue;
  }

  const sql = readFileSync(join(pasta, nome), "utf8");
  const t0 = Date.now();

  // cada migração numa transação: ou entra inteira, ou não entra
  try {
    await cliente.query("begin");
    await cliente.query(sql);
    await cliente.query(
      "insert into _migracoes (nome, duracao_ms) values ($1, $2)",
      [nome, Date.now() - t0],
    );
    await cliente.query("commit");
    console.log(`  ✓ ${nome} — ${Date.now() - t0}ms`);
    aplicadas++;
  } catch (e) {
    await cliente.query("rollback");
    console.error(`\n  ✗ ${nome} falhou e NADA dela foi aplicado:\n`);
    console.error(`    ${e.message}`);
    if (e.hint) console.error(`    dica: ${e.hint}`);
    if (e.position) console.error(`    posição: ${e.position}`);
    await cliente.end();
    process.exit(1);
  }
}

console.log(
  `\n${aplicadas} migração(ões) aplicada(s), ` +
  `${arquivos.length - aplicadas} já estava(m) no banco.`,
);

await cliente.end();
