/** Leitura dos módulos do MVP 2 — Supabase quando conectado, demo quando não. */
import "server-only";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import { demo2 } from "./demo-mvp2";
import type {
  CategoriaFinanceira, ContaBancaria, Cupom, EventoCalendario, Fornecedor,
  Lancamento, NotaEntrada, RegraUpsell, Troca, Usuario,
} from "./types";

async function sb() {
  return supabaseConfigurado ? await getSupabaseServer() : null;
}

/** Erro do banco não vira dado de demonstração — ver a nota em data.ts. */
function aoFalhar(consulta: string, erro: { message: string } | null): never {
  const detalhe = erro?.message ?? "sem detalhe";
  console.error(`[luxx] consulta "${consulta}" falhou: ${detalhe}`);
  throw new Error(`Não consegui carregar ${consulta}. O banco respondeu: ${detalhe}`);
}

export async function getCupons(): Promise<Cupom[]> {
  const c = await sb();
  if (!c) return demo2().cupons;
  const { data, error } = await c.from("coupons").select("*")
    .eq("store_id", STORE_ID).order("created_at", { ascending: false });
  if (error || !data) aoFalhar("os cupons", error);
  return data as unknown as Cupom[];
}

export async function getUpsell(): Promise<RegraUpsell[]> {
  const c = await sb();
  if (!c) return demo2().upsell;
  const { data, error } = await c.from("upsell_rules")
    .select("*, origem:products!upsell_rules_produto_origem_fkey(nome), destino:products!upsell_rules_produto_destino_fkey(nome)")
    .eq("store_id", STORE_ID).order("prioridade");
  if (error || !data) aoFalhar("as regras de upsell", error);

  const { data: eventos } = await c.from("upsell_events")
    .select("rule_id, aceita, valor_gerado").eq("store_id", STORE_ID);

  return data.map((r: Record<string, unknown>) => {
    const evs = (eventos ?? []).filter((e) => e.rule_id === r.id);
    return {
      ...(r as unknown as RegraUpsell),
      produto_origem_nome: (r.origem as { nome?: string } | null)?.nome ?? null,
      produto_destino_nome: (r.destino as { nome?: string } | null)?.nome ?? null,
      exibidas: evs.length,
      aceitas: evs.filter((e) => e.aceita).length,
      faturamento: evs.reduce((a, e) => a + Number(e.valor_gerado ?? 0), 0),
    };
  });
}

export async function getTrocas(): Promise<Troca[]> {
  const c = await sb();
  if (!c) return demo2().trocas;
  const { data, error } = await c.from("exchanges")
    .select("*, customers(nome), orders(numero_pedido), order_items(produto_nome, sabor_nome)")
    .eq("store_id", STORE_ID).order("created_at", { ascending: false });
  if (error || !data) aoFalhar("as trocas", error);
  return data.map((t: Record<string, unknown>) => ({
    ...(t as unknown as Troca),
    cliente_nome: (t.customers as { nome?: string } | null)?.nome ?? null,
    numero_pedido: (t.orders as { numero_pedido?: string } | null)?.numero_pedido ?? null,
    produto_nome: (t.order_items as { produto_nome?: string } | null)?.produto_nome ?? null,
    sabor_nome: (t.order_items as { sabor_nome?: string } | null)?.sabor_nome ?? null,
  }));
}

export async function getFornecedores(): Promise<Fornecedor[]> {
  const c = await sb();
  if (!c) return demo2().fornecedores;
  const { data, error } = await c.from("suppliers").select("*")
    .eq("store_id", STORE_ID).is("deleted_at", null).order("nome");
  if (error || !data) aoFalhar("os fornecedores", error);
  return data as unknown as Fornecedor[];
}

export async function getNotasEntrada(): Promise<NotaEntrada[]> {
  const c = await sb();
  if (!c) return demo2().notas;
  const { data, error } = await c.from("purchase_entries")
    .select("*, suppliers(nome), purchase_entry_items(quantidade)")
    .eq("store_id", STORE_ID).order("data", { ascending: false }).limit(200);
  if (error || !data) aoFalhar("as notas de entrada", error);
  return data.map((n: Record<string, unknown>) => {
    const itens = (n.purchase_entry_items as Array<{ quantidade: number }>) ?? [];
    return {
      ...(n as unknown as NotaEntrada),
      fornecedor_nome: (n.suppliers as { nome?: string } | null)?.nome ?? null,
      cotacao: n.cotacao != null ? Number(n.cotacao) : null,
      freteiro_pct: Number(n.freteiro_pct ?? 0),
      valor_total: Number(n.valor_total ?? 0),
      estoque_aplicado: Boolean(n.estoque_aplicado),
      itens_count: itens.length,
      pecas: itens.reduce((a, i) => a + Number(i.quantidade), 0),
    };
  });
}

export async function getContasBancarias(): Promise<ContaBancaria[]> {
  const c = await sb();
  if (!c) return demo2().contas;
  const { data, error } = await c.from("bank_accounts").select("*")
    .eq("store_id", STORE_ID).order("nome");
  if (error || !data) aoFalhar("as contas bancárias", error);

  const { data: ar } = await c.from("accounts_receivable")
    .select("bank_account_id, valor, status").eq("store_id", STORE_ID).eq("status", "pago");
  const { data: ap } = await c.from("accounts_payable")
    .select("bank_account_id, valor, status").eq("store_id", STORE_ID).eq("status", "pago");

  return data.map((b: Record<string, unknown>) => {
    const entra = (ar ?? []).filter((x) => x.bank_account_id === b.id)
      .reduce((a, x) => a + Number(x.valor), 0);
    const sai = (ap ?? []).filter((x) => x.bank_account_id === b.id)
      .reduce((a, x) => a + Number(x.valor), 0);
    return {
      ...(b as unknown as ContaBancaria),
      saldo_atual: Number(b.saldo_inicial) + entra - sai,
    };
  });
}

export async function getCategoriasFinanceiras(): Promise<CategoriaFinanceira[]> {
  const c = await sb();
  if (!c) return demo2().categorias;
  const { data, error } = await c.from("financial_categories").select("*")
    .eq("store_id", STORE_ID).order("tipo").order("nome");
  if (error || !data) aoFalhar("as categorias financeiras", error);
  return data.map((x) => ({ ...(x as unknown as CategoriaFinanceira), lancamentos: 0, total: 0 }));
}

export async function getLancamentos(tipo?: "receber" | "pagar"): Promise<Lancamento[]> {
  const c = await sb();
  if (!c) {
    const todos = demo2().lancamentos;
    return tipo ? todos.filter((l) => l.tipo === tipo) : todos;
  }

  const out: Lancamento[] = [];

  if (tipo !== "pagar") {
    const { data } = await c.from("accounts_receivable")
      .select("*, customers(nome), orders(numero_pedido), financial_categories(nome), bank_accounts(nome)")
      .eq("store_id", STORE_ID).order("vencimento", { ascending: false }).limit(300);
    (data ?? []).forEach((r: Record<string, unknown>) => out.push({
      ...(r as unknown as Lancamento),
      tipo: "receber",
      descricao: String(r.descricao ?? "Venda"),
      contraparte: (r.customers as { nome?: string } | null)?.nome ?? null,
      numero_pedido: (r.orders as { numero_pedido?: string } | null)?.numero_pedido ?? null,
      categoria_nome: (r.financial_categories as { nome?: string } | null)?.nome ?? null,
      conta_nome: (r.bank_accounts as { nome?: string } | null)?.nome ?? null,
    }));
  }

  if (tipo !== "receber") {
    const { data } = await c.from("accounts_payable")
      .select("*, suppliers(nome), financial_categories(nome), bank_accounts(nome)")
      .eq("store_id", STORE_ID).order("vencimento", { ascending: false }).limit(300);
    (data ?? []).forEach((r: Record<string, unknown>) => out.push({
      ...(r as unknown as Lancamento),
      tipo: "pagar",
      contraparte: (r.suppliers as { nome?: string } | null)?.nome ?? null,
      categoria_nome: (r.financial_categories as { nome?: string } | null)?.nome ?? null,
      conta_nome: (r.bank_accounts as { nome?: string } | null)?.nome ?? null,
    }));
  }

  return out;
}

export async function getUsuarios(): Promise<Usuario[]> {
  const c = await sb();
  if (!c) return demo2().usuarios;
  const { data, error } = await c.from("profiles")
    .select("*, roles(slug, nome)").is("deleted_at", null).order("nome");
  if (error || !data) aoFalhar("os usuários", error);
  return data.map((u: Record<string, unknown>) => ({
    ...(u as unknown as Usuario),
    role_slug: (u.roles as { slug?: string } | null)?.slug ?? "atendimento",
    role_nome: (u.roles as { nome?: string } | null)?.nome ?? "Atendimento",
  }));
}

export async function getEventos(): Promise<EventoCalendario[]> {
  const c = await sb();
  if (!c) return demo2().eventos;
  const { data, error } = await c.from("calendar_events")
    .select("*, profiles(nome)").eq("store_id", STORE_ID).order("inicio");
  if (error || !data) aoFalhar("o calendário", error);
  return data.map((e: Record<string, unknown>) => ({
    ...(e as unknown as EventoCalendario),
    responsavel: (e.profiles as { nome?: string } | null)?.nome ?? null,
  }));
}
