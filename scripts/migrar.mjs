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
 * Uso:  DATABASE_URL="postgresql://…" npm run migrar
 *       (a URL sai do Supabase em Settings → Database → Connection string)
 *
 * Banco que já tem schema, aplicado à mão antes deste executor existir:
 *       npm run migrar -- --base=0011
 * marca tudo até a 0011 como aplicada SEM rodar, e aplica só o que vem
 * depois. Sem isso o seed rodaria de novo e recriaria os dados fictícios
 * logo depois de alguém limpá-los.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Falta DATABASE_URL.\n\n" +
    "1. No Supabase: Settings → Database → Connection string → URI\n" +
    "2. Troque [YOUR-PASSWORD] pela senha do banco\n" +
    "3. Cole no .env.local, numa linha:\n" +
    "     DATABASE_URL=postgresql://postgres.xxx:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres\n" +
    "4. npm run migrar -- --base=0011\n\n" +
    "O .env.local é lido automaticamente e está no .gitignore.",
  );
  process.exit(1);
}

const pasta = join(import.meta.dirname, "..", "supabase", "migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();

/** --base=0011: tudo até aí entra no registro sem ser executado. */
const base = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1];
if (base && !arquivos.some((f) => f.startsWith(base))) {
  console.error(`Não existe migração começando com "${base}".`);
  process.exit(1);
}

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

if (base) {
  const ate = arquivos.filter((f) => f.slice(0, base.length) <= base);
  for (const nome of ate) {
    await cliente.query(
      "insert into _migracoes (nome, duracao_ms) values ($1, null) on conflict (nome) do nothing",
      [nome],
    );
  }
  console.log(`  marcadas como aplicadas sem rodar: ${ate.length} (até ${base})\n`);
}

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
