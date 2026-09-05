// Copia el worker de maplibre-gl a /public en cada `npm install`.
//
// Por qué existe esto: maplibre-gl detecta la URL de su propio worker a
// partir de `import.meta.url` del módulo empaquetado. Con Turbopack (el
// bundler de Next.js 16), ese `import.meta.url` no resuelve a una URL
// http(s) real dentro del paquete de la librería, así que la detección
// devuelve "" y el `new Worker("", {type:"module"})` que arma MapLibre
// nunca llega a cargar su script: todas las tiles y glyphs quedan
// atascadas en estado "loading" para siempre, el mapa solo pinta el layer
// "background" (un color plano) y nunca las calles/agua/edificios/textos,
// sin ningún error visible en consola. Ver `src/lib/map/worker-url.ts`,
// que llama a `maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")` para
// evitar por completo esa detección automática.
//
// El worker importa un sibling (`./maplibre-gl-shared.mjs`) con un import
// relativo, así que ambos archivos tienen que quedar servidos desde el
// mismo directorio — por eso van los dos a la raíz de /public.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "node_modules", "maplibre-gl", "dist");
const destDir = path.join(root, "public");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

async function main() {
  if (!existsSync(srcDir)) {
    console.warn(`[copy-maplibre-worker] ${srcDir} no existe todavía (¿node_modules sin instalar?) — se omite.`);
    return;
  }
  await mkdir(destDir, { recursive: true });
  for (const file of files) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (!existsSync(src)) {
      console.warn(`[copy-maplibre-worker] falta ${src} — ¿cambió la estructura de maplibre-gl?`);
      continue;
    }
    await copyFile(src, dest);
  }
  console.log("[copy-maplibre-worker] worker de maplibre-gl copiado a /public.");
}

main().catch((err) => {
  console.error("[copy-maplibre-worker] falló:", err);
  // No rompe el install/build por esto — el mapa quedaría sin tiles, pero
  // el resto de la plataforma sigue funcionando.
});
