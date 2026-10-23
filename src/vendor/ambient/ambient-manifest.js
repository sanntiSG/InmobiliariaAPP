// Pure helpers for experience.json (schemaVersion 1): validation, URL resolution, variant and
// format choice. No DOM access, so every function is unit-testable in Node.

export const SCHEMA_VERSION = 1;
// [minimum, maximum] of every weather parameter. REQUIRED_PARAMS are in every manifest; the others were
// added later and are optional there (OPTIONAL_DEFAULTS fill them), so older experiences keep working.
export const PARAM_BOUNDS = Object.freeze({
  cloudSpeed: [0, 3], cloudMod: [0, 1], wind: [0, 1], gust: [0, 1], rain: [0, 1], wetness: [0, 1],
  lightsOn: [0, 1], stars: [0, 1], cloudCover: [0, 1], gustPeriod: [4, 40], windDirection: [-1, 1],
});
export const REQUIRED_PARAMS = Object.freeze(['cloudSpeed', 'cloudMod', 'wind', 'gust', 'rain', 'wetness', 'lightsOn', 'stars']);
export const OPTIONAL_DEFAULTS = Object.freeze({ cloudCover: 0, gustPeriod: 16, windDirection: 1 });

/** Every parameter present: the manifest's values over the defaults of the optional ones. */
export function normalizeParams(params) {
  return { ...OPTIONAL_DEFAULTS, ...params };
}

export function clampParam(key, value) {
  const [low, high] = PARAM_BOUNDS[key];
  return Math.min(Math.max(value, low), high);
}

const PLATE_FILE = /^[a-z0-9-]+\.(desktop|mobile)\.[0-9a-f]{12}\.(avif|webp)$/;
const LAYER_FILE = /^[a-z0-9-]+\.(desktop|mobile)\.[0-9a-f]{12}\.webp$/;
const LAYERS = ['masks', 'lights', 'lightOrder'];

function fail(message) { throw new Error(`Invalid experience manifest: ${message}`); }

function validateAsset(entry, name, pattern) {
  if (!entry || typeof entry !== 'object') fail(`${name} is missing`);
  if (typeof entry.file !== 'string' || !pattern.test(entry.file)) fail(`${name} has an unsafe or unexpected file name`);
  for (const key of ['bytes', 'width', 'height']) {
    if (!Number.isInteger(entry[key]) || entry[key] <= 0) fail(`${name}.${key} must be a positive integer`);
  }
}

export function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion must be 1');
  if (typeof manifest.propertyId !== 'string' || !manifest.propertyId) fail('propertyId is required');
  if (typeof manifest.disclosure !== 'string' || !manifest.disclosure.trim()) fail('disclosure is required');
  const variants = manifest.variants;
  if (!variants || typeof variants !== 'object' || !variants.desktop) fail('variants must include desktop');
  for (const name of Object.keys(variants)) if (!['desktop', 'mobile'].includes(name)) fail(`unknown variant ${name}`);
  if (!Array.isArray(manifest.formats) || !manifest.formats.includes('webp')) fail('formats must include webp');
  if (!Number.isInteger(manifest.transitionMs) || manifest.transitionMs < 300 || manifest.transitionMs > 10000) fail('transitionMs must be 300-10000');
  if (!Array.isArray(manifest.aspect) || manifest.aspect.length !== 2 || !manifest.aspect.every(Number.isFinite)) fail('aspect must be [width, height]');
  if (!Array.isArray(manifest.focus) || manifest.focus.length !== 2 || !manifest.focus.every(v => v >= 0 && v <= 1)) fail('focus must be [x, y] in 0-1');
  const layers = manifest.layers;
  if (!layers || LAYERS.some(key => !(key in layers))) fail('layers needs masks, lights and lightOrder');
  if ((layers.lights == null) !== (layers.lightOrder == null)) fail('lights and lightOrder go together');
  for (const key of LAYERS) {
    if (layers[key] == null) continue;
    for (const variant of Object.keys(variants)) validateAsset(layers[key][variant], `layers.${key}.${variant}`, LAYER_FILE);
  }
  if (layers.masks == null) fail('layers.masks is required');
  if (!Array.isArray(manifest.states) || !manifest.states.length) fail('states must be a nonempty array');
  const ids = new Set();
  for (const state of manifest.states) {
    if (typeof state?.id !== 'string' || !state.id || ids.has(state.id)) fail(`state id missing or duplicated: ${state?.id}`);
    ids.add(state.id);
    if (typeof state.label !== 'string' || !state.label.trim()) fail(`state ${state.id} needs a label`);
    for (const key of Object.keys(state.params ?? {})) {
      if (!(key in PARAM_BOUNDS)) fail(`state ${state.id} has an unknown param: ${key}`);
    }
    for (const [key, [low, high]] of Object.entries(PARAM_BOUNDS)) {
      const value = state.params?.[key];
      if (value === undefined && !REQUIRED_PARAMS.includes(key)) continue; // optional, filled by defaults
      if (!Number.isFinite(value) || value < low || value > high) fail(`state ${state.id} param ${key} is out of range`);
    }
    for (const variant of Object.keys(variants)) {
      for (const format of manifest.formats) validateAsset(state.plates?.[variant]?.[format], `state ${state.id}.${variant}.${format}`, PLATE_FILE);
    }
  }
  if (!ids.has(manifest.initialState)) fail('initialState must name a state');
  return manifest;
}

/** Absolute form of `url`; a site-relative manifest URL resolves against `base` (the page). */
export function absoluteUrl(url, base = globalThis.location?.href) {
  try {
    return new URL(url, base).href;
  } catch {
    throw new Error(`Cannot resolve "${url}": pass an absolute manifest URL outside a browser page`);
  }
}

export function resolveAsset(manifestUrl, file, base) {
  if (!PLATE_FILE.test(file) && !LAYER_FILE.test(file)) throw new Error(`Refusing unexpected asset name: ${file}`);
  return new URL(file, absoluteUrl(manifestUrl, base)).href;
}

/** Choose the smaller variant for narrow screens, Save-Data and slow links. */
export function pickVariant(manifest, { cssWidth = 1280, dpr = 1, saveData = false } = {}) {
  const mobile = manifest.variants.mobile;
  if (!mobile) return 'desktop';
  const physical = cssWidth * Math.min(Math.max(dpr, 1), 2);
  return saveData || physical <= mobile.width * 1.1 ? 'mobile' : 'desktop';
}

/** AVIF when the browser decodes it and the manifest has it; otherwise the WebP baseline. */
export function pickFormat(manifest, supports = {}) {
  return supports.avif && manifest.formats.includes('avif') ? 'avif' : 'webp';
}

export function findState(manifest, id) {
  return manifest.states.find(state => state.id === id);
}

export function plateUrl(manifest, manifestUrl, id, variant, format) {
  const state = findState(manifest, id);
  if (!state) throw new Error(`Unknown state: ${id}`);
  return resolveAsset(manifestUrl, state.plates[variant][format].file);
}

export function layerUrls(manifest, manifestUrl, variant) {
  const out = {};
  for (const key of LAYERS) out[key] = manifest.layers[key] ? resolveAsset(manifestUrl, manifest.layers[key][variant].file) : null;
  return out;
}

/** Cover-fit transform from screen uv to image uv, keeping `focus` in view. */
export function coverTransform(canvasAspect, imageAspect, focus) {
  const scale = canvasAspect > imageAspect ? [1, imageAspect / canvasAspect] : [canvasAspect / imageAspect, 1];
  const offset = scale.map((s, i) => Math.min(Math.max(focus[i] - s / 2, 0), 1 - s));
  return { scale, offset };
}
