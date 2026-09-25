import { TelaConfiguracoes } from "@/components/sistema/configuracoes";
import { lerConfiguracoes } from "@/lib/actions-config";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  return <TelaConfiguracoes configuracoes={await lerConfiguracoes()} />;
}
