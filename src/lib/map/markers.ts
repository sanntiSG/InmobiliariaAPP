import { formatCompactNumber, formatPriceCompact } from "@/lib/utils/format";
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

/**
 * Pill con el precio (estilo Redfin/Zillow/Google Maps) en vez de un
 * teardrop genérico: es lo que hace que un mapa "se lea" como un mapa de
 * propiedades — ver UIreference 1 y 3. `anchor: "bottom"` en MapCanvas hace
 * que la punta de la cola (abajo del todo) sea el punto exacto de la
 * propiedad, así que el pin crece hacia arriba sin correr las coordenadas.
 */
const PILL_NEUTRAL =
  "pin-pill flex items-center gap-1 whitespace-nowrap rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-display font-semibold text-text shadow-float transition-colors duration-150 [transition-timing-function:var(--ease-out)]";
const PILL_ACCENT =
  "pin-pill flex items-center gap-1 whitespace-nowrap rounded-pill border border-accent bg-accent px-2.5 py-1 text-xs font-display font-semibold text-accent-contrast shadow-float transition-colors duration-150 [transition-timing-function:var(--ease-out)]";
const TAIL_NEUTRAL =
  "pin-tail -mt-[3px] h-2 w-2 rotate-45 rounded-[1px] border-b border-r border-border bg-surface transition-colors duration-150 [transition-timing-function:var(--ease-out)]";
const TAIL_ACCENT =
  "pin-tail -mt-[3px] h-2 w-2 rotate-45 rounded-[1px] border-b border-r border-accent bg-accent transition-colors duration-150 [transition-timing-function:var(--ease-out)]";

/** Ícono de órbita 360° — mismo lenguaje visual que TourBadge, a escala de pin. */
const TOUR_GLYPH = `
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
    <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" stroke-width="2" />
    <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" stroke-width="2" transform="rotate(60 12 12)" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
`;

export function createPropertyPinElement(property: PropertyCardData): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "inline-block";
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "0");

  const visual = document.createElement("div");
  visual.className =
    "pin-visual flex flex-col items-center cursor-pointer select-none transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5";
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
    <div class="${PILL_NEUTRAL}">
      ${property.tour3d ? TOUR_GLYPH : ""}
      <span>${formatPriceCompact(property.price, property.currency)}</span>
    </div>
    <div class="${TAIL_NEUTRAL}"></div>
  `;
}

/**
 * Escala visual + resalta en acento cuando el pin corresponde a la card en
 * hover/selección (opera sobre `.pin-visual` y sus hijos, nunca sobre la
 * raíz — ver comentario de arriba sobre por qué).
 */
export function setPinHighlighted(markerRoot: HTMLElement, highlighted: boolean) {
  const visual = markerRoot.querySelector<HTMLElement>(".pin-visual");
  if (!visual) return;
  visual.style.transform = highlighted ? "scale(1.06) translateY(-2px)" : "";
  markerRoot.style.zIndex = highlighted ? "10" : "";

  const pill = visual.querySelector<HTMLElement>(".pin-pill");
  if (pill) pill.className = highlighted ? PILL_ACCENT : PILL_NEUTRAL;
  const tail = visual.querySelector<HTMLElement>(".pin-tail");
  if (tail) tail.className = highlighted ? TAIL_ACCENT : TAIL_NEUTRAL;
}
