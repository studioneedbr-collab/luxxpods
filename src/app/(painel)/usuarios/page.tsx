import { TelaUsuarios } from "@/components/sistema/usuarios";
import { getUsuarios } from "@/lib/data-mvp2";
import { usandoDemo } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  return <TelaUsuarios usuarios={await getUsuarios()} supabaseConectado={!usandoDemo} />;
}
