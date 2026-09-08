import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";
import { brand } from "@/config/brand";
import { THEME_COOKIE_NAME } from "@/config/site";
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
 * Fallback de una sola vez para navegadores que todavía no tienen la cookie
 * de tema (versiones previas de esta app sólo guardaban la preferencia en
 * `localStorage`, que el servidor no puede leer — ver más abajo por qué eso
 * causaba que el tema "se invirtiera solo" al entrar a una propiedad desde
 * un link de carga completa, como el popup del mapa). Si encuentra una
 * preferencia vieja sin cookie, la aplica ahora mismo y escribe la cookie
 * para que la PRÓXIMA carga completa ya la resuelva el servidor sin pasar
 * por este script.
 */
const themeInitScript = `
(function () {
  try {
    if (document.cookie.indexOf("${THEME_COOKIE_NAME}=") !== -1) return;
    var stored = localStorage.getItem("${THEME_COOKIE_NAME}");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
      document.cookie = "${THEME_COOKIE_NAME}=" + stored + "; path=/; max-age=31536000; SameSite=Lax";
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La cookie (no `localStorage`) es la fuente de verdad del tema: el
  // servidor la puede leer y setear `data-theme` directo en el HTML que
  // manda, sin depender de que un script cliente lo corrija después de
  // pintar. Esto importa sobre todo en cargas de página completas (recarga,
  // o el popup del mapa — `PropertyPopupCard.tsx` navega con un `<a>` plano
  // a propósito, fuera del router de Next) donde antes había una carrera
  // entre el primer pintado (que caía al tema del SO) y ese script.
  const [session, cookieStore] = await Promise.all([auth().catch(() => null), cookies()]);
  const themeCookie = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;

  return (
    <html
      lang="es"
      data-theme={theme}
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
