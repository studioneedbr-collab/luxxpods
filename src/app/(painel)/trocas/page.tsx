import { TelaTrocas } from "@/components/operacional/trocas";
import { getTrocas } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

export default async function TrocasPage() {
  return <TelaTrocas trocas={await getTrocas()} />;
}
