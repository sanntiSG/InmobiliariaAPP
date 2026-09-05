import { setWorkerUrl } from "maplibre-gl";

let configured = false;

/**
 * Hay que llamar a esto ANTES de crear cualquier `new maplibregl.Map(...)`.
 *
 * Por qué existe: maplibre-gl calcula la URL de su propio worker a partir
 * de `import.meta.url` del módulo empaquetado, y solo la usa si "parece"
 * una URL http(s) real. Con Turbopack (bundler de Next.js 16) ese
 * `import.meta.url` no resuelve a algo así dentro del paquete de la
 * librería, la detección devuelve "" y el `new Worker("", {type:"module"})`
 * que arma MapLibre nunca llega a cargar su script — sin tirar ningún error
 * visible. El síntoma es un mapa que "carga" (el evento `load` dispara, la
 * atribución aparece) pero nunca pinta nada más que el layer "background"
 * (un color plano): todas las tiles y glyphs quedan atascadas en estado
 * "loading" para siempre porque el worker que las decodifica nunca arrancó.
 *
 * `setWorkerUrl` evita por completo esa autodetección. El archivo al que
 * apunta se sirve desde /public (ver scripts/copy-maplibre-worker.mjs, que
 * lo copia ahí en cada `npm install` junto a su import relativo
 * `maplibre-gl-shared.mjs`, del que depende).
 */
export function ensureMapLibreWorkerUrl() {
  if (configured) return;
  configured = true;
  setWorkerUrl("/maplibre-gl-worker.mjs");
}
