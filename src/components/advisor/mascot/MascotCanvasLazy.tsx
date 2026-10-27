"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils/cn";
import type { MascotCanvas as MascotCanvasType } from "./MascotCanvas";
import { MascotFallback } from "./MascotFallback";

/**
 * Carga diferida de `MascotCanvas` (three.js + GLTFLoader). `ssr: false` exige un componente cliente (mismo patrón que
 * `LocationPicker` / `MapCanvas`).
 */
const Inner = dynamic(() => import("./MascotCanvas").then((m) => m.MascotCanvas), { ssr: false });

type Props = Parameters<typeof MascotCanvasType>[0];

/**
 * El asesor en 3D con su placeholder desde el primer instante. Mientras se baja el código de la escena (antes de que exista
 * `MascotCanvas`) se muestra el póster —o el orbe— de la misma forma que mientras se baja el modelo: antes ese primer tramo
 * siempre mostraba el orbe aunque hubiera póster y después cambiaba de golpe. En cuanto la escena empieza a cargar, ella misma
 * se ocupa del placeholder (y de desvanecerlo al terminar).
 */
export function MascotCanvasLazy(props: Props) {
  const [mounted, setMounted] = useState(false);
  const { className, poster, onStatus } = props;
  return (
    <>
      <Inner
        {...props}
        onStatus={(status) => {
          setMounted(true);
          onStatus?.(status);
        }}
      />
      {!mounted && (
        <div className={cn("advisor-mascot", className)}>
          <MascotFallback poster={poster ?? null} />
        </div>
      )}
    </>
  );
}

export type { MascotHandle } from "./MascotCanvas";
