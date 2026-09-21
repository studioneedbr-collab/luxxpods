import { TelaTarefas } from "@/components/crm/tarefas";
import { Realtime } from "@/components/realtime";
import { getTarefas } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Hora do servidor — mantida fora do render para não depender de função impura. */
async function agoraDoServidor() {
  return Date.now();
}

export default async function TarefasPage() {
  const tarefas = await getTarefas();
  const agora = await agoraDoServidor();

  return (
    <>
      <Realtime tabelas={["tasks"]} />
      <TelaTarefas tarefas={tarefas} agora={agora} />
    </>
  );
}
