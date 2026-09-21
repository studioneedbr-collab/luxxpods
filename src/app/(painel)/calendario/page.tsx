import { TelaCalendario } from "@/components/crm/calendario";
import { getEventos } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  return <TelaCalendario eventos={await getEventos()} />;
}
