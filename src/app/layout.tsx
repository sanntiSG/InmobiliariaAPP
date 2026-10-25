import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { Syne, Instrument_Serif, DM_Mono } from "next/font/google";
import "./globals.css";
import { brand } from "@/config/brand";
import { THEME_COOKIE_NAME } from "@/config/site";
import { THEME_COLORS } from "@/config/theme";
import { ThemeColorSync } from "@/components/layout/ThemeColorSync";
import { auth } from "@/auth";
import { getFreshAccount } from "@/lib/auth/fresh-account";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { AdvisorProvider } from "@/components/advisor/AdvisorProvider";
import { getPublishedAgents, toPublicConfig } from "@/lib/advisor/config";
import { agentsForAudience, audienceOf } from "@/lib/agents/registry";

// Syne (variable, 400–800): UI, titulares y precios — geométrica y ancha, con carácter propio. `latin-ext` cubre
// la ñ, las tildes y los signos de apertura (¿ ¡) del español.
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Instrument Serif (cursiva): sólo acento editorial — una palabra de un título, una cita. No tiene negrita: nunca
// se combina con `font-bold` (`font-synthesis-weight: none` en globals.css evita la falsa).
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
});

// DM Mono: etiquetas en mayúsculas (eyebrows), metadatos y cifras. No se precarga: no está en la primera pantalla
// de casi ninguna ruta y el texto se ve igual de legible con la de reserva mientras baja.
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: `${brand.name} — ${brand.shortDescription}`,
    template: `%s — ${brand.name}`,
  },
  description: brand.description,
};

/**
 * Color de la barra del sistema. Con tema elegido a mano (cookie) va fijo en ese color; sin cookie sigue al sistema.
 * Las rutas que ocupan toda la pantalla (mapa, propiedades) suman `viewportFit: "cover"` en su propio `viewport`.
 */
export async function generateViewport(): Promise<Viewport> {
  const chosen = (await cookies()).get(THEME_COOKIE_NAME)?.value;
  if (chosen === "light" || chosen === "dark") return { themeColor: THEME_COLORS[chosen] };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    ],
  };
}

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
  document.documentElement.classList.add("js");
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
  const [jwtSession, cookieStore] = await Promise.all([auth().catch(() => null), cookies()]);
  // El rol y la agencia que ve el menú salen de la base, no del JWT: justo después de recibir el
  // permiso o de crear la inmobiliaria la cookie todavía trae el estado anterior. Si la cuenta ya no
  // existe (se eliminó su inmobiliaria) se muestra como sin sesión.
  const fresh = jwtSession?.user?.id ? await getFreshAccount(jwtSession.user.id) : null;
  const session =
    jwtSession && fresh
      ? { ...jwtSession, user: { ...jwtSession.user, role: fresh.role as typeof jwtSession.user.role, agencyId: fresh.agencyId } }
      : null;
  // Lo que el asesor muestra (nombre, modelo, animaciones) es la configuración PUBLICADA; el borrador no sale del estudio.
  const advisorAccount = { signedIn: !!session, role: session?.user.role ?? null, agencyId: session?.user.agencyId ?? null };
  // Un explorador (o quien no inició sesión) recibe sólo al asesor; marketing y correo viajan únicamente a admin y a quienes
  // gestionan una inmobiliaria, y sólo si el admin los publicó.
  const publishedAgents = await getPublishedAgents();
  const audience = audienceOf(advisorAccount);
  const advisorConfig = toPublicConfig(publishedAgents.advisor);
  const agents = agentsForAudience(audience)
    .filter((id) => publishedAgents[id].enabled[audience])
    .map((id) => toPublicConfig(publishedAgents[id], id));
  const themeCookie = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;

  return (
    <html
      lang="es"
      data-theme={theme}
      className={`${syne.variable} ${instrumentSerif.variable} ${dmMono.variable} h-full antialiased`}
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
        <ThemeColorSync />
        <SessionProvider session={session}>
          <AdvisorProvider config={advisorConfig} agents={agents} account={advisorAccount}>
            {children}
          </AdvisorProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
