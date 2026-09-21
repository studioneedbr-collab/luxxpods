import { Shield } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui";

const GRUPOS: Array<{ grupo: string; permissoes: Array<[string, string]> }> = [
  { grupo: "Geral", permissoes: [["acessar_dashboard", "Acessar dashboard"]] },
  { grupo: "Atendimento", permissoes: [
    ["acessar_chat", "Acessar chats"],
    ["assumir_conversa", "Assumir conversa"],
    ["gerenciar_leads", "Gerenciar leads"],
    ["visualizar_clientes", "Visualizar clientes"],
    ["editar_clientes", "Editar clientes"],
  ]},
  { grupo: "Operacional", permissoes: [
    ["visualizar_pedidos", "Visualizar pedidos"],
    ["criar_pedido", "Criar pedido"],
    ["alterar_status_pedido", "Alterar status do pedido"],
    ["cancelar_pedido", "Cancelar pedido"],
    ["alterar_estoque", "Alterar estoque"],
    ["alterar_preco", "Alterar preço"],
    ["gerenciar_catalogo", "Gerenciar catálogo"],
    ["gerenciar_trocas", "Gerenciar trocas"],
  ]},
  { grupo: "Financeiro", permissoes: [
    ["visualizar_financeiro", "Visualizar financeiro"],
    ["editar_financeiro", "Editar financeiro"],
  ]},
  { grupo: "Relatórios", permissoes: [["visualizar_relatorios", "Visualizar relatórios"]] },
  { grupo: "Sistema", permissoes: [
    ["gerenciar_usuarios", "Gerenciar usuários"],
    ["gerenciar_configuracoes", "Gerenciar configurações"],
    ["visualizar_logs", "Visualizar logs"],
  ]},
];

export default function PermissoesPage() {
  return (
    <div className="space-y-3">
      <Panel className="px-5 py-3.5">
        <p className="text-xs leading-relaxed text-ink-400">
          As permissões são granulares e ficam no banco. Um perfil concede um conjunto,
          e o administrador ainda pode conceder ou revogar permissões individualmente por usuário
          (tabela <code className="rounded bg-white/6 px-1 py-0.5 text-[11px] text-brand-300">user_permissions</code>).
        </p>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        {GRUPOS.map((g) => (
          <Panel key={g.grupo}>
            <PanelHeader titulo={g.grupo} icone={Shield}
              descricao={`${g.permissoes.length} permissões`} />
            <ul className="divide-y divide-white/4">
              {g.permissoes.map(([slug, nome]) => (
                <li key={slug} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="text-xs text-ink-200">{nome}</span>
                  <code className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-500">
                    {slug}
                  </code>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}
