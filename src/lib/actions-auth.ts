"use server";

import { cookies, headers } from "next/headers";
import { getSupabaseServer } from "./supabase/server";
import { supabaseConfigurado } from "./supabase/config";
import { limparTentativas, registrarTentativa } from "./limite-tentativas";

type Resultado = { ok: boolean; erro?: string };

/** Mensagem em português para cada recusa do Supabase Auth. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  if (m.includes("user not found")) return "E-mail ou senha incorretos.";
  return "Não consegui entrar agora. Tente de novo em instantes.";
}

export async function entrar(
  email: string, senha: string, lembrar: boolean,
): Promise<Resultado> {
  if (!email || !senha) return { ok: false, erro: "Preencha e-mail e senha." };

  const alvo = email.trim().toLowerCase();

  // Freio por e-mail e por origem: um script que varre senhas para de passar
  // depois de algumas tentativas, sem atrapalhar quem só errou a senha.
  const cabecalhos = await headers();
  const origem = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  for (const chave of [`login:${alvo}`, `origem:${origem}`]) {
    const freio = registrarTentativa(chave);
    if (!freio.permitido) {
      const minutos = Math.ceil((freio.esperarSegundos ?? 60) / 60);
      return {
        ok: false,
        erro: `Muitas tentativas seguidas. Tente de novo em ${minutos} minuto${minutos > 1 ? "s" : ""}.`,
      };
    }
  }

  const supabase = supabaseConfigurado ? await getSupabaseServer() : null;

  // Sem banco conectado, qualquer e-mail entra na base de demonstração, para
  // a equipe navegar antes do Supabase. Em produção isso seria porta aberta.
  if (!supabase) {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      return {
        ok: false,
        erro: "Sistema sem banco de dados configurado. Fale com o administrador.",
      };
    }
    const store = await cookies();
    store.set("luxx_demo_sessao", alvo, {
      httpOnly: true,
      sameSite: "lax",
      // este ramo só roda fora de produção (o guard acima), onde o painel
      // é servido por http em localhost — marcar secure impediria o cookie
      secure: false,
      maxAge: lembrar ? 60 * 60 * 24 * 30 : undefined,
      path: "/",
    });
    limparTentativas(`login:${alvo}`);
    return { ok: true };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: alvo, password: senha,
  });

  if (error) {
    // A mensagem é a mesma para e-mail inexistente e senha errada, de
    // propósito: dizer "este e-mail não existe" entrega quem é cliente.
    return { ok: false, erro: traduzir(error.message) };
  }

  limparTentativas(`login:${alvo}`);
  limparTentativas(`origem:${origem}`);
  return { ok: true };
}

export async function sair(): Promise<Resultado> {
  const supabase = supabaseConfigurado ? await getSupabaseServer() : null;
  if (supabase) await supabase.auth.signOut();

  const store = await cookies();
  store.delete("luxx_demo_sessao");
  return { ok: true };
}

/** Quem está logado agora — usado pelo menu do topo. */
export async function usuarioAtual(): Promise<{ nome: string; email: string } | null> {
  const supabase = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!supabase) {
    const email = (await cookies()).get("luxx_demo_sessao")?.value;
    return email ? { nome: email.split("@")[0], email } : null;
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: perfil } = await supabase
    .from("profiles").select("nome").eq("id", data.user.id).maybeSingle();

  return {
    nome: perfil?.nome || data.user.email?.split("@")[0] || "Usuário",
    email: data.user.email ?? "",
  };
}
