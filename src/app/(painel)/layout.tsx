import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { getContadores, usandoDemo } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // só os números dos badges — nenhuma lista completa é carregada aqui
  const contadores = await getContadores();

  return (
    <ToastProvider>
      <div className="min-h-screen">
        <Sidebar contadores={contadores} />
        <div className="shell">
          <Topbar demo={usandoDemo} />
          <main id="conteudo" className="px-4 py-5 lg:px-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
