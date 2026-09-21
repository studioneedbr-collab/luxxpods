import { TelaUpsell } from "@/components/comercial/upsell";
import { getUpsell } from "@/lib/data-mvp2";
import { getProdutos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function UpsellPage() {
  const [regras, produtos] = await Promise.all([getUpsell(), getProdutos()]);
  return <TelaUpsell regras={regras} produtos={produtos} />;
}
