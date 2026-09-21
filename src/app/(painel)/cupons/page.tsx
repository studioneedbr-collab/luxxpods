import { TelaCupons } from "@/components/comercial/cupons";
import { getCupons } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

export default async function CuponsPage() {
  return <TelaCupons cupons={await getCupons()} />;
}
