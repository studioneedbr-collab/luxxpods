import { Inbox } from "@/components/chat/inbox";
import { getConversas, getMensagens } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ChatsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const conversas = await getConversas();
  const inicial = sp.c ?? conversas[0]?.id ?? null;
  const mensagens = inicial ? await getMensagens(inicial) : [];

  return (
    <Inbox
      conversas={conversas}
      mensagensIniciais={mensagens}
      conversaInicial={inicial}
    />
  );
}
