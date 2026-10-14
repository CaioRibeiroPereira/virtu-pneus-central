import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central de clientes | Grupo Virtù Pneus",
  description: "Quem contatar hoje, histórico de cada cliente e sugestões do agente de IA.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#191d19",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
