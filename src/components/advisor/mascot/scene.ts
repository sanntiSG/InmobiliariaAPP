/**
 * Escena 3D del asesor (three.js "plano", sin React): carga el GLB, arma la
 * iluminación, encuadra el modelo y maneja las animaciones por ROL
 * (reposo / hablando / sorpresa / al tocar). La envoltura React es
 * `MascotCanvas`; esto no sabe nada de React, así se puede razonar y probar
 * aparte.
 *
 * Criterios (ver skills del proyecto): sólo se dibuja lo que se ve (pausa fuera de
 * pantalla y con la pestaña oculta), el pixel ratio baja solo si la máquina no
 * da abasto, `prefers-reduced-motion` deja el modelo quieto, y al destruirla se
 * liberan renderer, entorno y listeners (el GLB cargado queda en caché).
 */
import type { AnimationAction, Group, WebGLRenderer } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AdvisorFraming, AdvisorRoles, ClipInfo } from "@/lib/advisor/config";

export type MascotBase = "idle" | "talking";

export type MascotOptions = {
  url: string;
  roles: AdvisorRoles;
  disabled: string[];
  framing: AdvisorFraming;
  /** Ignora `prefers-reduced-motion` (sólo el estudio del admin, que previsualiza animaciones a pedido). */
  forceMotion?: boolean;
  onProgress?: (fraction: number) => void;
};

export type MascotController = {
  clips: ClipInfo[];
  setBase(base: MascotBase): void;
  surprise(): void;
  tap(): void;
  playClip(name: string): void;
  setRoles(roles: AdvisorRoles, disabled: string[]): void;
  setFraming(framing: AdvisorFraming): void;
  setPaused(paused: boolean): void;
  capture(size?: number): Promise<Blob | null>;
  dispose(): void;
};

// El GLB se descarga una sola vez por URL aunque se abra y cierre el escenario varias veces.
const gltfCache = new Map<string, Promise<GLTF>>();

async function loadGltf(url: string, onProgress?: (f: number) => void): Promise<GLTF> {
  let hit = gltfCache.get(url);
  if (!hit) {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    hit = new GLTFLoader().loadAsync(url, (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    gltfCache.set(url, hit);
    // Si falla, se descarta para que el próximo intento vuelva a probar.
    hit.catch(() => gltfCache.delete(url));
  }
  return hit;
}

/** Lista de animaciones de un modelo, sin armar ninguna escena (para el estudio del admin al elegir un archivo). */
export async function readClips(url: string): Promise<ClipInfo[]> {
  const gltf = await loadGltf(url);
  return gltf.animations.map((a) => ({ name: a.name, duration: Math.round(a.duration * 100) / 100 }));
}

const FADE = 0.3;
const FOV = 28;

export async function createMascot(container: HTMLElement, opts: MascotOptions): Promise<MascotController> {
  const [THREE, { RoomEnvironment }, SkeletonUtils, gltf] = await Promise.all([
    import("three"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
    import("three/examples/jsm/utils/SkeletonUtils.js"),
    loadGltf(opts.url, opts.onProgress),
  ]);

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const reduced = !opts.forceMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  // ── Renderer ──
  let renderer: WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !coarse, powerPreference: "high-performance" });
  } catch {
    throw new Error("webgl-unavailable");
  }
  let pixelRatio = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;outline:none";
  canvas.setAttribute("aria-hidden", "true");
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  container.appendChild(canvas);

  // ── Escena, entorno y luces ──
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // ── Modelo ──
  const model = SkeletonUtils.clone(gltf.scene) as Group;
  const pivot = new THREE.Group();
  const rig = new THREE.Group();
  pivot.add(model);
  rig.add(pivot);
  scene.add(rig);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.001, box.getBoundingSphere(new THREE.Sphere()).radius);
  model.position.sub(center);

  let framing = opts.framing;
  function applyFraming() {
    rig.rotation.y = framing.rotationY;
    rig.scale.setScalar(framing.scale);
    pivot.position.y = framing.height * radius * 0.5;
    const vFov = (FOV * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fit = Math.max((radius * 1.12) / Math.sin(vFov / 2), (radius * 1.12) / Math.sin(hFov / 2));
    camera.position.set(0, 0, fit * framing.distance);
    camera.lookAt(0, 0, 0);
    renderer.toneMappingExposure = framing.light;
    scene.environmentIntensity = framing.light;
    key.intensity = 1.1 * framing.light;
    needsRender = true;
  }

  // ── Animación por roles ──
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, AnimationAction>();
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  const clips: ClipInfo[] = gltf.animations.map((a) => ({ name: a.name, duration: Math.round(a.duration * 100) / 100 }));

  let roles = opts.roles;
  let disabled = new Set(opts.disabled);
  let base: MascotBase = "idle";
  let current: AnimationAction | null = null;
  let oneShot = false;
  let lastTap = "";
  let needsRender = true;
  let paused = false;

  const enabled = (names: string[]) => names.filter((n) => actions.has(n) && !disabled.has(n));
  const pick = (names: string[], avoid?: string): string | null => {
    const pool = names.length > 1 && avoid ? names.filter((n) => n !== avoid) : names;
    return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]! : null;
  };

  function play(name: string, mode: "loop" | "once", fade = FADE) {
    const next = actions.get(name);
    if (!next) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    if (mode === "once") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    if (current && current !== next) next.crossFadeFrom(current, fade, false);
    else next.fadeIn(fade);
    next.play();
    current = next;
    oneShot = mode === "once";
    needsRender = true;
  }

  function enterBase(fade = FADE) {
    const talking = base === "talking" ? pick(enabled(roles.talking)) : null;
    const idle = enabled([roles.idle])[0] ?? enabled([...actions.keys()])[0];
    const name = talking ?? idle;
    if (name) play(name, "loop", fade);
  }

  mixer.addEventListener("finished", (e) => {
    if (oneShot && e.action === current) enterBase();
  });

  enterBase(0);
  mixer.update(0);

  // ── Parallax suave hacia el puntero (sólo con mouse y movimiento permitido) ──
  let targetYaw = 0;
  let targetPitch = 0;
  let yaw = 0;
  let pitch = 0;
  const onPointerMove = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const nx = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2;
    const ny = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 2;
    targetYaw = Math.max(-0.22, Math.min(0.22, nx * 0.22));
    targetPitch = Math.max(-0.1, Math.min(0.1, ny * 0.1));
  };
  if (finePointer && !reduced) window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ── Toque en la mascota ──
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  const onPointerDown = (e: PointerEvent) => {
    downAt = performance.now();
    downX = e.clientX;
    downY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    const quick = performance.now() - downAt < 350;
    const still = Math.hypot(e.clientX - downX, e.clientY - downY) < 8;
    if (quick && still) controller.tap();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  // ── Tamaño ──
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyFraming();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // ── Visibilidad: no se dibuja lo que no se ve ──
  let onScreen = true;
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) last = performance.now();
  });
  io.observe(container);

  // ── Bucle ──
  let raf = 0;
  let last = performance.now();
  let frames = 0;
  let slow = 0;
  let disposed = false;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused || !onScreen || document.hidden) return;

    if (reduced) {
      // Quieto: sólo se redibuja cuando algo cambió (encuadre, tamaño, un clip pedido a mano).
      if (!needsRender && !oneShot) return;
      mixer.update(oneShot ? dt : 0);
      renderer.render(scene, camera);
      needsRender = false;
      return;
    }

    mixer.update(dt);
    const k = 1 - Math.exp(-dt * 5);
    yaw += (targetYaw - yaw) * k;
    pitch += (targetPitch - pitch) * k;
    rig.rotation.y = framing.rotationY + yaw;
    rig.rotation.x = pitch;
    renderer.render(scene, camera);

    // Si la máquina no da abasto (primeros ~2 s), se baja el pixel ratio de a un escalón.
    if (frames < 120) {
      frames++;
      if (dt > 1 / 26) slow++;
      if (frames === 120) {
        if (slow > 40 && pixelRatio > 1) {
          pixelRatio = pixelRatio > 1.5 ? 1.5 : 1;
          renderer.setPixelRatio(pixelRatio);
          resize();
        }
      }
    }
  }
  raf = requestAnimationFrame(frame);

  const controller: MascotController = {
    clips,
    setBase(next) {
      if (next === base) return;
      base = next;
      // Un gesto puntual (sorpresa, toque) termina solo y después vuelve a la base.
      if (!oneShot) enterBase();
    },
    surprise() {
      if (reduced) return;
      const name = pick(enabled(roles.surprised));
      if (name) play(name, "once", 0.18);
    },
    tap() {
      if (reduced) return;
      const name = pick(enabled(roles.tap), lastTap);
      if (!name) return;
      lastTap = name;
      play(name, "once", 0.2);
    },
    playClip(name) {
      if (!actions.has(name)) return;
      play(name, "once", 0.2);
    },
    setRoles(nextRoles, nextDisabled) {
      roles = nextRoles;
      disabled = new Set(nextDisabled);
      if (!oneShot) enterBase();
    },
    setFraming(next) {
      framing = next;
      applyFraming();
    },
    setPaused(p) {
      paused = p;
      if (!p) last = performance.now();
    },
    async capture(size = 512) {
      const prevRatio = renderer.getPixelRatio();
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      applyFraming();
      renderer.render(scene, camera);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
      renderer.setPixelRatio(prevRatio);
      renderer.setSize(w, h, false);
      camera.aspect = Math.max(1, w) / Math.max(1, h);
      camera.updateProjectionMatrix();
      applyFraming();
      return blob;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return controller;
}
