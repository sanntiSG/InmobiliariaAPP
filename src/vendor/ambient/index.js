// Public entry point. Import the stylesheet separately: import 'img2-ambient-player/style.css'.
export { createAmbientPlayer, DEFAULT_MESSAGES } from './ambient-player.js';
export {
  OPTIONAL_DEFAULTS, PARAM_BOUNDS, REQUIRED_PARAMS, SCHEMA_VERSION, absoluteUrl, clampParam, coverTransform,
  layerUrls, normalizeParams, pickFormat, pickVariant,
  plateUrl, resolveAsset, validateManifest,
} from './ambient-manifest.js';
export { applyIntensity, createTimeline, mixParams, regionProgress } from './ambient-timeline.js';
export { LoadError, createLoader } from './ambient-loader.js';
