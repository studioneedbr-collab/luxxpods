/**
 * O que o Postgres recusou, dito em português.
 *
 * As mensagens cruas do banco são corretas e inúteis para quem está no
 * balcão: "new row violates row-level security policy for table customers"
 * não diz o que fazer. Pior, três problemas diferentes viram a mesma
 * frustração — e o mais comum deles é usuário sem perfil, que é configuração,
 * não bug.
 */

interface ErroBanco {
  message?: string;
  code?: string;
  details?: string | null;
}

const TABELAS: Record<string, string> = {
  customers: "clientes", orders: "pedidos", order_items: "itens do pedido",
  products: "produtos", product_flavors: "sabores", inventory: "estoque",
  accounts_payable: "contas a pagar", accounts_receivable: "contas a receber",
  financial_categories: "categorias", bank_accounts: "contas bancárias",
  leads: "leads", profiles: "usuários", tasks: "tarefas",
  conversations: "conversas", messages: "mensagens", coupons: "cupons",
  exchanges: "trocas", purchase_entries: "notas de entrada",
  calendar_events: "calendário", suppliers: "fornecedores",
};

function nomeDaTabela(mensagem: string): string | null {
  const m = mensagem.match(/table "([a-z_]+)"/);
  if (!m) return null;
  return TABELAS[m[1]] ?? m[1];
}

export function traduzirErroBanco(erro: ErroBanco | null | undefined, acao?: string): string {
  const bruto = erro?.message ?? "";
  if (!bruto) return acao ? `Não consegui ${acao}.` : "Não consegui concluir.";

  const m = bruto.toLowerCase();

  // o caso mais comum numa instalação nova: a sessão existe, o perfil não.
  // O banco responde negando tudo, o que parece "sistema quebrado".
  if (m.includes("row-level security")) {
    const tabela = nomeDaTabela(bruto);
    return (
      `Seu usuário não tem permissão para gravar em ${tabela ?? "esta tabela"}. ` +
      `Se você acabou de instalar o sistema, o mais provável é que falte o ` +
      `perfil do seu usuário — peça a um administrador, ou crie o primeiro ` +
      `acesso em /primeiro-acesso.`
    );
  }

  if (m.includes("atendente_id_fkey") || m.includes("entregador_id_fkey")) {
    return (
      "Seu usuário entrou no sistema mas não tem perfil cadastrado, então o " +
      "pedido não consegue registrar quem atendeu. Cadastre o perfil em Usuários."
    );
  }

  if (m.includes("foreign key constraint")) {
    const alvo = bruto.match(/constraint "([a-z_]+)"/)?.[1];
    return (
      `Este registro aponta para algo que não existe mais${alvo ? ` (${alvo})` : ""}. ` +
      `Recarregue a página e tente de novo.`
    );
  }

  if (m.includes("duplicate key") || erro?.code === "23505") {
    if (m.includes("telefone")) return "Já existe cliente com este telefone.";
    if (m.includes("numero_pedido")) return "Este número de pedido já existe.";
    if (m.includes("email")) return "Já existe cadastro com este e-mail.";
    return "Já existe um registro igual a este.";
  }

  if (m.includes("not-null") || erro?.code === "23502") {
    const campo = bruto.match(/column "([a-z_]+)"/)?.[1];
    return `Falta preencher ${campo ? `o campo ${campo}` : "um campo obrigatório"}.`;
  }

  if (m.includes("check constraint")) {
    if (m.includes("estoque")) return "A operação deixaria o estoque negativo.";
    return "Os valores informados não passam na validação do banco.";
  }

  if (m.includes("jwt") || m.includes("expired")) {
    return "Sua sessão expirou. Entre de novo.";
  }

  // erro levantado pelas nossas próprias funções: já está em português
  if (erro?.code === "P0001") return bruto;

  return bruto;
}
