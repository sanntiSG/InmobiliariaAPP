// Transition state machine. Pure: the clock is passed in, never read, so tests drive time.
//
// A transition mixes two looks. The sky leads and the scene follows; lights, rain and stars have
// their own schedules (lights come on late and go off early). Asking for a new state while one is
// still running does not jump: the current mix is captured as the new "from" and the numeric
// parameters continue from where they are.

const clamp01 = x => Math.min(Math.max(x, 0), 1);
const smooth = x => { const t = clamp01(x); return t * t * (3 - 2 * t); };

export const CAPTURED = null; // `fromId` while the origin is a captured mid-transition frame

/** Region progress for plate mixing: the sky changes first, the scene follows. */
export function regionProgress(t) {
  return { sky: smooth(t / 0.7), scene: smooth((t - 0.15) / 0.7) };
}

// Per-parameter schedules. `rising` is true when the value increases during the transition.
const SCHEDULES = {
  lightsOn: (t, rising) => (rising ? smooth((t - 0.4) / 0.6) : smooth(t / 0.5)),
  stars: (t, rising) => (rising ? smooth((t - 0.35) / 0.65) : smooth(t / 0.4)),
  rain: (t, rising) => (rising ? smooth((t - 0.25) / 0.6) : smooth(t / 0.5)),
  wetness: t => smooth((t - 0.15) / 0.85),
};

export function mixParams(from, to, t) {
  const out = {};
  for (const key of Object.keys(to)) {
    const start = from[key] ?? to[key];
    const progress = SCHEDULES[key] ? SCHEDULES[key](t, to[key] >= start) : smooth(t);
    out[key] = start + (to[key] - start) * progress;
  }
  return out;
}

/**
 * The visitor's own weather sliders, as multipliers over what the author designed. `wind` scales wind and
 * gusts; `clouds` scales cloud speed, cloud cover and cloud light. Rain, lights and stars are not touched.
 */
export function applyIntensity(params, { wind = 1, clouds = 1 } = {}) {
  return {
    ...params,
    wind: params.wind * wind,
    gust: params.gust * wind,
    cloudSpeed: params.cloudSpeed * clouds,
    cloudMod: params.cloudMod * clouds,
    cloudCover: Math.min(1, (params.cloudCover ?? 0) * clouds),
  };
}

export function createTimeline({ initialId, initialParams, durationMs }) {
  let fromId = initialId;
  let toId = initialId;
  let fromParams = { ...initialParams };
  let toParams = { ...initialParams };
  let startedAt = 0;
  let duration = durationMs;

  function sample(now) {
    const raw = fromId === toId ? 1 : clamp01((now - startedAt) / duration);
    const done = raw >= 1;
    const result = {
      fromId, toId, captured: fromId === CAPTURED, t: raw, done,
      ...regionProgress(raw), params: mixParams(fromParams, toParams, raw),
    };
    if (done) { // settle: later samples start from the target
      fromId = toId;
      fromParams = { ...toParams };
    }
    return result;
  }

  /** Begin moving to `id`. `capture` tells the renderer to freeze the current mix as the origin. */
  function setTarget(id, params, now, ms = durationMs) {
    if (id === toId) return { changed: false, capture: false };
    const current = sample(now);
    const capture = !current.done;
    fromParams = current.params;
    fromId = capture ? CAPTURED : toId;
    toId = id;
    toParams = { ...params };
    startedAt = now;
    duration = ms;
    return { changed: true, capture };
  }

  /** Finish any running transition at once (used when a captured origin was lost). */
  function settle() {
    fromId = toId;
    fromParams = { ...toParams };
  }

  /** Replace the live parameters of a state (a slider moved); a running transition follows at once. */
  function updateParams(id, params) {
    if (id === toId) toParams = { ...params };
    if (id === fromId) fromParams = { ...params };
  }

  return { sample, setTarget, settle, updateParams, target: () => toId };
}
