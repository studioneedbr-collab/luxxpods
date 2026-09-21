import { ShieldCheck } from "lucide-react";
import { Badge, Panel, PanelHeader } from "@/components/ui";
import { TabelaMovimentos } from "@/components/estoque/movimentos";
import { getMovimentos } from "@/lib/data";

export const dynamic = "force-dynamic";

const EVENTOS_AUDITADOS = [
  "Alteração de preço", "Alteração de estoque", "Exclusão de registro",
  "Cancelamento de pedido", "Alteração financeira", "Troca",
  "Criação e edição de usuário", "Mudança de permissão", "Mudança manual de status",
];

export default async function LogsPage() {
  const movimentos = await getMovimentos(500);

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader titulo="Eventos auditados" icone={ShieldCheck}
          descricao="Registram usuário, data, hora, valor anterior e valor novo"
          acao={<Badge tom="ok">tabela audit_logs</Badge>} />
        <div className="flex flex-wrap gap-1.5 px-5 py-4">
          {EVENTOS_AUDITADOS.map((e) => <Badge key={e} tom="neutro">{e}</Badge>)}
        </div>
      </Panel>

      <TabelaMovimentos
        movimentos={movimentos}
        titulo="Histórico de estoque"
        descricao="Nenhuma alteração de estoque acontece sem movimentação registrada"
        mostrarReferencia
      />

    </div>
  );
}
