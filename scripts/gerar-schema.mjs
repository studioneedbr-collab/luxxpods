import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Junta as migrações num arquivo só, para colar no SQL Editor do Supabase.
 *
 * Existe porque o arquivo combinado já ficou para trás uma vez: tinha dez das
 * onze migrações, e faltava justamente a que cria o pedido. Quem colasse
 * montaria um banco que não vende. Gerar por script tira a chance de
 * esquecer — a fonte da verdade continua sendo `migrations/`.
 */
const pasta = join(import.meta.dirname, "..", "supabase", "migrations");
const saida = join(import.meta.dirname, "..", "supabase", "schema-completo.sql");

const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();

const partes = arquivos.map((nome) => {
  const barra = "=".repeat(21);
  return `-- ${barra} ${nome} ${barra}\n\n${readFileSync(join(pasta, nome), "utf8").trim()}\n`;
});

writeFileSync(saida, [
  "-- =====================================================================",
  "-- LUXX PODS — SCHEMA COMPLETO",
  "--",
  "-- GERADO POR scripts/gerar-schema.mjs — não edite à mão.",
  "-- Para mudar o banco, crie uma migração nova em supabase/migrations/",
  "-- e rode `npm run schema`.",
  "--",
  "-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez.",
  "-- É idempotente: rodar de novo não duplica nem apaga nada.",
  "--",
  `-- ${arquivos.length} migrações, na ordem:`,
  ...arquivos.map((f) => `--   ${f}`),
  "-- =====================================================================",
  "",
  ...partes,
].join("\n"));

console.log(`schema-completo.sql gerado com ${arquivos.length} migrações`);
