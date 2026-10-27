import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { THEME_COLORS } from "@/config/theme";

/**
 * Para poder agregar la plataforma a la pantalla de inicio (en iPhone/iPad es OBLIGATORIO para recibir avisos del dispositivo).
 * El nombre sale de la configuración de marca: si cambia, cambia acá solo. Los íconos los dibuja `/pwa-icon/[size]`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    lang: "es-AR",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
