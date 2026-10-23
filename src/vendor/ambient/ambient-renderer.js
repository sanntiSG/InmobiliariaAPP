// WebGL2 renderer: one full-screen triangle and one fragment shader.
//
// Per pixel it (1) displaces foliage by the sway mask, (2) mixes the `from` and `to` plates in
// linear light with the sky leading the scene, (3) adds the light layer gated by its turn-on
// order, then (4) cloud shimmer, stars, rain streaks and ground ripples. The weather is computed
// here, from a handful of numbers per state; no video is decoded.
//
// A mid-transition request is served by `capture()`: the current mix is rendered into a
// texture that becomes the new origin, so nothing jumps.

const VERTEX = `#version 300 es
in vec2 aPos;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform float uFlip;
out vec2 vScreen;
out vec2 vUv;
void main() {
  vScreen = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  vUv = vScreen * uScale + uOffset;
  gl_Position = vec4(aPos.x, aPos.y * uFlip, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vScreen;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uMasks;
uniform sampler2D uLights;
uniform sampler2D uOrder;
uniform float uTSky;
uniform float uTScene;
uniform float uTime;
uniform float uWind;
uniform float uGust;
uniform float uRain;
uniform float uWet;
uniform float uLightsOn;
uniform float uStars;
uniform float uCloudSpeed;
uniform float uCloudMod;
uniform float uCloudCover;
uniform float uGustPeriod;
uniform float uWindDir;
uniform float uSame;
uniform float uEffects;
uniform float uHasLights;
uniform float uCapture;
uniform vec2 uView;
uniform vec2 uImagePx;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  return 0.5 * valueNoise(p) + 0.3 * valueNoise(p * 2.07 + 11.7) + 0.2 * valueNoise(p * 4.13 + 5.3);
}

float windSign() { return uWindDir >= 0.0 ? 1.0 : -1.0; }

// A gust front crosses the frame every uGustPeriod seconds, travelling the way the wind blows. Each
// gust has its own strength, between 45% and 100% of uGust.
float gustFront(float x) {
  float cycle = floor(uTime / uGustPeriod);
  float phase = fract(uTime / uGustPeriod);
  float strength = mix(0.45, 1.0, hash21(vec2(cycle, 7.13)));
  float travel = phase * 1.8 - 0.4;
  float position = uWindDir >= 0.0 ? travel : 1.0 - travel;
  float edge = 1.0 - clamp(abs(x - position) * 3.0, 0.0, 1.0);
  return edge * edge * (3.0 - 2.0 * edge) * uGust * strength;
}

// Foliage, cloth and cables flutter, and lean the way the wind blows while a gust passes.
vec2 swayOffset(vec2 uv, float weight) {
  if (weight <= 0.002 || (uWind <= 0.0 && uGust <= 0.0)) return vec2(0.0);
  float gust = gustFront(uv.x);
  float strength = uWind * (0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 0.4 + uv.x * 2.0))) + gust * 1.6;
  float speed = 1.0 + 1.6 * (uWind + gust);
  vec2 phase = uv * vec2(23.0, 17.0);
  float dx = sin(uTime * 1.7 * speed + phase.x + phase.y * 0.6) * 0.6 + sin(uTime * 2.9 * speed - phase.y) * 0.4;
  float dy = sin(uTime * 1.3 * speed + phase.y * 1.3) * 0.35 + sin(uTime * 2.3 * speed + phase.x) * 0.15;
  vec2 flutter = vec2(dx, dy) * strength * 5.5;
  vec2 lean = vec2(uWindDir, -0.15 * abs(uWindDir)) * gust * 11.0;
  // The picture is sampled at the returned offset, so the lean is subtracted: sampling to the left
  // of a pixel makes the content lean to the right.
  return (flutter - lean) * weight / uImagePx;
}

vec3 plateColor(vec2 p, float t) {
  vec3 a = toLinear(texture(uFrom, p).rgb);
  if (uSame > 0.5) return a;
  return mix(a, toLinear(texture(uTo, p).rgb), t);
}

// Sky drift: two copies of the photo's own sky slide along the wind and cross-fade, so the motion never
// visibly restarts. A shifted copy only counts where its source is sky too, so roofs and leaves are
// never dragged into the sky.
vec3 driftedSky(vec2 uv, float t, vec3 plain) {
  float speed = uCloudSpeed * (0.45 + 0.55 * abs(uWindDir));
  if (speed <= 0.0005) return plain;
  float reach = 0.035;
  float p1 = fract(uTime * speed * 0.009 / reach);
  float p2 = fract(p1 + 0.5);
  float w1 = 1.0 - abs(2.0 * p1 - 1.0);
  float w2 = 1.0 - w1;
  vec2 s1 = vec2(uv.x - windSign() * p1 * reach, uv.y);
  vec2 s2 = vec2(uv.x - windSign() * p2 * reach, uv.y);
  // a copy whose source lies outside the photo would repeat the edge column, so it does not count
  float in1 = step(0.0, s1.x) * step(s1.x, 1.0);
  float in2 = step(0.0, s2.x) * step(s2.x, 1.0);
  float k1 = w1 * in1 * smoothstep(0.9, 1.0, texture(uMasks, s1).r);
  float k2 = w2 * in2 * smoothstep(0.9, 1.0, texture(uMasks, s2).r);
  return plain * (1.0 - k1 - k2) + plateColor(s1, t) * k1 + plateColor(s2, t) * k2;
}

float rainLayer(vec2 px, vec2 cell, float speed, float slant, float seed) {
  px.x += px.y * slant;
  vec2 p = px / cell;
  p.y -= uTime * speed;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float r1 = hash21(id + seed);
  float r2 = hash21(id + seed + 17.31);
  float body = smoothstep(1.3 / cell.x, 0.0, abs(f.x - (0.18 + 0.64 * r1)));
  float len = 0.22 + 0.25 * r1;
  float y0 = r2 * (1.0 - len);
  float along = smoothstep(y0, y0 + len, f.y) * step(f.y, y0 + len);
  return body * along * step(0.45, hash21(id + seed + 41.7));
}

float ripples(vec2 uv) {
  vec2 p = vec2(uv.x * 60.0, uv.y * 60.0 / 1.9);
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash21(id);
  float phase = fract(uTime * (0.5 + 0.4 * h) + h * 9.0);
  float d = length(vec2(f.x, f.y * 2.4));
  float ring = smoothstep(0.045, 0.0, abs(d - phase * 0.45)) * (1.0 - phase) * (1.0 - phase);
  return ring * step(0.35, h);
}

void main() {
  vec2 uv = vUv;
  vec4 masks = texture(uMasks, uv);
  float sky = masks.r;

  float t = mix(uTScene, uTSky, sky);
  vec2 displaced = uv;
  if (uCapture < 0.5) displaced += swayOffset(uv, masks.g) * uEffects;
  vec3 color = plateColor(displaced, t);
  if (uCapture > 0.5) {
    outColor = vec4(toSrgb(color), 1.0);
    return;
  }

  float interior = smoothstep(0.92, 1.0, sky);
  if (interior > 0.001 && uEffects > 0.5) color = mix(color, driftedSky(uv, t, color), interior);

  float cloudLight = 1.0 + uCloudMod * (fbm(uv * vec2(3.0, 2.0) + vec2(uTime * 0.012 * uCloudSpeed, 0.0)) - 0.5) * 2.0;
  color *= mix(1.0, cloudLight, sky * uEffects);

  if (uCloudCover > 0.001 && uEffects > 0.5 && sky > 0.04) {
    vec2 q = uv * vec2(2.6, 1.7) - vec2(windSign() * uTime * 0.0085 * max(uCloudSpeed, 0.05), 0.0);
    float density = smoothstep(0.52 - 0.22 * uCloudCover, 0.82, fbm(q));
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 cloud = mix(color, vec3(min(lum * 2.2, 0.95)), 0.6);
    color = mix(color, cloud, density * uCloudCover * sky * 0.75);
  }

  if (uHasLights > 0.5 && uLightsOn > 0.001) {
    float order = texture(uOrder, uv).r;
    float gate = clamp((uLightsOn * 1.25 - order) / 0.25, 0.0, 1.0);
    float flicker = 1.0 + 0.025 * sin(uTime * 6.1 + order * 31.0) * uEffects;
    color += toLinear(texture(uLights, uv).rgb) * gate * flicker;
  }

  if (uStars > 0.001) {
    float dark = sky * (1.0 - smoothstep(0.0, 0.06, dot(color, vec3(0.2126, 0.7152, 0.0722))));
    vec2 cell = vScreen * uView / 7.0;
    vec2 id = floor(cell);
    vec2 jitter = (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.6;
    float h = hash21(id);
    float star = step(0.985, h) * smoothstep(0.18, 0.0, length(fract(cell) - 0.5 - jitter));
    float twinkle = 0.7 + 0.3 * sin(uTime * uEffects * (1.5 + h * 3.0) + h * 40.0);
    color += vec3(0.80, 0.86, 1.0) * star * twinkle * dark * uStars * 0.8;
  }

  if (uRain > 0.001 && uEffects > 0.5) {
    vec2 px = vScreen * uView;
    float slant = (0.12 + uWind * 0.18 + gustFront(vScreen.x) * 0.15) * windSign();
    float streaks = rainLayer(px, vec2(26.0, 110.0), 5.0, slant, 1.0) * 0.35
                  + rainLayer(px, vec2(41.0, 170.0), 7.5, slant, 9.0) * 0.55
                  + rainLayer(px, vec2(66.0, 260.0), 8.5, slant, 21.0) * 0.80;
    color = mix(color, vec3(0.55, 0.60, 0.68), clamp(streaks * 0.5 * uRain, 0.0, 0.5));
    color += vec3(0.80, 0.85, 0.95) * ripples(uv) * masks.b * uWet * uRain * 0.22;
  }

  outColor = vec4(toSrgb(color) + (hash21(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}`;

const UNIFORMS = ['uFrom', 'uTo', 'uMasks', 'uLights', 'uOrder', 'uTSky', 'uTScene', 'uTime', 'uWind', 'uGust',
  'uRain', 'uWet', 'uLightsOn', 'uStars', 'uCloudSpeed', 'uCloudMod', 'uCloudCover', 'uGustPeriod', 'uWindDir', 'uSame',
  'uEffects', 'uHasLights', 'uCapture',
  'uView', 'uImagePx', 'uScale', 'uOffset', 'uFlip'];
const MAX_PIXELS = 3.2e6;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** Returns null when WebGL2 is unavailable, so the caller can use the image fallback. */
export function createRenderer(canvas, { onLost, onRestored } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return null;

  let program; let buffer; let blank; let locations;
  const textures = new Map(); // key -> { texture, width, height }
  const sources = new Map(); // key -> ImageBitmap, kept so a lost context can be rebuilt
  const targets = []; // capture render targets, registered under 'capture:0' / 'capture:1'
  const layers = { masks: null, lights: null, order: null };
  let fit = { scale: [1, 1], offset: [0, 0] };
  let view = [1, 1];
  let lost = false;

  function setup() {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    locations = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)]));
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    blank = makeTexture(1, 1, new Uint8Array([0, 0, 0, 255]), false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  }

  function makeTexture(width, height, data, mipmaps) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
  }

  function upload(bitmap, mipmaps) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    return { texture, width: bitmap.width, height: bitmap.height };
  }

  function makeTarget(index, width, height) {
    const texture = makeTexture(width, height, null, true);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    targets[index] = { framebuffer, width, height };
    textures.set(`capture:${index}`, { texture, width, height });
  }

  function rebuild() {
    textures.clear();
    targets.length = 0;
    for (const [key, bitmap] of sources) textures.set(key, upload(bitmap, !key.startsWith('layer:')));
  }

  setup();

  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; onLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => {
    setup();
    rebuild();
    lost = false;
    onRestored?.();
  });

  function bind(unit, key) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures.get(key)?.texture ?? blank);
  }

  function setCommon(frame, capture) {
    gl.useProgram(program);
    bind(0, frame.fromKey);
    bind(1, frame.toKey);
    bind(2, 'layer:masks');
    bind(3, layers.lights ? 'layer:lights' : null);
    bind(4, layers.order ? 'layer:order' : null);
    gl.uniform1i(locations.uFrom, 0);
    gl.uniform1i(locations.uTo, 1);
    gl.uniform1i(locations.uMasks, 2);
    gl.uniform1i(locations.uLights, 3);
    gl.uniform1i(locations.uOrder, 4);
    gl.uniform1f(locations.uTSky, frame.tSky);
    gl.uniform1f(locations.uTScene, frame.tScene);
    gl.uniform1f(locations.uCapture, capture ? 1 : 0);
    gl.uniform1f(locations.uHasLights, layers.lights ? 1 : 0);
    gl.uniform1f(locations.uSame, frame.fromKey === frame.toKey ? 1 : 0);
    gl.uniform1f(locations.uFlip, capture ? -1 : 1);
    const plate = textures.get(frame.toKey);
    gl.uniform2f(locations.uImagePx, plate?.width ?? 1600, plate?.height ?? 840);
  }

  function draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  return {
    get lost() { return lost; },
    hasPlate: key => textures.has(key),
    addPlate(key, bitmap) {
      if (lost || textures.has(key)) return;
      sources.set(key, bitmap);
      textures.set(key, upload(bitmap, true));
    },
    setLayers({ masks, lights, order }) {
      for (const [name, bitmap] of [['masks', masks], ['lights', lights], ['order', order]]) {
        layers[name] = bitmap ?? null;
        if (bitmap) { sources.set(`layer:${name}`, bitmap); textures.set(`layer:${name}`, upload(bitmap, false)); }
      }
    },
    setFit(next) { fit = next; },
    resize(cssWidth, cssHeight, dpr) {
      const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(cssWidth * cssHeight, 1)));
      canvas.width = Math.max(1, Math.round(cssWidth * scale));
      canvas.height = Math.max(1, Math.round(cssHeight * scale));
      view = [cssWidth, cssHeight];
    },
    /** Render the current mix into a texture and return its key; it becomes the new origin. */
    capture(frame) {
      if (lost) return frame.toKey;
      const reference = textures.get(frame.toKey);
      if (!targets[0]) { makeTarget(0, reference.width, reference.height); makeTarget(1, reference.width, reference.height); }
      const index = frame.fromKey === 'capture:0' ? 1 : 0;
      const target = targets[index];
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      setCommon(frame, true);
      gl.uniform2f(locations.uScale, 1, 1);
      gl.uniform2f(locations.uOffset, 0, 0);
      draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, textures.get(`capture:${index}`).texture);
      gl.generateMipmap(gl.TEXTURE_2D);
      return `capture:${index}`;
    },
    render(frame) {
      if (lost) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      setCommon(frame, false);
      gl.uniform2f(locations.uScale, fit.scale[0], fit.scale[1]);
      gl.uniform2f(locations.uOffset, fit.offset[0], fit.offset[1]);
      gl.uniform2f(locations.uView, view[0], view[1]);
      gl.uniform1f(locations.uTime, frame.time);
      gl.uniform1f(locations.uEffects, frame.effects ? 1 : 0);
      const p = frame.params;
      gl.uniform1f(locations.uWind, p.wind);
      gl.uniform1f(locations.uGust, p.gust);
      gl.uniform1f(locations.uRain, p.rain);
      gl.uniform1f(locations.uWet, p.wetness);
      gl.uniform1f(locations.uLightsOn, p.lightsOn);
      gl.uniform1f(locations.uStars, p.stars);
      gl.uniform1f(locations.uCloudSpeed, p.cloudSpeed);
      gl.uniform1f(locations.uCloudMod, p.cloudMod);
      gl.uniform1f(locations.uCloudCover, p.cloudCover ?? 0);
      gl.uniform1f(locations.uGustPeriod, p.gustPeriod ?? 16);
      gl.uniform1f(locations.uWindDir, p.windDirection ?? 1);
      draw();
    },
    dispose() {
      sources.clear();
      textures.clear();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
