/**
 * Márgenes del mapa tapados por las capas que flotan encima (barra superior, panel de resultados, botón "Ver N
 * propiedades"). Cada capa se declara con `data-map-inset="top|left|bottom|right"` y acá se MIDE su caja real: así
 * el encuadre inicial y el auto-centrado de la tarjeta no dependen de números copiados del CSS (que se desfasan
 * cuando el panel aparece en un ancho distinto, la barra crece con el filtro de inmobiliaria, etc.).
 */
export type MapInsets = { top: number; right: number; bottom: number; left: number };

const BASE_GAP = 8;

export function measureMapInsets(container: HTMLElement): MapInsets {
  const box = container.getBoundingClientRect();
  const insets: MapInsets = { top: BASE_GAP, right: BASE_GAP, bottom: BASE_GAP, left: BASE_GAP };

  for (const el of document.querySelectorAll<HTMLElement>("[data-map-inset]")) {
    const r = el.getBoundingClientRect();
    // Las capas ocultas (p. ej. el panel de escritorio en el celular) miden 0: no cuentan.
    if (r.width === 0 || r.height === 0) continue;
    switch (el.dataset.mapInset) {
      case "top":
        insets.top = Math.max(insets.top, r.bottom - box.top + BASE_GAP);
        break;
      case "bottom":
        insets.bottom = Math.max(insets.bottom, box.bottom - r.top + BASE_GAP);
        break;
      case "left":
        insets.left = Math.max(insets.left, r.right - box.left + BASE_GAP * 1.5);
        break;
      case "right":
        insets.right = Math.max(insets.right, box.right - r.left + BASE_GAP * 1.5);
        break;
    }
  }

  // Nunca más de la mitad del mapa por lado: un margen imposible dejaría el área libre sin tamaño.
  const maxX = box.width * 0.45;
  const maxY = box.height * 0.45;
  return {
    top: Math.min(insets.top, maxY),
    bottom: Math.min(insets.bottom, maxY),
    left: Math.min(insets.left, maxX),
    right: Math.min(insets.right, maxX),
  };
}

/**
 * Cuánto hay que desplazar el mapa (en píxeles) para que un bloque "tarjeta + pin" quede centrado en el área libre.
 * `tip` es dónde está hoy la punta del pin dentro del mapa; `blockWidth`/`blockHeight` son el ancho de la tarjeta y
 * el alto de tarjeta + separación hasta la punta. Devuelve `null` si ya está bien (menos de `tolerance` px de error).
 */
export function panToCenterBlock(args: {
  tip: { x: number; y: number };
  blockWidth: number;
  blockHeight: number;
  mapSize: { width: number; height: number };
  insets: MapInsets;
  tolerance?: number;
}): { dx: number; dy: number } | null {
  const { tip, blockWidth, blockHeight, mapSize, insets, tolerance = 24 } = args;
  const freeLeft = insets.left;
  const freeRight = mapSize.width - insets.right;
  const freeTop = insets.top;
  const freeBottom = mapSize.height - insets.bottom;

  // Horizontal: centrado en el área libre; si la tarjeta es más ancha que el área, queda centrada en el mapa entero.
  const freeWidth = freeRight - freeLeft;
  const targetX = freeWidth >= blockWidth ? (freeLeft + freeRight) / 2 : mapSize.width / 2;

  // Vertical: el bloque entero centrado en el área libre, pero sin que el borde de la tarjeta pase debajo de la barra de arriba.
  const targetY = Math.max((freeTop + freeBottom) / 2 + blockHeight / 2, freeTop + blockHeight);

  const dx = tip.x - targetX;
  const dy = tip.y - targetY;
  if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) return null;
  return { dx, dy };
}
