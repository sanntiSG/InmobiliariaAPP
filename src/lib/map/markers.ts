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
 *
 * Los marcadores se diffean por id en MapCanvas: cuando un `cluster-<id>` o
 * `point-<id>` ya existe se reposiciona en vez de recrearse, y el listener
 * de click se registra una sola vez en la creación. Si ese listener leyera
 * `lng`/`lat`/`cluster_id` de una clausura, quedaría apuntando a datos del
 * momento de creación para siempre — por eso esos valores se guardan en
 * `dataset` y se releen ahí en cada click (ver `setClusterTarget`).
 */

export function createClusterElement(count: number): HTMLDivElement {
  const root = document.createElement("div");

  const visual = document.createElement("div");
  visual.className =
    "pin-visual flex items-center justify-center rounded-full bg-accent text-accent-contrast font-display font-bold shadow-float cursor-pointer select-none ring-4 ring-accent/15 " +
    "transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:scale-105 active:scale-95";

  root.appendChild(visual);
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "0");
  applyClusterVisual(root, visual, count);
  return root;
}

/** Actualiza tamaño/texto del cluster si `count` cambió desde la última vez (evita writes de DOM innecesarios). */
export function updateClusterElement(root: HTMLDivElement, count: number) {
  if (root.dataset.count === String(count)) return;
  const visual = root.querySelector<HTMLDivElement>(".pin-visual");
  if (visual) applyClusterVisual(root, visual, count);
}

function applyClusterVisual(root: HTMLDivElement, visual: HTMLDivElement, count: number) {
  root.dataset.count = String(count);
  const size = count < 10 ? 40 : count < 50 ? 48 : 56;
  visual.style.width = `${size}px`;
  visual.style.height = `${size}px`;
  visual.style.fontSize = count < 100 ? "14px" : "12px";
  visual.textContent = formatCompactNumber(count);
  root.setAttribute("aria-label", `${count} propiedades en esta zona, hacé click para acercar`);
}

/** Guarda en `dataset` el centro y el cluster_id vigentes — leídos por el handler de click en vez de una clausura. */
export function setClusterTarget(root: HTMLDivElement, clusterId: number, lng: number, lat: number) {
  root.dataset.clusterId = String(clusterId);
  root.dataset.lng = String(lng);
  root.dataset.lat = String(lat);
}

export function getClusterTarget(root: HTMLDivElement): { clusterId: number; lng: number; lat: number } {
  return {
    clusterId: Number(root.dataset.clusterId),
    lng: Number(root.dataset.lng),
    lat: Number(root.dataset.lat),
  };
}

export function createPropertyPinElement(property: PropertyCardData): HTMLDivElement {
  const root = document.createElement("div");
  root.style.width = "30px";
  root.style.height = "38px";
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "0");

  const visual = document.createElement("div");
  visual.className =
    "pin-visual relative cursor-pointer select-none transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5";
  root.appendChild(visual);

  applyPropertyPinVisual(root, visual, property);
  return root;
}

/** Refresca el contenido del pin (precio, recorrido 3D) si la propiedad cambió desde la última vez. */
export function updatePropertyPinElement(root: HTMLDivElement, property: PropertyCardData) {
  const signature = `${property.price}|${property.currency}|${property.tour3d}`;
  if (root.dataset.signature === signature) return;
  const visual = root.querySelector<HTMLDivElement>(".pin-visual");
  if (visual) applyPropertyPinVisual(root, visual, property);
}

function applyPropertyPinVisual(root: HTMLDivElement, visual: HTMLDivElement, property: PropertyCardData) {
  root.dataset.signature = `${property.price}|${property.currency}|${property.tour3d}`;
  root.setAttribute(
    "aria-label",
    `${property.title}, ${new Intl.NumberFormat("es-AR").format(property.price)} ${property.currency}`
  );

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
}

/** Escala visual cuando el pin corresponde a la card en hover/selección (opera sobre `.pin-visual`, nunca sobre la raíz). */
export function setPinHighlighted(markerRoot: HTMLElement, highlighted: boolean) {
  const visual = markerRoot.querySelector<HTMLElement>(".pin-visual");
  if (!visual) return;
  visual.style.transform = highlighted ? "scale(1.25) translateY(-2px)" : "";
  markerRoot.style.zIndex = highlighted ? "10" : "";
}
