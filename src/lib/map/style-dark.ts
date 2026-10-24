import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Estilo base: OpenFreeMap "dark" — mismo proveedor gratuito que el estilo
 * claro, sin API key ni límite de uso.
 */
export const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Repinta capas puntuales para acercar el estilo dark a la paleta de marca. */
export function applyDarkBrandTint(map: MapLibreMap) {
  const setIfExists = (layerId: string, color: string) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "fill-color", color);
    }
  };
  if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#0c0d0f");
  setIfExists("water", "#12181e");
  setIfExists("building", "#1a1c20");
  setIfExists("park", "#12201a");
}
