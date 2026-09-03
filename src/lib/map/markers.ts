import { formatCompactNumber } from "@/lib/utils/format";
import type { PropertyCardData } from "@/components/property/types";

/**
 * Los pins se construyen con DOM plano (no React) a propósito: son decenas
 * de nodos creados/destruidos en cada `moveend`, y montar un root de React
 * por marker sería overhead innecesario. Las clases de Tailwind funcionan
 * igual porque el scanner de contenido de Tailwind v4 indexa este archivo.
 *
 * IMPORTANTE: `maplibregl.Marker` aplica su propio `style.transform` (para
 * posicionar) directamente sobre el elemento raíz que le pasamos. Por eso
 * todo transform propio (hover, highlight) vive en un hijo `.pin-visual`,
 * nunca en la raíz — si no, se pisan entre sí y el pin "se rompe".
 */

export function createClusterElement(count: number): HTMLDivElement {
  const root = document.createElement("div");

  const size = count < 10 ? 40 : count < 50 ? 48 : 56;
  const visual = document.createElement("div");
  visual.className =
    "pin-visual flex items-center justify-center rounded-full bg-accent text-accent-contrast font-display font-bold shadow-float cursor-pointer select-none ring-4 ring-accent/15 " +
    "transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:scale-105 active:scale-95";
  visual.style.width = `${size}px`;
  visual.style.height = `${size}px`;
  visual.style.fontSize = count < 100 ? "14px" : "12px";
  visual.textContent = formatCompactNumber(count);

  root.appendChild(visual);
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "0");
  root.setAttribute("aria-label", `${count} propiedades en esta zona, hacé click para acercar`);
  return root;
}

export function createPropertyPinElement(property: PropertyCardData): HTMLDivElement {
  const root = document.createElement("div");
  root.style.width = "30px";
  root.style.height = "38px";
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "0");
  root.setAttribute(
    "aria-label",
    `${property.title}, ${new Intl.NumberFormat("es-AR").format(property.price)} ${property.currency}`
  );

  const visual = document.createElement("div");
  visual.className =
    "pin-visual relative cursor-pointer select-none transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5";
  visual.innerHTML = `
    <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.6 0 14.7 0 24.7 15 38 15 38S30 24.7 30 14.7C30 6.6 23.3 0 15 0Z" style="fill: var(--accent)" />
      <circle cx="15" cy="15" r="6.5" fill="white" />
    </svg>
  `;

  if (property.tour3d) {
    const dot = document.createElement("span");
    dot.className = "absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-warning ring-2 ring-surface";
    dot.setAttribute("aria-hidden", "true");
    visual.appendChild(dot);
  }

  root.appendChild(visual);
  return root;
}

/** Escala visual cuando el pin corresponde a la card en hover/selección (opera sobre `.pin-visual`, nunca sobre la raíz). */
export function setPinHighlighted(markerRoot: HTMLElement, highlighted: boolean) {
  const visual = markerRoot.querySelector<HTMLElement>(".pin-visual");
  if (!visual) return;
  visual.style.transform = highlighted ? "scale(1.25) translateY(-2px)" : "";
  markerRoot.style.zIndex = highlighted ? "10" : "";
}
