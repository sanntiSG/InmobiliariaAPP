import { PARAM_BOUNDS, validateManifest } from "@/vendor/ambient/ambient-manifest";
import type { AmbientAsset, AmbientManifest } from "@/vendor/ambient";
import {
  AMBIENT_DISCLOSURE,
  AMBIENT_MANIFEST_FILE,
  AMBIENT_MANIFEST_MAX_BYTES,
  AMBIENT_MAX_FILES,
  AMBIENT_MAX_FILE_BYTES,
  AMBIENT_MAX_STATES,
  AMBIENT_MAX_TOTAL_BYTES,
  AMBIENT_STATE_ID_RE,
} from "./constants";

/**
 * Validación de una portada viva. Corre igual en el navegador (antes de subir nada, para rechazar rápido y con un
 * mensaje claro) y en el servidor (que NO confía en lo que dijo el navegador). Usa `validateManifest` del propio
 * reproductor, que es puro, y le suma lo que el reproductor no revisa: que cada archivo exista, pese lo declarado,
 * sea de verdad una imagen WebP/AVIF y coincida con su hash.
 *
 * Todos los mensajes de error están pensados para mostrarse tal cual a la inmobiliaria.
 */

export type AmbientIssueCode =
  | "no-manifest"
  | "many-manifests"
  | "bad-json"
  | "bad-manifest"
  | "too-many-files"
  | "total-too-big"
  | "missing-file"
  | "too-big"
  | "bad-size"
  | "bad-type"
  | "bad-hash";

export class AmbientValidationError extends Error {
  readonly code: AmbientIssueCode;
  constructor(code: AmbientIssueCode, message: string) {
    super(message);
    this.name = "AmbientValidationError";
    this.code = code;
  }
}

/** Un archivo de la carpeta que se subió: su ruta relativa, su peso y cómo leerlo (se lee de a uno, no todo junto). */
export type FolderEntry = { path: string; size: number; read: () => Promise<Uint8Array> };

/** Un archivo que el manifest declara y que hay que subir. */
export type AmbientRef = { name: string; bytes: number; sha256?: string; label: string };

const VARIANT_LABEL: Record<string, string> = { desktop: "pantalla grande", mobile: "celular" };
const LAYER_LABEL = {
  masks: "las zonas de cielo, plantas y suelo",
  lights: "las luces",
  lightOrder: "el orden de encendido de las luces",
} as const;
const SHA256_RE = /^[0-9a-f]{64}$/i;
/** Los nombres reales miden ~35 caracteres; el storage acepta hasta 120. */
const MAX_FILE_NAME = 80;
const HASH_IN_NAME_RE = /\.([0-9a-f]{12})\.(?:avif|webp)$/;

/** Ruta normalizada con `/`, sin `./` ni `/` inicial; "" si es basura del sistema (carpetas ocultas de macOS, `..`, etc.). */
export function normalizeEntryPath(raw: string): string {
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.includes("..")) return "";
  if (parts[0] === "__MACOSX" || parts.some((p) => p === ".DS_Store" || p.startsWith("._"))) return "";
  return parts.join("/");
}

const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const dirName = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

function describeList(items: string[]): string {
  const shown = items.slice(0, 3).join(", ");
  return items.length > 3 ? `${shown} y ${items.length - 3} más` : shown;
}

function friendlyManifestError(message: string): string {
  const m = message.replace(/^Invalid experience manifest: /, "");
  if (/schemaVersion/.test(m)) return "La versión de esta portada no es compatible con la plataforma.";
  if (/unsafe or unexpected file name/.test(m)) return "Hay un archivo con un nombre que no corresponde a una portada viva.";
  if (/param .* out of range|unknown param/.test(m)) return "Los ajustes de clima de un estado tienen valores que no corresponden.";
  if (/transitionMs/.test(m)) return "La duración de las transiciones no es válida.";
  if (/states must be|state id|needs a label|initialState/.test(m)) return "Los estados (día, noche, lluvia…) no están bien definidos.";
  return "El archivo experience.json no tiene el formato de una portada viva.";
}

/** Lee y valida el texto de `experience.json`. Devuelve el manifest tal cual (para guardar, usar `sanitizeManifest`). */
export function parseManifestText(text: string): AmbientManifest {
  if (text.length > AMBIENT_MANIFEST_MAX_BYTES) {
    throw new AmbientValidationError("bad-manifest", "El archivo experience.json es demasiado grande para ser de una portada viva.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AmbientValidationError("bad-json", "El archivo experience.json está dañado o no es un JSON válido.");
  }
  let manifest: AmbientManifest;
  try {
    manifest = validateManifest(raw);
  } catch (err) {
    throw new AmbientValidationError("bad-manifest", friendlyManifestError(err instanceof Error ? err.message : ""));
  }

  // Lo que el reproductor no revisa: cantidad y forma de los estados, hashes bien escritos y topes de peso.
  if (manifest.states.length > AMBIENT_MAX_STATES) {
    throw new AmbientValidationError("bad-manifest", `La portada trae demasiados estados (el máximo es ${AMBIENT_MAX_STATES}).`);
  }
  for (const state of manifest.states) {
    if (!AMBIENT_STATE_ID_RE.test(state.id) || state.label.length > 40) {
      throw new AmbientValidationError("bad-manifest", "Los estados (día, noche, lluvia…) no están bien definidos.");
    }
  }
  const refs = referencedFiles(manifest);
  for (const ref of refs) {
    const asset = findAsset(manifest, ref.name);
    if (asset?.sha256 !== undefined && !SHA256_RE.test(asset.sha256)) {
      throw new AmbientValidationError("bad-manifest", "El archivo experience.json trae un código de verificación mal escrito.");
    }
    if (ref.name.length > MAX_FILE_NAME) {
      throw new AmbientValidationError("bad-manifest", "Hay un archivo con un nombre demasiado largo para ser de una portada viva.");
    }
  }
  if (refs.length > AMBIENT_MAX_FILES) {
    throw new AmbientValidationError("too-many-files", `La carpeta trae demasiados archivos (el máximo es ${AMBIENT_MAX_FILES}).`);
  }
  const oversized = refs.filter((r) => r.bytes > AMBIENT_MAX_FILE_BYTES);
  if (oversized.length > 0) {
    throw new AmbientValidationError("too-big", `Hay imágenes demasiado pesadas (más de ${mb(AMBIENT_MAX_FILE_BYTES)} MB cada una): ${describeList(oversized.map((r) => r.name))}.`);
  }
  if (refs.reduce((sum, r) => sum + r.bytes, 0) > AMBIENT_MAX_TOTAL_BYTES) {
    throw new AmbientValidationError("total-too-big", `La carpeta pesa más de ${mb(AMBIENT_MAX_TOTAL_BYTES)} MB en total.`);
  }
  return manifest;
}

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

function layerAssets(manifest: AmbientManifest) {
  return (["masks", "lights", "lightOrder"] as const).flatMap((key) => {
    const layer = manifest.layers[key];
    return layer ? Object.keys(manifest.variants).map((variant) => ({ key, variant, asset: layer[variant] })) : [];
  });
}

/** Todos los archivos que el manifest necesita, sin repetir (el estado "viento" suele compartir imagen con "día"). */
export function referencedFiles(manifest: AmbientManifest): AmbientRef[] {
  const out = new Map<string, AmbientRef>();
  const add = (asset: AmbientAsset | undefined, label: string) => {
    if (asset && !out.has(asset.file)) out.set(asset.file, { name: asset.file, bytes: asset.bytes, sha256: asset.sha256, label });
  };
  for (const { key, variant, asset } of layerAssets(manifest)) add(asset, `${LAYER_LABEL[key]} (${VARIANT_LABEL[variant] ?? variant})`);
  for (const state of manifest.states) {
    for (const variant of Object.keys(manifest.variants)) {
      for (const format of manifest.formats) {
        add(state.plates[variant]?.[format], `el estado «${state.label}» (${VARIANT_LABEL[variant] ?? variant}, ${format.toUpperCase()})`);
      }
    }
  }
  return [...out.values()];
}

function findAsset(manifest: AmbientManifest, file: string): AmbientAsset | undefined {
  for (const { asset } of layerAssets(manifest)) if (asset?.file === file) return asset;
  for (const state of manifest.states) {
    for (const byFormat of Object.values(state.plates)) for (const asset of Object.values(byFormat)) if (asset.file === file) return asset;
  }
  return undefined;
}

/**
 * Copia del manifest con SÓLO lo que el reproductor usa. Descarta cualquier campo de más, pisa el aviso con el texto
 * estándar (la licencia exige mostrarlo y no se confía en el del archivo), y pone el id de la portada como `propertyId`.
 */
export function sanitizeManifest(raw: AmbientManifest, coverId: string): AmbientManifest {
  const pickAsset = (a: AmbientAsset): AmbientAsset => ({
    file: a.file,
    bytes: a.bytes,
    ...(a.sha256 ? { sha256: a.sha256.toLowerCase() } : {}),
    width: a.width,
    height: a.height,
  });
  const variants = Object.keys(raw.variants);
  const byVariant = (record: Record<string, AmbientAsset>) => Object.fromEntries(variants.map((v) => [v, pickAsset(record[v]!)]));

  const clean: AmbientManifest = {
    schemaVersion: 1,
    propertyId: coverId,
    disclosure: AMBIENT_DISCLOSURE,
    aspect: [raw.aspect[0], raw.aspect[1]],
    focus: [raw.focus[0], raw.focus[1]],
    initialState: raw.initialState,
    transitionMs: raw.transitionMs,
    variants: Object.fromEntries(variants.map((v) => [v, { width: raw.variants[v]!.width, height: raw.variants[v]!.height }])),
    formats: raw.formats.filter((f) => f === "avif" || f === "webp"),
    layers: {
      masks: byVariant(raw.layers.masks!),
      lights: raw.layers.lights ? byVariant(raw.layers.lights) : null,
      lightOrder: raw.layers.lightOrder ? byVariant(raw.layers.lightOrder) : null,
    },
    states: raw.states.map((state) => ({
      id: state.id,
      label: state.label.trim().slice(0, 40),
      plates: Object.fromEntries(
        variants.map((v) => [v, Object.fromEntries(raw.formats.filter((f) => f === "avif" || f === "webp").map((f) => [f, pickAsset(state.plates[v]![f]!)]))])
      ),
      params: Object.fromEntries(Object.keys(state.params ?? {}).filter((k) => k in PARAM_BOUNDS).map((k) => [k, state.params[k]!])),
    })),
  };
  return validateManifest(clean); // red de seguridad: lo que se guarda tiene que pasar el mismo validador que el reproductor
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < Math.min(to, bytes.length); i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

/** La firma real del archivo (no la extensión): un `.png` renombrado a `.webp` no pasa. */
function isRealImage(name: string, bytes: Uint8Array): boolean {
  if (name.endsWith(".webp")) return bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  if (name.endsWith(".avif")) return bytes.length > 16 && ascii(bytes, 4, 8) === "ftyp" && /avif|avis/.test(ascii(bytes, 8, 32));
  return false;
}

/**
 * Verifica un archivo ya leído contra lo que dice el manifest: peso, firma real y hash. Devuelve su `sha256`.
 * Si el manifest no declara `sha256`, se usa el hash que lleva el nombre del archivo (sus primeros 12 caracteres).
 */
export async function verifyFileBytes(ref: AmbientRef, data: Uint8Array): Promise<string> {
  if (data.length > AMBIENT_MAX_FILE_BYTES) {
    throw new AmbientValidationError("too-big", `La imagen ${ref.name} es demasiado pesada (más de ${mb(AMBIENT_MAX_FILE_BYTES)} MB).`);
  }
  if (data.length !== ref.bytes) {
    throw new AmbientValidationError("bad-size", `La imagen ${ref.name} no coincide con la carpeta: puede estar incompleta o ser de otra portada.`);
  }
  if (!isRealImage(ref.name, data)) {
    throw new AmbientValidationError("bad-type", `El archivo ${ref.name} no es una imagen ${ref.name.endsWith(".avif") ? "AVIF" : "WebP"} válida.`);
  }
  const actual = await sha256Hex(data);
  const declared = ref.sha256?.toLowerCase();
  const inName = ref.name.match(HASH_IN_NAME_RE)?.[1];
  const matches = declared ? actual === declared : inName ? actual.startsWith(inName) : true;
  if (!matches) {
    throw new AmbientValidationError("bad-hash", `La imagen ${ref.name} no coincide con la carpeta: fue modificada o es de otra portada.`);
  }
  return actual;
}

export type ValidatedFolder = {
  /** Manifest tal cual vino (ya validado); para guardar usar `sanitizeManifest`. */
  manifest: AmbientManifest;
  refs: AmbientRef[];
  /** Los archivos a subir, ya leídos y verificados. */
  files: { ref: AmbientRef; entry: FolderEntry; sha256: string }[];
};

/**
 * Valida una carpeta completa (la que arrastró la inmobiliaria o salió de un .zip). Busca `experience.json` en
 * cualquier subcarpeta, e ignora todo lo que no usa (`vendor/`, `index.html`, `LEEME.txt`…). Lanza
 * `AmbientValidationError` con un mensaje listo para mostrar.
 */
export async function validateFolder(
  rawEntries: FolderEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<ValidatedFolder> {
  const entries = rawEntries
    .map((e) => ({ ...e, path: normalizeEntryPath(e.path) }))
    .filter((e) => e.path !== "");

  const manifests = entries.filter((e) => baseName(e.path) === AMBIENT_MANIFEST_FILE);
  if (manifests.length === 0) {
    throw new AmbientValidationError(
      "no-manifest",
      "No encontramos el archivo experience.json. Subí la carpeta completa que te dio el proveedor (la que tiene adentro «ambient»)."
    );
  }
  if (manifests.length > 1) {
    throw new AmbientValidationError("many-manifests", "La carpeta trae más de una portada. Subí una sola por vez.");
  }
  const manifestEntry = manifests[0]!;
  if (manifestEntry.size > AMBIENT_MANIFEST_MAX_BYTES) {
    throw new AmbientValidationError("bad-manifest", "El archivo experience.json es demasiado grande para ser de una portada viva.");
  }
  const manifest = parseManifestText(new TextDecoder().decode(await manifestEntry.read()));
  const refs = referencedFiles(manifest);

  const dir = dirName(manifestEntry.path);
  const siblings = new Map(entries.filter((e) => dirName(e.path) === dir).map((e) => [baseName(e.path), e]));
  const missing = refs.filter((r) => !siblings.has(r.name));
  if (missing.length > 0) {
    throw new AmbientValidationError(
      "missing-file",
      `Faltan ${missing.length === 1 ? "1 imagen" : `${missing.length} imágenes`} de la carpeta: ${describeList(missing.map((r) => r.label))}. Subí la carpeta completa.`
    );
  }

  const files: ValidatedFolder["files"] = [];
  for (const ref of refs) {
    const entry = siblings.get(ref.name)!;
    if (entry.size !== ref.bytes) {
      throw new AmbientValidationError("bad-size", `La imagen ${ref.name} no coincide con la carpeta: puede estar incompleta o ser de otra portada.`);
    }
    files.push({ ref, entry, sha256: await verifyFileBytes(ref, await entry.read()) });
    onProgress?.(files.length, refs.length);
  }
  return { manifest, refs, files };
}
