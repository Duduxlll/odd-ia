import type { Metadata } from "next";
import { Bricolage_Grotesque, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Radar de Valor",
  description: "Painel pessoal para análise esportiva com IA, odds e contexto competitivo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${ibmPlexMono.variable} ${fraunces.variable} h-full antialiased`}
      style={{ backgroundColor: "#060A14" }}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: "#060A14" }}
      >
        {children}
      </body>
    </html>
  );
}
