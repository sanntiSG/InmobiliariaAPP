import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Estilo base: OpenFreeMap "positron" — vectorial, gratis, sin API key y
 * sin límite de requests (https://openfreemap.org). Servido desde su propio
 * CDN, no depende de ningún proveedor de pago.
 */
export const LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Repinta capas puntuales del estilo base para acercarlo a la paleta de
 * marca (tokens --bg/--accent en globals.css) sin reescribir el style.json
 * completo. Los ids de capa vienen del schema OpenMapTiles, compartido por
 * todos los estilos de OpenFreeMap.
 */
export function applyLightBrandTint(map: MapLibreMap) {
  const setIfExists = (layerId: string, color: string) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "fill-color", color);
    }
  };
  setIfExists("water", "#dbe9ff");
  setIfExists("building", "#e7e9ee");
  setIfExists("park", "#e3f0e3");
}
