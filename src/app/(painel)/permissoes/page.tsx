import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Matriz de permissões: quem pode o quê.
 * Uma grade lê melhor que sete listas separadas — dá para comparar os perfis
 * numa passada de olho.
 */
const PERFIS = [
  { slug: "admin", nome: "Admin", cor: "text-brand-300" },
  { slug: "atendimento", nome: "Atendimento", cor: "text-info-400" },
  { slug: "operacional", nome: "Operacional", cor: "text-ok-400" },
  { slug: "financeiro", nome: "Financeiro", cor: "text-gold-400" },
  { slug: "entregador", nome: "Entregador", cor: "text-ink-400" },
] as const;

type Perfil = (typeof PERFIS)[number]["slug"];

const GRUPOS: Array<{
  grupo: string;
  permissoes: Array<{ slug: string; nome: string; perfis: Perfil[] }>;
}> = [
  {
    grupo: "Atendimento",
    permissoes: [
      { slug: "acessar_chat", nome: "Abrir conversas", perfis: ["admin", "atendimento"] },
      { slug: "assumir_conversa", nome: "Assumir do bot", perfis: ["admin", "atendimento"] },
      { slug: "gerenciar_leads", nome: "Mover leads no funil", perfis: ["admin", "atendimento"] },
      { slug: "visualizar_clientes", nome: "Ver clientes", perfis: ["admin", "atendimento"] },
      { slug: "editar_clientes", nome: "Editar clientes", perfis: ["admin", "atendimento"] },
    ],
  },
  {
    grupo: "Operação",
    permissoes: [
      { slug: "visualizar_pedidos", nome: "Ver pedidos", perfis: ["admin", "atendimento", "operacional", "entregador"] },
      { slug: "criar_pedido", nome: "Criar pedido", perfis: ["admin", "atendimento"] },
      { slug: "alterar_status_pedido", nome: "Mudar status do pedido", perfis: ["admin", "operacional"] },
      { slug: "cancelar_pedido", nome: "Cancelar pedido", perfis: ["admin"] },
      { slug: "alterar_estoque", nome: "Ajustar estoque", perfis: ["admin", "operacional"] },
      { slug: "alterar_preco", nome: "Mudar preço", perfis: ["admin"] },
      { slug: "gerenciar_catalogo", nome: "Gerenciar catálogo", perfis: ["admin", "operacional"] },
      { slug: "gerenciar_trocas", nome: "Aprovar trocas", perfis: ["admin", "operacional"] },
    ],
  },
  {
    grupo: "Dinheiro",
    permissoes: [
      { slug: "visualizar_financeiro", nome: "Ver financeiro", perfis: ["admin", "financeiro"] },
      { slug: "editar_financeiro", nome: "Lançar e dar baixa", perfis: ["admin", "financeiro"] },
      { slug: "visualizar_relatorios", nome: "Ver relatórios", perfis: ["admin", "financeiro"] },
    ],
  },
  {
    grupo: "Sistema",
    permissoes: [
      { slug: "gerenciar_usuarios", nome: "Gerenciar usuários", perfis: ["admin"] },
      { slug: "gerenciar_configuracoes", nome: "Mudar configurações", perfis: ["admin"] },
      { slug: "visualizar_logs", nome: "Consultar logs", perfis: ["admin"] },
    ],
  },
];

export default function PermissoesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-[11px] leading-relaxed text-ink-400">
        Cada perfil libera um conjunto de ações. O administrador ainda pode conceder ou
        revogar uma permissão específica para uma pessoa, sem mudar o perfil dela.
      </p>

      <div className="chapa overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-[var(--linha)] bg-ink-900 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Ação
              </th>
              {PERFIS.map((p) => (
                <th
                  key={p.slug}
                  className={cn(
                    "border-b border-[var(--linha)] bg-ink-900 px-2 py-2.5 text-center",
                    "text-[10px] font-semibold uppercase tracking-[0.06em]",
                    p.cor,
                  )}
                >
                  {p.nome}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {GRUPOS.map((g) => (
              <React.Fragment key={g.grupo}>
                <tr>
                  <td
                    colSpan={PERFIS.length + 1}
                    className="border-b border-[var(--linha)] bg-ink-950 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500"
                  >
                    {g.grupo}
                  </td>
                </tr>
                {g.permissoes.map((perm) => (
                  <tr key={perm.slug} className="transition-colors hover:bg-ink-850/60">
                    <td className="sticky left-0 z-10 border-b border-[var(--linha)] bg-ink-900 px-4 py-2">
                      <span className="text-ink-200">{perm.nome}</span>
                      <code className="ml-2 font-mono text-[10px] text-ink-600">{perm.slug}</code>
                    </td>
                    {PERFIS.map((p) => {
                      const tem = perm.perfis.includes(p.slug);
                      return (
                        <td
                          key={p.slug}
                          className="border-b border-[var(--linha)] px-2 py-2 text-center"
                        >
                          {tem ? (
                            <Check className={cn("mx-auto size-3.5", p.cor)} aria-label="permitido" />
                          ) : (
                            <Minus className="mx-auto size-3 text-ink-700" aria-label="não permitido" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-500">
        Tabelas <code className="font-mono text-ink-400">roles</code>,{" "}
        <code className="font-mono text-ink-400">permissions</code>,{" "}
        <code className="font-mono text-ink-400">role_permissions</code> e{" "}
        <code className="font-mono text-ink-400">user_permissions</code>.
      </p>
    </div>
  );
}
