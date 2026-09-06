/**
 * Interpreta la URL que el usuario pega para el recorrido 3D / Digital Twin.
 *
 * Es la única fuente de verdad para tres consumidores que antes hacían cada
 * uno su propia interpretación (o ninguna):
 * - el formulario del dashboard, para mostrarle al usuario qué detectó
 *   ANTES de guardar (`PropertyForm.tsx`);
 * - la validación del server, para no persistir una URL rota o peligrosa
 *   (`validation/property.ts`);
 * - el render público, para arreglar sobre la marcha URLs que ya quedaron
 *   guardadas en su forma no embebible (`PropertyMedia.tsx`).
 *
 * El caso que motivó esto: un usuario copia el link de Polycam desde la
 * página de la captura (`poly.cam/capture/<id>`) — esa es la página de
 * "share", pensada para abrirse en una pestaña, y responde
 * `X-Frame-Options: deny`. La forma que sí se puede embeber en un iframe es
 * `poly.cam/capture/<id>/embed`. Acá se corrige eso (y lo equivalente para
 * los demás proveedores) automáticamente.
 */

export type TourProvider = "matterport" | "polycam" | "kuula" | "sketchfab" | "custom";

export type TourEmbed =
  | { kind: "iframe"; url: string; provider: TourProvider; label: string }
  | { kind: "mesh"; url: string; format: "glb" | "gltf" | "usdz"; provider: TourProvider; label: string }
  | { kind: "invalid"; reason: string };

/**
 * El visor propio de Polycam (`poly.cam/capture/<id>/embed`) renderiza con
 * WebGPU, no WebGL — confirmado con el reporte de un usuario en Safari
 * ("3D models can't load on this browser") + la propia respuesta de
 * Polycam ("Polycam renders 3D with WebGPU"). WebGPU recién llegó a Safari
 * en la versión 26 (iOS 26) — casi ningún Safari anterior puede verlo, y
 * Polycam muestra su propio error crudo (en inglés) dentro del iframe.
 * No podemos arreglar el visor de Polycam (es contenido de terceros), pero
 * sí podemos evitar montarlo cuando sabemos que va a fallar (ver
 * `PropertyMedia.tsx`). El resto de los proveedores (Matterport, Kuula,
 * Sketchfab) siguen usando WebGL — sin este problema, por ahora.
 */
export const PROVIDER_REQUIRES_WEBGPU: Record<TourProvider, boolean> = {
  matterport: false,
  polycam: true,
  kuula: false,
  sketchfab: false,
  custom: false,
};

/** true si el navegador actual soporta WebGPU. Siempre false durante SSR (no hay `navigator`). */
export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

const MESH_EXTENSIONS = { ".glb": "glb", ".gltf": "gltf", ".usdz": "usdz" } as const;

export function normalizeTourUrl(raw: string): TourEmbed {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "invalid", reason: "Pegá una URL." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { kind: "invalid", reason: "Esa URL no es válida." };
  }

  // Solo https: bloquea javascript:, data:, http: sin cifrar, etc. — nunca
  // se debe poder guardar algo que no sea una URL http(s) real.
  if (url.protocol !== "https:") {
    return { kind: "invalid", reason: "La URL tiene que empezar con https://" };
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();

  // Archivo 3D propio ya hosteado en algún lado (CDN, GitHub raw, etc.) —
  // se renderiza con <model-viewer>, nunca en un iframe.
  if (ext in MESH_EXTENSIONS) {
    const format = MESH_EXTENSIONS[ext as keyof typeof MESH_EXTENSIONS];
    return {
      kind: "mesh",
      url: url.toString(),
      format,
      provider: guessProvider(host),
      label: `Modelo .${format} — se muestra con el visor 3D`,
    };
  }

  if (host === "poly.cam") {
    const match = path.match(/^\/capture\/([^/]+)/);
    if (!match) {
      return {
        kind: "invalid",
        reason:
          "Ese no es el link de una captura. Abrí la captura en Polycam y copiá el link desde ahí (no el de poly.cam solo).",
      };
    }
    const embedUrl = `https://poly.cam/capture/${match[1]}/embed`;
    return { kind: "iframe", url: embedUrl, provider: "polycam", label: "Polycam detectado" };
  }

  if (host === "matterport.com" || host === "my.matterport.com") {
    // Ya viene en forma embebible (my.matterport.com/show/?m=...).
    if (host === "my.matterport.com" && path.startsWith("/show")) {
      return { kind: "iframe", url: url.toString(), provider: "matterport", label: "Matterport detectado" };
    }
    // matterport.com/discover/space/<id> u otras variantes del sitio
    // principal — se intenta extraer el id y armar la forma embebible.
    const match = path.match(/\/space\/([^/?]+)/) ?? url.searchParams.get("m");
    const modelId = typeof match === "string" ? match : match?.[1];
    if (modelId) {
      return {
        kind: "iframe",
        url: `https://my.matterport.com/show/?m=${modelId}`,
        provider: "matterport",
        label: "Matterport detectado",
      };
    }
    return {
      kind: "invalid",
      reason: "No pude reconocer el link de Matterport. Usá el botón \"Compartir\" del recorrido.",
    };
  }

  if (host === "kuula.co") {
    const withParams = url.searchParams.size > 0 ? url.toString() : `${url.toString()}?fs=1&vr=1&sd=1&thumbs=1`;
    return { kind: "iframe", url: withParams, provider: "kuula", label: "Kuula detectado" };
  }

  if (host === "sketchfab.com") {
    // /3d-models/<slug>-<id> (página del modelo) → /models/<id>/embed (embebible).
    const match = path.match(/-([0-9a-f]{32})$/i) ?? path.match(/^\/models\/([0-9a-f]{32})/i);
    if (match) {
      return {
        kind: "iframe",
        url: `https://sketchfab.com/models/${match[1]}/embed`,
        provider: "sketchfab",
        label: "Sketchfab detectado",
      };
    }
    return { kind: "iframe", url: url.toString(), provider: "sketchfab", label: "Sketchfab detectado" };
  }

  // Proveedor no reconocido: se deja pasar tal cual, con una advertencia —
  // muchos visores (Kuula, iStaging, etc.) sí permiten incrustarse aunque
  // no tengan una regla propia acá.
  return {
    kind: "iframe",
    url: url.toString(),
    provider: "custom",
    label: "No reconocemos este sitio — si al ver la publicación aparece en blanco, es que no permite incrustarse.",
  };
}

function guessProvider(host: string): TourProvider {
  if (host === "poly.cam") return "polycam";
  if (host.endsWith("matterport.com")) return "matterport";
  if (host === "kuula.co") return "kuula";
  if (host === "sketchfab.com") return "sketchfab";
  return "custom";
}
