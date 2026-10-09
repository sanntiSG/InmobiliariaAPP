"use client";

import { useRef, useEffect } from "react";
import type { Group, Quaternion, Vector3 } from "three";

/**
 * Escena Three.js que renderiza modelos GLB flotando al estilo del hero
 * de referencia (HeroSecuence). Los modelos entran volando desde fuera
 * de la pantalla y se asientan con una flotación continua. Usa Three.js
 * directo (sin R3F) para minimizar el bundle.
 *
 * Desktop (16:10 o más ancho, >= 1100x640): composición libre original,
 * con posiciones normalizadas por modelo (targetX/Y). No cambia.
 *
 * Cualquier otra pantalla (tablet, vertical, apaisado, ventana baja):
 * layout adaptativo. Se mide el espacio libre real (columna a la derecha
 * del texto o franja entre el header y el titular), se reparte en celdas
 * y cada modelo se dimensiona por su esfera envolvente dentro de su celda,
 * así que ni se pisan entre sí ni tapan el texto, sea cual sea el GLB. Si
 * las celdas quedan demasiado chicas se ocultan los últimos modelos.
 *
 * Respeta prefers-reduced-motion: los modelos aparecen directamente en su
 * posición final sin animación.
 */

interface ModelConfig {
  url: string;
  /** Posición final desktop (normalizada 0-1 respecto al canvas) */
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Posición de inicio (fuera de pantalla) */
  startX: number;
  startY: number;
  startZ: number;
  /** Rotación final */
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Tamaño máximo del modelo en unidades de escena (desktop) */
  scale: number;
  /** Delay de entrada en ms (desde que el modelo terminó de cargar) */
  delay: number;
  /** Parámetros de flotación */
  floatSpeed: number;
  floatAmplitude: number;
  floatPhase: number;
}

const MODEL_CONFIGS: ModelConfig[] = [
  {
    url: "/HeroIdea/models/visa.glb",
    targetX: 0.55, targetY: 0.35, targetZ: 0,
    startX: 1.8, startY: -1.2, startZ: 2,
    rotX: -0.15, rotY: 0.3, rotZ: -0.1,
    scale: 2.8, delay: 200,
    floatSpeed: 0.8, floatAmplitude: 0.06, floatPhase: 0,
  },
  {
    url: "/HeroIdea/models/pinLocation.glb",
    targetX: 0.35, targetY: 0.2, targetZ: -0.5,
    startX: 1.5, startY: -1.5, startZ: 3,
    rotX: 0.2, rotY: -0.4, rotZ: 0.15,
    scale: 2.8, delay: 400,
    floatSpeed: 0.65, floatAmplitude: 0.08, floatPhase: 1.2,
  },
  {
    url: "/HeroIdea/models/playbackvisa.glb",
    targetX: 0.7, targetY: 0.55, targetZ: 0.5,
    startX: 2.0, startY: -0.8, startZ: 1.5,
    rotX: -0.1, rotY: 0.5, rotZ: -0.2,
    scale: 2.8, delay: 600,
    floatSpeed: 0.9, floatAmplitude: 0.05, floatPhase: 2.4,
  },
  {
    url: "/HeroIdea/models/plano.glb",
    targetX: 0.75, targetY: 0.75, targetZ: -0.3,
    startX: 1.6, startY: -1.0, startZ: 2.5,
    rotX: 0.15, rotY: -0.2, rotZ: 0.1,
    scale: 1.4, delay: 300,
    floatSpeed: 0.7, floatAmplitude: 0.07, floatPhase: 3.6,
  },
];

const CAMERA_Z = 5;
const FOV = 50;
/** Ancho visible de la escena en un desktop 16:9 (referencia para escalar). */
const DESKTOP_REF_WIDTH = 8.3;
const ENTRY_MS = 1800;

/** Pantallas que conservan la composición libre original. */
const DESKTOP_MIN_ASPECT = 1.5;
const DESKTOP_MIN_W = 1100;
const DESKTOP_MIN_H = 640;

/** Layout adaptativo: celda mínima/máxima (px) y fracción que ocupa el modelo. */
const MIN_CELL = 96;
const MAX_CELL = 380;
const FILL = 0.86;
const GAP = 16;
const GUTTER = 16;
/** Desplazamiento (en celdas) de las filas impares: rompe la cuadrícula sin gastar ancho. */
const STAGGER = 0.35;

type ThreeModule = typeof import("three");
type GLTFLoaderCtor =
  typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;

type Region = { x: number; y: number; w: number; h: number };
/** Posición/tamaño (px del canvas) de un modelo en el layout adaptativo. */
type Slot = { cx: number; cy: number; cell: number; d: number; show: boolean };

type Layout = {
  /** Tamaño visible de la escena en unidades de mundo. */
  width: number;
  height: number;
  /** Tamaño del canvas en px y px→mundo. */
  canvasW: number;
  canvasH: number;
  wpp: number;
  adaptive: boolean;
  slots: Slot[];
  fit: number;
};

type Item = {
  index: number;
  pivot: Group;
  /** Grupo intermedio: orienta de frente a cámara las tarjetas en el layout adaptativo. */
  face: Group;
  faceQ: Quaternion;
  config: ModelConfig;
  baseScale: number;
  /** Radio de la esfera envolvente en unidades del modelo (sin escalar). */
  radius: number;
  /** Posición/escala suavizadas hacia el objetivo del layout. */
  x: number;
  y: number;
  z: number;
  s: number;
  placed: boolean;
  t0: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/**
 * Espacio libre (px del canvas): la franja entre el header y el bloque de
 * texto, y la columna a la derecha del texto/CTAs/features.
 */
function measureRegions(container: HTMLElement): Region[] {
  const c = container.getBoundingClientRect();
  const W = c.width;
  const H = c.height;

  const header = document.querySelector("header");
  const top =
    Math.max(0, (header ? header.getBoundingClientRect().bottom : 72) - c.top) + GAP;

  let contentTop = Infinity;
  let contentRight = 0;
  document
    .querySelectorAll(".hero-typing-container, .hero-ctas-row > *, .hero-feature-item")
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      contentTop = Math.min(contentTop, r.top - c.top);
      contentRight = Math.max(contentRight, r.right - c.left);
    });
  if (!Number.isFinite(contentTop)) contentTop = H * 0.55;

  const regions: Region[] = [
    { x: GUTTER, y: top, w: W - 2 * GUTTER, h: contentTop - GAP - top },
    {
      x: contentRight + GAP * 1.5,
      y: top,
      w: W - GUTTER - (contentRight + GAP * 1.5),
      h: H - GUTTER - top,
    },
  ].filter((r) => r.w > 8 && r.h > 8);

  if (!regions.length) {
    regions.push({ x: GUTTER, y: top, w: W - 2 * GUTTER, h: Math.max(8, H - top - GUTTER) });
  }
  return regions;
}

/** Grilla cols×rows que maximiza el lado de la celda (filas impares escalonadas). */
function bestGrid(w: number, h: number, n: number) {
  let best = { cell: 0, cols: 1, rows: n };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const stagger = rows > 1 && n > cols ? STAGGER : 0;
    const cell = Math.min(w / (cols + stagger), h / rows);
    if (cell > best.cell) best = { cell, cols, rows };
  }
  return best;
}

/** Reparte N modelos en la región libre que admita más modelos y celdas más grandes. */
function computeSlots(regions: Region[], total: number): Slot[] {
  let best: { region: Region; n: number; cols: number; rows: number; cell: number } | null = null;

  for (const region of regions) {
    let n = Math.max(1, total);
    let grid = bestGrid(region.w, region.h, n);
    while (n > 1 && grid.cell < MIN_CELL) {
      n--;
      grid = bestGrid(region.w, region.h, n);
    }
    const cell = Math.min(grid.cell, MAX_CELL);
    if (!best || n > best.n || (n === best.n && cell > best.cell)) {
      best = { region, n, cols: grid.cols, rows: grid.rows, cell };
    }
  }
  if (!best) return [];

  const { region, n, cols, rows, cell } = best;
  const stagger = rows > 1 && n > cols;
  const gridW = cols * cell + (stagger ? cell * STAGGER : 0);
  const gridH = rows * cell;
  const x0 = region.x + (region.w - gridW) / 2;
  const y0 = region.y + (region.h - gridH) / 2;

  const slots: Slot[] = [];
  for (let i = 0; i < total; i++) {
    if (i >= n) {
      slots.push({ cx: 0, cy: 0, cell, d: 0, show: false });
      continue;
    }
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = row < rows - 1 ? cols : n - cols * (rows - 1);
    const offset =
      inRow < cols ? (gridW - inRow * cell) / 2 : stagger ? (row % 2) * (cell * STAGGER) : 0;
    const k = MODEL_CONFIGS[i]?.scale ?? 2.8;
    slots.push({
      cx: x0 + offset + col * cell + cell / 2,
      cy: y0 + row * cell + cell / 2,
      cell,
      // El modelo más chico del set (plano) conserva algo de jerarquía.
      d: cell * FILL * (0.8 + 0.2 * clamp(k / 2.8, 0, 1)),
      show: true,
    });
  }
  return slots;
}

function computeLayout(
  canvasW: number,
  canvasH: number,
  regions: Region[]
): Layout {
  const height = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
  const aspect = canvasW / canvasH;
  const width = height * aspect;
  const wpp = height / canvasH;

  const desktop =
    aspect >= DESKTOP_MIN_ASPECT && canvasW >= DESKTOP_MIN_W && canvasH >= DESKTOP_MIN_H;
  if (desktop) {
    return {
      width, height, canvasW, canvasH, wpp,
      adaptive: false,
      slots: [],
      fit: clamp(width / DESKTOP_REF_WIDTH, 0.4, 1),
    };
  }

  const slots = computeSlots(regions, MODEL_CONFIGS.length);
  const cell = slots[0]?.cell ?? MIN_CELL;
  return {
    width, height, canvasW, canvasH, wpp,
    adaptive: true,
    slots,
    // Solo escala la amplitud de flotación en este modo.
    fit: clamp((cell * wpp) / 3.4, 0.15, 1),
  };
}

/** Objetivo (mundo) y escala de un modelo según el layout vigente; null = oculto. */
function resolveTarget(
  out: Vector3,
  item: Item,
  l: Layout
): { scale: number } | null {
  const c = item.config;
  if (l.adaptive) {
    const slot = l.slots[item.index];
    if (!slot || !slot.show) return null;
    out.set(
      (slot.cx - l.canvasW / 2) * l.wpp,
      -(slot.cy - l.canvasH / 2) * l.wpp,
      0
    );
    return { scale: (slot.d * l.wpp) / 2 / item.radius };
  }
  out.set((c.targetX - 0.5) * l.width, -(c.targetY - 0.5) * l.height, c.targetZ);
  return { scale: item.baseScale * l.fit };
}

function writeStart(out: Vector3, c: ModelConfig, l: Layout) {
  out.set(c.startX * l.width, c.startY * l.height, c.startZ);
}

/**
 * Rotación que lleva el lado más largo de un modelo plano al eje X, el medio
 * al Y y el más fino (el espesor de la tarjeta) al Z, o sea de frente a la
 * cámara. Los modelos que no son planos (un pin, un objeto con volumen)
 * conservan su orientación original.
 */
function faceForwardQuat(THREE: ThreeModule, size: Vector3) {
  const axes = [
    { v: new THREE.Vector3(1, 0, 0), s: size.x },
    { v: new THREE.Vector3(0, 1, 0), s: size.y },
    { v: new THREE.Vector3(0, 0, 1), s: size.z },
  ].sort((p, q) => q.s - p.s);
  if (!(axes[2].s < axes[1].s * 0.5)) return new THREE.Quaternion();
  const a = axes[0].v;
  const b = axes[1].v;
  const c = new THREE.Vector3().crossVectors(a, b); // mantiene la base "derecha"
  const m = new THREE.Matrix4().makeBasis(a, b, c).transpose();
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function startScene(
  THREE: ThreeModule,
  GLTFLoader: GLTFLoaderCtor,
  container: HTMLDivElement,
  isDisposed: () => boolean
): (() => void) | undefined {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  // ── Renderer ──────────────────────────────────────────────
  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !coarse,
      powerPreference: coarse ? "default" : "high-performance",
    });
  } catch (e) {
    console.warn("[HeroScene] WebGL no disponible:", e);
    return undefined;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const getSize = () => {
    const r = container.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  const { w, h } = getSize();
  renderer.setSize(w, h);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.pointerEvents = "none";
  container.appendChild(renderer.domElement);

  const onContextLost = (e: Event) => e.preventDefault(); // permite restaurar
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);

  // ── Scene & Camera ────────────────────────────────────────
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const layout: Layout = computeLayout(w, h, measureRegions(container));

  // ── Luces ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(5, 5, 5);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xb8c5ff, 0.6);
  dir2.position.set(-3, 2, -2);
  scene.add(dir2);
  const dir3 = new THREE.DirectionalLight(0xffd4e8, 0.4);
  dir3.position.set(0, -3, 4);
  scene.add(dir3);

  // ── Environment map (antes de cargar modelos) ─────────────
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envGeom = new THREE.IcosahedronGeometry(1, 2);
  const envMat = new THREE.MeshBasicMaterial({ color: 0xe8edf8, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(envGeom, envMat));
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  // En three recientes la intensidad del env se controla desde la escena.
  (scene as unknown as { environmentIntensity?: number }).environmentIntensity = 1.5;
  pmrem.dispose();
  envGeom.dispose();
  envMat.dispose();

  // ── Carga de modelos (en paralelo) ────────────────────────
  const items: Item[] = [];
  const loader = new GLTFLoader();

  const applyLayout = (item: Item) => {
    if (layout.adaptive) item.face.quaternion.copy(item.faceQ);
    else item.face.quaternion.identity();
  };

  MODEL_CONFIGS.forEach(async (config, index) => {
    try {
      const gltf = await loader.loadAsync(config.url);
      if (isDisposed()) return;
      const model = gltf.scene;

      // Normalizar tamaño y centrar dentro de pivote > face > modelo
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      model.position.sub(box.getCenter(new THREE.Vector3()));

      const face = new THREE.Group();
      face.add(model);
      const pivot = new THREE.Group();
      pivot.add(face);

      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as InstanceType<typeof THREE.MeshStandardMaterial>;
          if (mat.isMeshStandardMaterial) {
            mat.envMapIntensity = 1.5;
            mat.needsUpdate = true;
          }
        }
      });

      const item: Item = {
        index,
        pivot,
        face,
        faceQ: faceForwardQuat(THREE, size),
        config,
        baseScale: config.scale / maxDim,
        radius: sphere.radius || 1,
        x: 0,
        y: 0,
        z: 0,
        s: 1,
        placed: false,
        t0: performance.now() + config.delay,
      };
      applyLayout(item);
      pivot.visible = false;
      scene.add(pivot);
      items.push(item);
    } catch (e) {
      console.warn(`[HeroScene] No se pudo cargar ${config.url}:`, e);
    }
  });

  // ── Loop de animación ─────────────────────────────────────
  const target = new THREE.Vector3();
  const start = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let visible = true;
  let rafId = 0;
  let last = performance.now();

  const animate = () => {
    rafId = requestAnimationFrame(animate);
    if (!visible) return;

    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now * 0.001;
    const kMove = 1 - Math.exp(-dt * 10);

    for (const item of items) {
      const { pivot, config } = item;
      const goal = resolveTarget(target, item, layout);
      if (!goal) {
        pivot.visible = false;
        continue;
      }

      // Posición y escala suavizadas: al redimensionar o cambiar de layout no saltan.
      const k = reduceMotion || !item.placed ? 1 : kMove;
      item.x += (target.x - item.x) * k;
      item.y += (target.y - item.y) * k;
      item.z += (target.z - item.z) * k;
      item.s += (goal.scale - item.s) * k;
      item.placed = true;
      pos.set(item.x, item.y, item.z);

      if (reduceMotion) {
        pivot.visible = true;
        pivot.position.copy(pos);
        pivot.scale.setScalar(item.s);
        pivot.rotation.set(config.rotX, config.rotY, config.rotZ);
        continue;
      }

      writeStart(start, config, layout);
      const raw = clamp((now - item.t0) / ENTRY_MS, 0, 1);
      pivot.visible = true;
      const eased = 1 - Math.pow(1 - raw, 4);
      // La flotación se activa de a poco al terminar la entrada (sin saltos)
      const ramp = clamp((now - item.t0 - ENTRY_MS) / 800, 0, 1);
      const amp = config.floatAmplitude * layout.fit * ramp;

      pivot.position.lerpVectors(start, pos, eased);
      pivot.position.y += Math.sin(t * config.floatSpeed + config.floatPhase) * amp;
      pivot.position.x +=
        Math.sin(t * config.floatSpeed * 0.7 + config.floatPhase + 1) * amp * 0.5;
      pivot.scale.setScalar(item.s);

      pivot.rotation.x =
        config.rotX +
        Math.PI * 0.5 * (1 - eased) +
        Math.sin(t * config.floatSpeed * 0.5 + config.floatPhase) * 0.02 * ramp;
      pivot.rotation.y =
        config.rotY +
        Math.PI * (1 - eased) +
        Math.sin(t * config.floatSpeed * 0.3 + config.floatPhase + 0.5) * 0.03 * ramp;
      pivot.rotation.z = config.rotZ;
    }

    renderer.render(scene, camera);
  };
  animate();

  // ── Resize / relayout ─────────────────────────────────────
  const relayout = () => {
    const { w: rw, h: rh } = getSize();
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    renderer.setSize(rw, rh);
    Object.assign(layout, computeLayout(rw, rh, measureRegions(container)));
    items.forEach(applyLayout);
  };
  const resizeObserver = new ResizeObserver(relayout);
  resizeObserver.observe(container);
  // Texto, CTAs y features cambian de tamaño al cargar la fuente o al hacer wrap.
  document
    .querySelectorAll(".hero-typing-container, .hero-ctas-row, .hero-features")
    .forEach((el) => resizeObserver.observe(el));

  // ── Pausar cuando el hero no se ve ────────────────────────
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(container);

  // ── Cleanup ───────────────────────────────────────────────
  return () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    io.disconnect();
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  };
}

export function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let teardown: (() => void) | undefined;

    (async () => {
      // Dynamic import para code-splitting
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;
      teardown = startScene(THREE, GLTFLoader, container, () => disposed);
    })();

    return () => {
      disposed = true;
      teardown?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    />
  );
}
