import type { SVGProps } from "react";

/**
 * Ícono de Nubi, el asesor: una nube con cola de globo de diálogo y dos puntos que hacen de ojos (es la mascota
 * en pequeño). Reemplaza al "destello" genérico para que el asesor se reconozca a primera vista.
 */
export function NubiIcon({ strokeWidth = 1.75, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M17 17.75H8.25a4.5 4.5 0 0 1-.55-8.97 5.25 5.25 0 0 1 10.2.97A3.5 3.5 0 0 1 17 17.75Z" />
      <path d="M8.5 17.75 6.6 20.6l4.2-2.1" />
      <circle cx="10.4" cy="12.9" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="12.9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
