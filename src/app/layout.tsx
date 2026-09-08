import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";
import { brand } from "@/config/brand";
import { auth } from "@/auth";
import { SessionProvider } from "@/components/providers/SessionProvider";

// Bricolage Grotesque: títulos y precios — con carácter propio, no genérica.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

// Manrope: UI y cuerpo — muy legible en tamaños chicos (direcciones, chips).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${brand.name} — ${brand.shortDescription}`,
    template: `%s — ${brand.name}`,
  },
  description: brand.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
};

/**
 * Se ejecuta antes de la hidratación para evitar el flash de tema
 * incorrecto: lee la preferencia guardada y setea data-theme en <html>.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("umbral-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth().catch(() => null);

  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text font-sans">
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
