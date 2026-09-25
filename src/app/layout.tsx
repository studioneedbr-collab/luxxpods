import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from "next/font/google";
import "./globals.css";

/**
 * Display — geométrica, do mesmo espírito do wordmark "LUXX PODS".
 * Usada em título, número e rótulo; nunca em texto corrido.
 */
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display-face",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/** Texto e dados — técnica, ótima em tabela e formulário. */
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
      className={`${sora.variable} ${plex.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
