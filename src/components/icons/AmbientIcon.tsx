import type { SVGProps } from "react";

/**
 * Ícono de la portada viva: un marco de foto con un disco mitad lleno (día) y mitad contorno (noche). Trazo y
 * terminaciones iguales a los de lucide para convivir con el resto, pero propio: no es el "destello" genérico.
 */
export function AmbientIcon({ strokeWidth = 1.75, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M6.5 4.5h11A3.5 3.5 0 0 1 21 8v8a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 16V8a3.5 3.5 0 0 1 3.5-3.5Z" />
      <path d="M12 7.75a4.25 4.25 0 0 0 0 8.5Z" fill="currentColor" />
      <path d="M12 7.75a4.25 4.25 0 0 1 0 8.5" />
    </svg>
  );
}
