"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin, getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";

/**
 * Usuários do sistema, criados aqui dentro.
 *
 * O acesso nasce no painel da Luxx — ninguém precisa abrir o Supabase para
 * dar entrada em alguém novo. Para isso estas ações usam a chave de serviço,
 * que ignora todo o controle de acesso do banco; por isso cada uma confere
 * PRIMEIRO se quem está chamando pode mexer em usuário. Sem essa conferência,
 * qualquer pessoa com sessão — um entregador, por exemplo — poderia criar um
 * administrador para si mesma.
 */

type Resultado = { ok: boolean; erro?: string; senha?: string };

const MIN_SENHA = 8;

/** Traduz as recusas do Supabase Auth, que chegam em inglês. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("already been registered") || m.includes("already exists")) {
    return "Já existe usuário com este e-mail.";
  }
  if (m.includes("password")) return `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`;
  if (m.includes("invalid email") || m.includes("email address")) return "E-mail inválido.";
  if (m.includes("rate limit")) return "Muitas tentativas seguidas. Espere um minuto.";
  return mensagem;
}

function validar(nome: string, email: string, senha?: string): string | null {
  if (!nome.trim()) return "Informe o nome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return "E-mail inválido.";
  if (senha !== undefined && senha.length < MIN_SENHA) {
    return `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`;
  }
  return null;
}

/**
 * Quem está pedindo pode mexer em usuário?
 *
 * A pergunta vai ao banco com a sessão da pessoa, não com a chave de serviço:
 * é o próprio Postgres respondendo quem ela é, e não o navegador dizendo.
 */
async function podeGerenciar(): Promise<{ ok: true; meuId: string } | { ok: false; erro: string }> {
  if (!supabaseConfigurado) {
    return { ok: false, erro: "Sistema sem banco configurado." };
  }

  const c = await getSupabaseServer();
  if (!c) return { ok: false, erro: "Sistema sem banco configurado." };

  const { data: sessao } = await c.auth.getUser();
  if (!sessao.user) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  const { data: autorizado } = await c.rpc("posso", { p_permissao: "gerenciar_usuarios" });
  if (autorizado !== true) {
    return { ok: false, erro: "Seu perfil não pode gerenciar usuários." };
  }

  return { ok: true, meuId: sessao.user.id };
}

/** A loja e a empresa onde o usuário novo entra. */
async function lugarDoUsuario(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data } = await admin.from("stores")
    .select("id, company_id").eq("id", STORE_ID).maybeSingle();
  return { store_id: data?.id ?? STORE_ID, company_id: data?.company_id ?? null };
}

async function idDoPerfil(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, slug: string,
) {
  const { data } = await admin.from("roles").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------

export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  role_slug: string;
  telefone?: string | null;
  cargo?: string | null;
}

export async function criarUsuario(dados: NovoUsuario): Promise<Resultado> {
  const quem = await podeGerenciar();
  if (!quem.ok) return { ok: false, erro: quem.erro };

  const invalido = validar(dados.nome, dados.email, dados.senha);
  if (invalido) return { ok: false, erro: invalido };

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, erro: "Falta a chave de serviço do Supabase no servidor." };
  }

  const email = dados.email.trim().toLowerCase();

  // confirmado de saída: sem servidor de e-mail configurado, esperar
  // confirmação deixaria a pessoa presa num login que recusa para sempre
  const { data: criado, error } = await admin.auth.admin.createUser({
    email,
    password: dados.senha,
    email_confirm: true,
    user_metadata: { nome: dados.nome.trim() },
  });

  if (error || !criado.user) {
    return { ok: false, erro: traduzir(error?.message ?? "não consegui criar o acesso") };
  }

  const lugar = await lugarDoUsuario(admin);
  const roleId = await idDoPerfil(admin, dados.role_slug);

  const { error: erroPerfil } = await admin.from("profiles").insert({
    id: criado.user.id,
    company_id: lugar.company_id,
    store_id: lugar.store_id,
    role_id: roleId,
    nome: dados.nome.trim(),
    email,
    telefone: dados.telefone ?? null,
    cargo: dados.cargo ?? null,
    status: "ativo",
  });

  if (erroPerfil) {
    // sem perfil a pessoa entra e não vê nada; e o acesso órfão impediria
    // criar de novo com o mesmo e-mail. Desfaz para a tela poder repetir.
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: `Criei o acesso mas não o perfil: ${erroPerfil.message}` };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function redefinirSenha(id: string, senha: string): Promise<Resultado> {
  const quem = await podeGerenciar();
  if (!quem.ok) return { ok: false, erro: quem.erro };
  if (senha.length < MIN_SENHA) {
    return { ok: false, erro: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.` };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, erro: "Falta a chave de serviço do Supabase." };

  const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
  if (error) return { ok: false, erro: traduzir(error.message) };

  return { ok: true };
}

/**
 * Desativar precisa também barrar o login.
 *
 * Marcar `status` só tira o acesso aos dados (o controle do banco exige perfil
 * ativo), mas a pessoa ainda entraria e veria telas vazias. Bloquear no Auth
 * é o que faz "desativado" significar desativado.
 */
export async function alternarStatusUsuario(
  id: string, ativo: boolean,
): Promise<Resultado> {
  const quem = await podeGerenciar();
  if (!quem.ok) return { ok: false, erro: quem.erro };
  if (id === quem.meuId && !ativo) {
    return { ok: false, erro: "Você não pode desativar a sua própria conta." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, erro: "Falta a chave de serviço do Supabase." };

  if (!ativo && await ehUltimoAdministrador(admin, id)) {
    return { ok: false, erro: "Este é o último administrador ativo — o sistema ficaria sem ninguém." };
  }

  const { error } = await admin.from("profiles")
    .update({ status: ativo ? "ativo" : "inativo" }).eq("id", id);
  if (error) return { ok: false, erro: error.message };

  // 100 anos: o Auth não tem "banido para sempre", só duração
  await admin.auth.admin.updateUserById(id, {
    ban_duration: ativo ? "none" : "876000h",
  });

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function excluirUsuario(id: string): Promise<Resultado> {
  const quem = await podeGerenciar();
  if (!quem.ok) return { ok: false, erro: quem.erro };
  if (id === quem.meuId) {
    return { ok: false, erro: "Você não pode excluir a sua própria conta." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, erro: "Falta a chave de serviço do Supabase." };

  if (await ehUltimoAdministrador(admin, id)) {
    return { ok: false, erro: "Este é o último administrador — o sistema ficaria sem ninguém." };
  }

  // o perfil referencia auth.users com ON DELETE CASCADE: apagar o acesso
  // leva o perfil junto, então não existe perfil órfão nem acesso órfão
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { ok: false, erro: traduzir(error.message) };

  revalidatePath("/usuarios");
  return { ok: true };
}

/** Travar a saída do último administrador evita sistema sem dono. */
async function ehUltimoAdministrador(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, id: string,
): Promise<boolean> {
  const roleAdmin = await idDoPerfil(admin, "admin");
  if (!roleAdmin) return false;

  const { data: alvo } = await admin.from("profiles")
    .select("role_id").eq("id", id).maybeSingle();
  if (alvo?.role_id !== roleAdmin) return false;

  const { count } = await admin.from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleAdmin).eq("status", "ativo").is("deleted_at", null);

  return (count ?? 0) <= 1;
}

// ---------------------------------------------------------------------------

/**
 * O primeiro administrador.
 *
 * Existe um impasse na instalação: só administrador cria usuário, e no banco
 * novo não há nenhum. Esta ação resolve isso uma única vez — ela se recusa a
 * rodar assim que existir qualquer perfil, então não é porta de entrada, é
 * uma porta que se fecha sozinha.
 */
export async function criarPrimeiroAdministrador(
  nome: string, email: string, senha: string,
): Promise<Resultado> {
  const invalido = validar(nome, email, senha);
  if (invalido) return { ok: false, erro: invalido };

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, erro: "Falta a chave de serviço do Supabase no servidor." };
  }

  const { count, error: erroConta } = await admin.from("profiles")
    .select("id", { count: "exact", head: true });

  if (erroConta) return { ok: false, erro: `Não consegui conferir o banco: ${erroConta.message}` };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: "Já existe usuário no sistema. Peça a um administrador para criar o seu acesso.",
    };
  }

  const alvo = email.trim().toLowerCase();

  const { data: criado, error } = await admin.auth.admin.createUser({
    email: alvo, password: senha, email_confirm: true,
    user_metadata: { nome: nome.trim() },
  });
  if (error || !criado.user) {
    return { ok: false, erro: traduzir(error?.message ?? "não consegui criar o acesso") };
  }

  const lugar = await lugarDoUsuario(admin);
  const roleId = await idDoPerfil(admin, "admin");

  const { error: erroPerfil } = await admin.from("profiles").insert({
    id: criado.user.id,
    company_id: lugar.company_id,
    store_id: lugar.store_id,
    role_id: roleId,
    nome: nome.trim(), email: alvo, status: "ativo",
  });

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: `Criei o acesso mas não o perfil: ${erroPerfil.message}` };
  }

  return { ok: true };
}

/** A tela de primeiro acesso só aparece enquanto não há ninguém. */
export async function sistemaSemUsuarios(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const { count, error } = await admin.from("profiles")
    .select("id", { count: "exact", head: true });

  return !error && (count ?? 0) === 0;
}
