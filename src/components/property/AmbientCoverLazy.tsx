"use client";

import dynamicImport from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * El reproductor toca WebGL/`document` al arrancar y pesa lo suyo: se carga sólo en el cliente y sólo cuando hay una
 * portada viva para mostrar (mismo patrón que `Photo360Viewer` y el mapa). La proporción 16/10 es la de la galería, así
 * que al cambiar de pestaña no hay salto de layout.
 */
export const AmbientCoverLazy = dynamicImport(() => import("./AmbientCover").then((m) => m.AmbientCover), {
  ssr: false,
  loading: () => <Skeleton className="aspect-[16/10] w-full rounded-card" />,
});
