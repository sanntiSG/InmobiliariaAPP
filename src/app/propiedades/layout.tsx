import type { ReactNode } from "react";
import type { Viewport } from "next";

/**
 * El listado y la ficha ocupan toda la pantalla del celular (debajo de la isla dinámica y de la barra inferior).
 * `viewport-fit=cover` se pide sólo en estas rutas: es lo que hace que `env(safe-area-inset-*)` valga algo, y
 * cada pantalla que lo usa ya reserva esos márgenes (variables `--safe-*` de globals.css).
 */
export const viewport: Viewport = { viewportFit: "cover" };

export default function PropiedadesLayout({ children }: { children: ReactNode }) {
  return children;
}
