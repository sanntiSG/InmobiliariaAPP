// No-WebGL fallback: two stacked <img> elements cross-faded with CSS, plus the light layer blended
// additively on top. Same plates, states and controls; rain, foliage sway and stars are absent.

export function createFallback(stage, { focus, transitionMs, reducedMotion, lightsUrl }) {
  const position = `${focus[0] * 100}% ${focus[1] * 100}%`;
  const make = className => {
    const img = document.createElement('img');
    img.className = className;
    img.decoding = 'async';
    img.alt = '';
    img.draggable = false;
    img.style.objectPosition = position;
    return img;
  };
  const layers = [make('ambient__plate'), make('ambient__plate')];
  const lights = lightsUrl ? make('ambient__lights') : null;
  if (lights) lights.src = lightsUrl;
  [...layers, lights].filter(Boolean).forEach(img => stage.appendChild(img));
  let front = 0;
  let lightsOn = 0;

  function show(url, nextLightsOn = 0) {
    const incoming = layers[1 - front];
    const outgoing = layers[front];
    const duration = reducedMotion ? 0 : transitionMs;
    incoming.style.transitionDuration = `${duration}ms`;
    outgoing.style.transitionDuration = `${duration}ms`;
    incoming.src = url;
    incoming.decode?.().catch(() => {}).then(() => {
      incoming.classList.add('is-front');
      outgoing.classList.remove('is-front');
    });
    front = 1 - front;
    if (lights) { // lights come on late and go off early, like the WebGL schedule
      const rising = nextLightsOn >= lightsOn;
      lights.style.transitionDelay = `${rising && !reducedMotion ? duration * 0.4 : 0}ms`;
      lights.style.transitionDuration = `${rising ? duration * 0.6 : duration * 0.5}ms`;
      lights.style.opacity = String(nextLightsOn);
      lightsOn = nextLightsOn;
    }
  }

  /** Set the light layer's strength at once (a live parameter change). */
  function setLights(value) {
    if (!lights) return;
    lights.style.transitionDuration = '0ms';
    lights.style.transitionDelay = '0ms';
    lights.style.opacity = String(value);
    lightsOn = value;
  }

  return { show, setLights, dispose() { [...layers, lights].filter(Boolean).forEach(img => img.remove()); } };
}
