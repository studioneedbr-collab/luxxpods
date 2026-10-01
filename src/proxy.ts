import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Porteiro do sistema.
 *
 * A regra é lista de PERMISSÃO, não de negação: tudo exige sessão, e o que
 * pode ficar aberto está escrito aqui embaixo, nomeado. Rota nova nasce
 * fechada — se alguém esquecer de proteger, ela simplesmente não abre, em
 * vez de vazar dados sem ninguém perceber.
 */

/**
 * Páginas que uma pessoa sem sessão pode abrir.
 *
 * `primeiro-acesso` cria o primeiro administrador do banco. Ela é aberta
 * porque, antes dele existir, não há sessão possível — e se fecha sozinha:
 * a própria página redireciona para o login assim que houver algum perfil.
 */
const PAGINA_ABERTA = /^\/(login|primeiro-acesso|recuperar-senha|redefinir-senha)(\/|$)/;

/**
 * APIs abertas, uma a uma e com motivo:
 *   auth      — o próprio fluxo de login precisa rodar deslogado
 *   webhooks  — Meta e gateway de pagamento chamam sem sessão; cada um
 *               valida a própria assinatura no handler
 *   cron      — tarefas agendadas, protegidas por CRON_SECRET
 */
const API_ABERTA = /^\/api\/(auth|webhooks|cron)(\/|$)/;

/** Arquivos e rotas internas do Next, que não passam por autenticação. */
const INTERNO = /^\/(_next|favicon\.ico|icon|apple-icon|marca|.*\.(png|jpg|jpeg|svg|webp|ico|txt|xml))/;

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (INTERNO.test(pathname)) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // os dois nomes: o Supabase renomeou `anon` para `publishable`
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem credenciais o painel roda na base de demonstração — útil para
  // desenvolver, perigoso em produção: um erro de digitação na variável de
  // ambiente da Vercel abriria o sistema inteiro sem gerar nenhum erro.
  if (!url || !key) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();

    return new NextResponse(
      "Sistema fora do ar: banco de dados não configurado.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const ehApi = pathname.startsWith("/api");
  const aberta = ehApi ? API_ABERTA.test(pathname) : PAGINA_ABERTA.test(pathname);

  if (!user && !aberta) {
    // API responde 401. Redirecionar quebraria o .json() do fetch sem dizer
    // por quê — a tela receberia HTML de login achando que é resposta.
    if (ehApi) {
      return NextResponse.json(
        { erro: "Sessão expirada. Entre novamente." },
        { status: 401 },
      );
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?voltar=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  // quem já entrou não fica preso na tela de login
  if (user && PAGINA_ABERTA.test(pathname)) {
    const inicio = request.nextUrl.clone();
    inicio.pathname = "/";
    inicio.search = "";
    return NextResponse.redirect(inicio);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
