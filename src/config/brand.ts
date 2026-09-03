/**
 * Identidad de marca centralizada.
 *
 * Cambiar el nombre, tagline o color de acento de toda la plataforma
 * empieza y termina en este archivo.
 */
export const brand = {
  name: "Umbral",
  tagline: "Entrá antes de entrar.",
  description:
    "La plataforma donde las inmobiliarias publican sus propiedades y vos las recorrés antes de pisarlas.",
  shortDescription: "Portal inmobiliario con recorridos 3D.",
  domainLabel: "umbral.app",
  accentColor: "#2b7fff",
} as const;

export type Brand = typeof brand;
