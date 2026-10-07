import { formatCompactNumber } from "@/lib/utils/format";
import { thumbUrl } from "@/lib/images/loader";
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
 * Pin de propiedad = logo de la inmobiliaria en un círculo (con la inicial si no tiene logo) y una
 * cola chica que marca el punto exacto — `anchor: "bottom"` en MapCanvas hace que la punta sea la
 * ubicación real. Con poco zoom se ve sólo un punto de acento para no llenar el mapa de logos
 * (`setPinDetail`, controlado desde MapCanvas por el nivel de zoom). El precio ya no va en el pin:
 * se ve en el popup al tocarlo y en las tarjetas del panel.
 */
const BADGE_BASE =
  "pin-badge relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-[3px] bg-surface shadow-float font-display text-base font-bold text-accent transition-[border-color] duration-150 [transition-timing-function:var(--ease-out)]";
const BADGE_NEUTRAL = `${BADGE_BASE} border-white`;
const BADGE_ACCENT = `${BADGE_BASE} border-accent`;
const TAIL_BASE =
  "pin-tail -mt-[5px] h-2.5 w-2.5 rotate-45 rounded-[2px] shadow-float transition-colors duration-150 [transition-timing-function:var(--ease-out)]";
const TAIL_NEUTRAL = `${TAIL_BASE} bg-white`;
const TAIL_ACCENT = `${TAIL_BASE} bg-accent`;
const DOT_CLASS =
  "pin-dot h-3.5 w-3.5 rounded-full border-2 border-white bg-accent shadow-float";

/** Ícono de órbita 360° — mismo lenguaje visual que TourBadge, a escala de pin. */
const SVG_NS = "http://www.w3.org/2000/svg";
function createTourGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "10");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  for (const rotate of [null, "rotate(60 12 12)"]) {
    const e = document.createElementNS(SVG_NS, "ellipse");
    e.setAttribute("cx", "12");
    e.setAttribute("cy", "12");
    e.setAttribute("rx", "9");
    e.setAttribute("ry", "4");
    e.setAttribute("stroke", "currentColor");
    e.setAttribute("stroke-width", "2");
    if (rotate) e.setAttribute("transform", rotate);
    svg.appendChild(e);
  }
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", "12");
  c.setAttribute("cy", "12");
  c.setAttribute("r", "2");
  c.setAttribute("fill", "currentColor");
  svg.appendChild(c);
  return svg;
}

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

function pinSignature(property: PropertyCardData): string {
  return [property.agencyLogo ?? "", property.agencyName ?? "", property.tour3d, property.price, property.currency].join("|");
}

/** Refresca el contenido del pin si la propiedad o su inmobiliaria cambiaron desde la última vez. */
export function updatePropertyPinElement(root: HTMLDivElement, property: PropertyCardData) {
  if (root.dataset.signature === pinSignature(property)) return;
  const visual = root.querySelector<HTMLDivElement>(".pin-visual");
  if (visual) applyPropertyPinVisual(root, visual, property);
}

function applyPropertyPinVisual(root: HTMLDivElement, visual: HTMLDivElement, property: PropertyCardData) {
  root.dataset.signature = pinSignature(property);
  root.dataset.logo = property.agencyLogo ? thumbUrl(property.agencyLogo, 128) : "";
  root.setAttribute(
    "aria-label",
    `${property.title}${property.agencyName ? `, ${property.agencyName}` : ""}, ${new Intl.NumberFormat("es-AR").format(property.price)} ${property.currency}`
  );

  const dot = document.createElement("div");
  dot.className = DOT_CLASS;

  const detail = document.createElement("div");
  detail.className = "pin-detail flex flex-col items-center";
  const badge = document.createElement("div");
  badge.className = BADGE_NEUTRAL;
  const initial = document.createElement("span");
  initial.className = "pin-initial";
  initial.textContent = (property.agencyName?.trim()[0] ?? "•").toUpperCase();
  badge.appendChild(initial);
  if (property.tour3d) {
    const tour = document.createElement("span");
    tour.className =
      "pointer-events-none absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-contrast";
    tour.appendChild(createTourGlyph());
    badge.appendChild(tour);
  }
  const tail = document.createElement("div");
  tail.className = TAIL_NEUTRAL;
  detail.append(badge, tail);

  visual.replaceChildren(dot, detail);
  setPinDetail(root, root.dataset.detail === "1");
}

/**
 * Alterna entre punto (zoom lejano) y pin con logo (zoom cercano). El logo se pide recién la primera
 * vez que hace falta, para no bajar decenas de imágenes con el mapa alejado.
 */
export function setPinDetail(markerRoot: HTMLElement, detail: boolean) {
  markerRoot.dataset.detail = detail ? "1" : "0";
  const dot = markerRoot.querySelector<HTMLElement>(".pin-dot");
  const box = markerRoot.querySelector<HTMLElement>(".pin-detail");
  if (!dot || !box) return;
  dot.style.display = detail ? "none" : "";
  box.style.display = detail ? "" : "none";
  const logo = markerRoot.dataset.logo;
  if (detail && logo && !box.querySelector("img")) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.className = "absolute inset-0 h-full w-full bg-surface object-cover";
    // Si el logo no carga queda la inicial que está debajo.
    img.addEventListener("error", () => img.remove());
    img.src = logo;
    box.querySelector(".pin-badge")?.prepend(img);
  }
}

/**
 * Escala visual + resalta en acento cuando el pin corresponde a la card en
 * hover/selección (opera sobre `.pin-visual` y sus hijos, nunca sobre la
 * raíz — ver comentario de arriba sobre por qué).
 */
export function setPinHighlighted(markerRoot: HTMLElement, highlighted: boolean) {
  const visual = markerRoot.querySelector<HTMLElement>(".pin-visual");
  if (!visual) return;
  visual.style.transform = highlighted ? "scale(1.12) translateY(-2px)" : "";
  markerRoot.style.zIndex = highlighted ? "10" : "";

  const badge = visual.querySelector<HTMLElement>(".pin-badge");
  if (badge) badge.className = highlighted ? BADGE_ACCENT : BADGE_NEUTRAL;
  const tail = visual.querySelector<HTMLElement>(".pin-tail");
  if (tail) tail.className = highlighted ? TAIL_ACCENT : TAIL_NEUTRAL;
  const dot = visual.querySelector<HTMLElement>(".pin-dot");
  if (dot) dot.style.transform = highlighted ? "scale(1.4)" : "";
}
