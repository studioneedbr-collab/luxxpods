import { KanbanBoard } from "@/components/kanban/board";
import { Realtime } from "@/components/realtime";
import { getFunil, getLeads } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const [etapas, leads] = await Promise.all([getFunil(), getLeads()]);
  return (
    <>
      <Realtime tabelas={["leads", "conversations"]} />
      <KanbanBoard etapas={etapas} leads={leads} />
    </>
  );
}
