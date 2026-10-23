// createAmbientPlayer(container, options): the whole web experience for one experience.json.
//
//   const player = createAmbientPlayer(el, { manifestUrl: '/ambient/casa-42/experience.json' });
//   await player.ready;          // manifest + first plate + layers loaded and drawn
//   await player.setState('night');
//
// The first plate is a plain <img> (instant paint, good LCP). WebGL2 then takes over; without it
// the same plates cross-fade as images. Nothing here runs Blender or calls a model.

import {
  PARAM_BOUNDS, absoluteUrl, clampParam, coverTransform, findState, layerUrls, normalizeParams, pickFormat, pickVariant,
  plateUrl, validateManifest,
} from './ambient-manifest.js';
import { applyIntensity, createTimeline } from './ambient-timeline.js';
import { createLoader } from './ambient-loader.js';
import { createRenderer } from './ambient-renderer.js';
import { createFallback } from './ambient-fallback.js';
import { constrainedNetwork, prefersReducedMotion, supportsAvif } from './ambient-support.js';

export const DEFAULT_MESSAGES = {
  controls: 'Clima y horario',
  loadingScene: 'Cargando la escena…',
  loadingState: label => `Cargando ${label}…`,
  showing: label => `Mostrando ${label}`,
  error: 'No se pudo cargar la escena.',
  errorState: label => `No se pudo cargar «${label}».`,
  retry: 'Reintentar',
  weather: 'Clima',
  wind: 'Viento',
  clouds: 'Nubes',
};

const SVG = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICONS = {
  day: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  dusk: SVG('<path d="M17 18a5 5 0 0 0-10 0M12 9V4M4.2 11.2l1.4 1.4M19.8 11.2l-1.4 1.4M2 18h20M7 22h10"/>'),
  night: SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  rain: SVG('<path d="M17.5 16H7a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a3.5 3.5 0 0 1 .5 7zM9 19l-1 2M13 19l-1 2M17 19l-1 2"/>'),
  wind: SVG('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8a2.5 2.5 0 1 1-2.5 2.5"/>'),
};

function el(tag, className, attributes = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function createAmbientPlayer(container, options = {}) {
  if (!container) throw new Error('createAmbientPlayer needs a container element');
  const messages = { ...DEFAULT_MESSAGES, ...options.messages };
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  const maxDpr = options.maxDpr ?? 2;

  const stage = el('div', 'ambient__stage', { role: 'img' });
  const poster = el('img', 'ambient__poster', { alt: '', decoding: 'async' });
  const canvas = el('canvas', 'ambient__canvas', { 'aria-hidden': 'true' });
  const badge = el('p', 'ambient__badge', { 'aria-hidden': 'true' });
  const disclosure = el('p', 'ambient__sr', { id: `ambient-disclosure-${Math.random().toString(36).slice(2, 8)}` });
  const status = el('p', 'ambient__status', { role: 'status', 'aria-live': 'polite' });
  const errorBox = el('div', 'ambient__error', { role: 'alert' });
  const errorText = el('p', 'ambient__error-text');
  const retryButton = el('button', 'ambient__retry', { type: 'button' });
  const controls = el('div', 'ambient__controls', { role: 'group' });
  errorBox.hidden = true;
  retryButton.textContent = messages.retry;
  errorBox.append(errorText, retryButton);
  stage.setAttribute('aria-describedby', disclosure.id);
  stage.append(poster, canvas, badge, disclosure, status);
  const ownsControls = options.controls !== false && !(options.controls instanceof HTMLElement);
  const controlsHost = options.controls instanceof HTMLElement ? options.controls : container;
  container.classList.add('ambient');
  container.dataset.status = 'loading';
  container.append(stage, errorBox);
  if (options.controls !== false) controlsHost.append(controls);

  const renderer = options.forceFallback ? null : createRenderer(canvas, { onLost: () => {}, onRestored: settle });
  const ownsLoader = !options.loader;
  const loader = options.loader ?? createLoader(renderer ? {} : { decode: async blob => blob });
  const stats = { mode: renderer ? 'webgl' : 'fallback', fps: 0, state: null, transitioning: false };

  let manifest; let manifestUrl; let variant; let format;
  let timeline; let fallback; let currentId; let captureKey = null;
  let destroyed = false; let running = false; let visible = true; let live = false;
  let rafId = 0; let startedAt = 0; let lastFrame = 0; let request = 0; let lastRetry = null;
  let resizeObserver; let intersectionObserver; let preloadTimer = 0;
  const buttons = new Map();
  const objectUrls = new Map();
  const overrides = new Map(); // live parameter changes per state (setParams), over the manifest's values
  const intensity = { wind: 1, clouds: 1 }; // the visitor's sliders, as multipliers
  let weatherPanel = null;

  const keyOf = id => plateUrl(manifest, manifestUrl, id, variant, format);

  // <img> elements show the bytes the loader already downloaded: one request per file, never two.
  function blobUrl(url) {
    if (!objectUrls.has(url)) {
      const blob = loader.blobFor?.(url);
      if (!blob) return url;
      objectUrls.set(url, URL.createObjectURL(blob));
    }
    return objectUrls.get(url);
  }
  const labelOf = id => findState(manifest, id).label;
  const paramsOf = id => normalizeParams({ ...findState(manifest, id).params, ...overrides.get(id) });

  function setStatus(kind, text = '') {
    container.dataset.status = kind;
    status.textContent = text;
  }

  function showError(text, error, retry) {
    lastRetry = retry;
    errorText.textContent = text;
    errorBox.hidden = false;
    setStatus('error', '');
    options.onError?.(error);
  }

  function clearError() {
    errorBox.hidden = true;
    lastRetry = null;
  }

  retryButton.addEventListener('click', () => { const retry = lastRetry; clearError(); retry?.(); });

  function updateControls(activeId, busyId) {
    for (const [id, button] of buttons) {
      button.setAttribute('aria-pressed', String(id === activeId));
      if (id === busyId) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
    }
  }

  function buildControls() {
    controls.setAttribute('aria-label', messages.controls);
    for (const state of manifest.states) {
      const button = el('button', 'ambient__control', { type: 'button', 'aria-pressed': 'false', 'data-state': state.id });
      button.innerHTML = `${ICONS[state.id] ?? ''}<span></span>`;
      button.lastElementChild.textContent = state.label;
      button.addEventListener('click', () => { api.setState(state.id); });
      buttons.set(state.id, button);
      controls.append(button);
    }
  }

  function buildWeatherControls() {
    const id = `ambient-weather-${Math.random().toString(36).slice(2, 8)}`;
    const wrap = el('div', 'ambient__weather');
    const toggle = el('button', 'ambient__weather-toggle', { type: 'button', 'aria-expanded': 'false', 'aria-controls': id });
    toggle.textContent = messages.weather;
    const panel = el('div', 'ambient__weather-panel', { id });
    panel.hidden = true;
    for (const [key, label] of [['wind', messages.wind], ['clouds', messages.clouds]]) {
      const row = el('label', 'ambient__slider');
      const name = el('span');
      name.textContent = label;
      const input = el('input', '', { type: 'range', min: '0', max: '150', step: '5', value: String(Math.round(intensity[key] * 100)) });
      const output = el('output');
      const show = () => { output.textContent = `${input.value} %`; input.setAttribute('aria-valuetext', `${input.value} %`); };
      input.addEventListener('input', () => { intensity[key] = Number(input.value) / 100; show(); requestFrame(); });
      show();
      row.append(name, input, output);
      panel.append(row);
    }
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    wrap.append(toggle, panel);
    weatherPanel = wrap;
    controlsHost.append(wrap);
  }

  function layout() {
    const rect = stage.getBoundingClientRect();
    if (!renderer || !rect.width || !rect.height) return;
    renderer.resize(rect.width, rect.height, Math.min(globalThis.devicePixelRatio || 1, maxDpr));
    renderer.setFit(coverTransform(rect.width / rect.height, manifest.aspect[0] / manifest.aspect[1], manifest.focus));
    requestFrame();
  }

  function requestFrame() {
    if (!rafId && running && !destroyed) rafId = requestAnimationFrame(tick);
  }

  function frameFor(sample) {
    return {
      fromKey: sample.captured ? captureKey : keyOf(sample.fromId),
      toKey: keyOf(sample.toId),
      tSky: sample.sky, tScene: sample.scene, params: applyIntensity(sample.params, intensity),
      time: (performance.now() - startedAt) / 1000, effects: !reducedMotion,
    };
  }

  function tick(now) {
    rafId = 0;
    if (!running || destroyed || renderer.lost) return;
    const sample = timeline.sample(now);
    renderer.render(frameFor(sample));
    if (!live) { live = true; canvas.classList.add('is-live'); poster.classList.add('is-hidden'); }
    stats.transitioning = !sample.done;
    if (lastFrame) stats.fps = stats.fps ? stats.fps * 0.9 + (1000 / Math.max(now - lastFrame, 1)) * 0.1 : 60;
    lastFrame = now;
    if (!sample.done || !reducedMotion) requestFrame(); else lastFrame = 0;
  }

  function updateRunning() {
    const should = Boolean(renderer && timeline && !destroyed && visible && !document.hidden);
    if (should && !running) { running = true; lastFrame = 0; requestFrame(); }
    if (!should && running) { running = false; cancelAnimationFrame(rafId); rafId = 0; }
  }

  // After a lost WebGL context the captured mid-transition frame is gone: finish the move instead.
  function settle() {
    if (!timeline) return;
    captureKey = null;
    timeline.settle();
    // A plate chosen while the context was lost was never uploaded: upload it again from the cache.
    const url = keyOf(timeline.target());
    loader.load(url).then(bitmap => { renderer.addPlate(url, bitmap); requestFrame(); }, () => {});
    requestFrame();
  }

  function schedulePreload() {
    if (constrainedNetwork() || destroyed) return;
    const queue = manifest.states.map(state => state.id).filter(id => id !== currentId);
    const next = () => {
      const id = queue.shift();
      if (id === undefined || destroyed) return;
      loader.load(keyOf(id), { retainBlob: !renderer }).then(bitmap => { renderer?.addPlate(keyOf(id), bitmap); }, () => {});
      preloadTimer = setTimeout(next, 700);
    };
    preloadTimer = setTimeout(next, 1500);
  }

  async function start() {
    setStatus('loading', messages.loadingScene);
    try {
      if (options.manifest) {
        manifest = options.manifest;
        manifestUrl = absoluteUrl(options.manifestUrl ?? './experience.json');
      } else {
        manifestUrl = absoluteUrl(options.manifestUrl);
        manifest = await loader.loadJson(manifestUrl);
      }
      validateManifest(manifest);
      const avif = manifest.formats.includes('avif') && await supportsAvif();
      format = pickFormat(manifest, { avif });
      variant = pickVariant(manifest, {
        cssWidth: container.clientWidth || globalThis.innerWidth || 1280,
        dpr: globalThis.devicePixelRatio || 1, saveData: constrainedNetwork(),
      });
      currentId = findState(manifest, options.initialState) ? options.initialState : manifest.initialState;
      stats.state = currentId;
      stage.style.setProperty('--ambient-native-ratio', `${manifest.aspect[0]} / ${manifest.aspect[1]}`);
      badge.textContent = manifest.disclosure.length > 64 ? 'Ambientación digital' : manifest.disclosure;
      badge.title = manifest.disclosure;
      disclosure.textContent = manifest.disclosure; // full text for assistive technology and touch users
      stage.setAttribute('aria-label', `${manifest.title ?? ''} — ${labelOf(currentId)}`.replace(/^ — /, ''));
      poster.alt = '';
      poster.style.objectPosition = `${manifest.focus[0] * 100}% ${manifest.focus[1] * 100}%`;
      if (ownsControls || options.controls instanceof HTMLElement) buildControls();
      updateControls(currentId);

      const urls = layerUrls(manifest, manifestUrl, variant);
      const first = keyOf(currentId);
      if (renderer) {
        const firstPlate = loader.load(first, { retainBlob: true });
        firstPlate.then(() => { if (!destroyed) poster.src = blobUrl(first); }, () => {}); // paints before the layers arrive
        const [plate, masks, lights, order] = await Promise.all([
          firstPlate, loader.load(urls.masks),
          urls.lights ? loader.load(urls.lights) : null, urls.lightOrder ? loader.load(urls.lightOrder) : null]);
        if (destroyed) return;
        renderer.setLayers({ masks, lights, order });
        renderer.addPlate(first, plate);
        timeline = createTimeline({ initialId: currentId, initialParams: paramsOf(currentId), durationMs: manifest.transitionMs });
        startedAt = performance.now();
        layout();
        resizeObserver = new ResizeObserver(layout);
        resizeObserver.observe(stage);
        intersectionObserver = new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; updateRunning(); });
        intersectionObserver.observe(container);
        document.addEventListener('visibilitychange', updateRunning);
        updateRunning();
      } else {
        await Promise.all([loader.load(first, { retainBlob: true }), urls.lights ? loader.load(urls.lights, { retainBlob: true }) : null]);
        if (destroyed) return;
        fallback = createFallback(stage, {
          focus: manifest.focus, transitionMs: manifest.transitionMs, reducedMotion,
          lightsUrl: urls.lights ? blobUrl(urls.lights) : null });
        fallback.show(blobUrl(first), paramsOf(currentId).lightsOn);
        poster.classList.add('is-hidden');
      }
      if (options.weatherControls && renderer && !reducedMotion) buildWeatherControls();
      container.dataset.scene = 'true';
      setStatus('ready');
      options.onReady?.(manifest);
      schedulePreload();
    } catch (error) {
      if (destroyed) return;
      showError(messages.error, error, () => { ready = start(); ready.catch(() => {}); api.ready = ready; });
      throw error;
    }
  }

  async function setState(id) {
    if (destroyed) return false;
    if (!manifest) throw new Error('The experience is not loaded yet');
    const state = findState(manifest, id);
    if (!state) throw new Error(`Unknown state: ${id}`);
    const mine = ++request;
    if (id === (timeline ? timeline.target() : currentId)) { updateControls(id); return true; }
    clearError();
    const url = keyOf(id);
    updateControls(currentId, id);
    if (!loader.has(url)) { setStatus('loading', messages.loadingState(state.label)); }
    let bitmap;
    try {
      bitmap = await loader.load(url, { retainBlob: !renderer });
    } catch (error) {
      if (destroyed || mine !== request) return false;
      updateControls(timeline ? timeline.target() : currentId);
      setStatus('ready');
      showError(messages.errorState(state.label), error, () => api.setState(id).catch(() => {}));
      return false;
    }
    if (destroyed || mine !== request) return false; // a newer choice won; this plate stays cached
    currentId = id;
    stats.state = id;
    if (renderer) {
      renderer.addPlate(url, bitmap);
      const now = performance.now();
      const before = timeline.sample(now);
      const change = timeline.setTarget(id, paramsOf(id), now);
      if (change.capture) {
        captureKey = renderer.capture({
          fromKey: before.captured ? captureKey : keyOf(before.fromId), toKey: keyOf(before.toId),
          tSky: before.sky, tScene: before.scene,
        });
      }
      requestFrame();
    } else {
      fallback.show(blobUrl(url), paramsOf(id).lightsOn);
    }
    updateControls(id);
    stage.setAttribute('aria-label', `${manifest.title ?? ''} — ${state.label}`.replace(/^ — /, ''));
    setStatus('ready', messages.showing(state.label));
    options.onStateChange?.(id, state);
    return true;
  }

  const api = {
    ready: null,
    setState,
    getState: () => currentId,
    getStates: () => (manifest ? manifest.states.map(({ id, label }) => ({ id, label })) : []),
    getManifest: () => manifest,
    /** Change weather parameters of a state live (clamped to their bounds); a running transition follows. */
    setParams(id, partial) {
      if (!manifest || !findState(manifest, id)) throw new Error(`Unknown state: ${id}`);
      const clean = {};
      for (const [key, value] of Object.entries(partial)) {
        if (!(key in PARAM_BOUNDS)) throw new Error(`Unknown parameter: ${key}`);
        if (!Number.isFinite(value)) throw new Error(`Parameter ${key} must be a finite number`);
        clean[key] = clampParam(key, value);
      }
      overrides.set(id, { ...overrides.get(id), ...clean });
      timeline?.updateParams(id, paramsOf(id));
      if (!renderer && id === currentId && 'lightsOn' in clean) fallback?.setLights(clean.lightsOn);
      requestFrame();
      return paramsOf(id);
    },
    getParams: id => paramsOf(id ?? currentId),
    /** Drop live changes and return to the manifest's values. */
    resetParams(id) {
      overrides.delete(id);
      timeline?.updateParams(id, paramsOf(id));
      if (!renderer && id === currentId) fallback?.setLights(paramsOf(id).lightsOn);
      requestFrame();
      return paramsOf(id);
    },
    /** The visitor's multipliers over the designed weather: wind (wind and gusts), clouds (speed and cover). */
    setIntensity(next) {
      for (const key of ['wind', 'clouds']) {
        if (next[key] === undefined) continue;
        if (!Number.isFinite(next[key]) || next[key] < 0 || next[key] > 1.5) throw new Error(`Intensity ${key} must be between 0 and 1.5`);
        intensity[key] = next[key];
      }
      const inputs = weatherPanel?.querySelectorAll('input') ?? [];
      [intensity.wind, intensity.clouds].forEach((value, i) => {
        if (inputs[i]) { inputs[i].value = String(Math.round(value * 100)); inputs[i].dispatchEvent(new Event('input')); }
      });
      requestFrame();
      return { ...intensity };
    },
    getIntensity: () => ({ ...intensity }),
    retry: () => { const retry = lastRetry; clearError(); retry?.(); },
    stats: () => ({ ...stats, bytesLoaded: loader.bytesLoaded(), variant, format }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      cancelAnimationFrame(rafId);
      clearTimeout(preloadTimer);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', updateRunning);
      fallback?.dispose();
      renderer?.dispose();
      if (ownsLoader) loader.dispose();
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
      objectUrls.clear();
      stage.remove();
      errorBox.remove();
      controls.remove();
      weatherPanel?.remove();
      container.classList.remove('ambient');
      delete container.dataset.status;
      delete container.dataset.scene;
    },
  };
  let ready = start();
  ready.catch(() => {}); // failures are shown in the UI and reported through onError
  api.ready = ready;
  return api;
}
