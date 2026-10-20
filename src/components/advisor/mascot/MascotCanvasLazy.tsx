"use client";

import dynamic from "next/dynamic";
import { MascotFallback } from "./MascotFallback";

/**
 * Carga diferida de `MascotCanvas` (three.js + GLTFLoader). `ssr: false` exige un componente
 * cliente (mismo patrón que `LocationPicker` / `MapCanvas`). El nombre `dynamicImport` evita
 * chocar con `export const dynamic` en las rutas.
 */
export const MascotCanvasLazy = dynamic(() => import("./MascotCanvas").then((m) => m.MascotCanvas), {
  ssr: false,
  loading: () => <MascotFallback poster={null} />,
});

export type { MascotHandle } from "./MascotCanvas";
