import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/** Display — grotesk industrial, da mesma família visual do wordmark. */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

/** Texto e dados — técnica, ótima em tabela e em número. */
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex",
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luxx Pods",
  description:
    "Atendimento por WhatsApp e Instagram, catálogo, estoque, pedidos e financeiro no mesmo fluxo.",
  applicationName: "Luxx Pods",
};

export const viewport: Viewport = {
  themeColor: "#05060c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: extensões de navegador injetam atributos no
    // <html> antes do React hidratar (data-studio-need-ext, grammarly etc.)
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${plex.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
