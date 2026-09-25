"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import { PADRAO, validar, type ChaveConfig, type Configuracoes } from "./configuracoes";

type Resultado = { ok: boolean; erro?: string; campo?: string };

/**
 * Na demonstração as configurações vivem em memória, como o resto — e já
 * vêm preenchidas como a loja de exemplo do seed, para o fluxo de venda
 * ficar inteiro navegável antes do Supabase entrar.
 */
const emMemoria: Partial<Configuracoes> = {
  empresa: {
    nome: "Luxx Pods",
    telefone: "33999990000",
    endereco: "Teófilo Otoni - MG",
    logo_url: null,
  },
  pagamentos: {
    pix_ativo: true,
    dinheiro_ativo: true,
    cartao_ativo: false,
    chave_pix: "contato@luxxpods.com.br",
    gateway: null,
  },
};

export async function lerConfiguracoes(): Promise<Configuracoes> {
  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!c) return { ...PADRAO, ...emMemoria };

  const { data } = await c.from("settings")
    .select("chave, valor").eq("store_id", STORE_ID);

  const salvas: Partial<Configuracoes> = {};
  for (const linha of data ?? []) {
    const chave = linha.chave as ChaveConfig;
    if (chave in PADRAO) {
      // mescla com o padrão: campo novo no código não fica indefinido em
      // loja que salvou a configuração antes dele existir
      salvas[chave] = { ...PADRAO[chave], ...(linha.valor as object) } as never;
    }
  }

  return { ...PADRAO, ...salvas };
}

export async function salvarConfiguracao(
  chave: ChaveConfig,
  valor: Record<string, unknown>,
): Promise<Resultado> {
  const problemas = validar(chave, valor);
  if (problemas.length > 0) {
    return { ok: false, erro: problemas[0].erro, campo: problemas[0].campo };
  }

  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!c) {
    emMemoria[chave] = { ...PADRAO[chave], ...valor } as never;
  } else {
    const { data: user } = await c.auth.getUser();
    const { error } = await c.from("settings").upsert({
      store_id: STORE_ID,
      chave,
      valor,
      grupo: chave,
      updated_by: user?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,chave" });
    if (error) return { ok: false, erro: error.message };
  }

  // essas configurações mudam o comportamento de várias telas e do bot
  revalidatePath("/configuracoes");
  revalidatePath("/pedidos/novo");
  revalidatePath("/chats");
  revalidatePath("/integracoes");
  return { ok: true };
}
