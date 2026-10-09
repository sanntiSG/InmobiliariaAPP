"use client";

import { useRef, useEffect } from "react";
import type { Group, Material, Quaternion, Vector3 } from "three";

/**
 * Escena Three.js con los GLB del hero flotando. Para cambiar un modelo basta
 * editar HERO_MODELS: no hay posiciones ni tamaños por modelo, el layout se
 * calcula solo a partir del espacio libre real de la pantalla.
 *
 * Cómo evita que se apilen:
 *  1. Cada modelo se normaliza por su esfera envolvente (ocupa un círculo
 *     conocido sin importar su forma ni cómo rote).
 *  2. Se mide el espacio libre (columna a la derecha del texto o franja entre
 *     el header y el texto) y se reparte en una grilla escalonada de celdas.
 *  3. Cada modelo vive dentro de su celda, con margen para flotación y
 *     parallax, así que dos modelos nunca se tocan.
 *  4. Si las celdas quedan demasiado chicas (celulares), se ocultan los
 *     últimos modelos en vez de apretarlos.
 *
 * Los elementos a esquivar se marcan con data-hero-avoid (ver page.tsx).
 * Respeta prefers-reduced-motion: posición final directa, sin animación.
 */
const HERO_MODELS = [
  "/HeroIdea/models/visa.glb",
  "/HeroIdea/models/pinLocation.glb",
  "/HeroIdea/models/playbackvisa.glb",
  "/HeroIdea/models/plano.glb",
];

const CAMERA_Z = 5;
const FOV = 50;
const ENTRY_MS = 1100;
const STAGGER_MS = 90;
const ENTRY_DELAY_MS = 250;
/** Celda mínima (px) para mostrar un modelo; por debajo se ocultan los últimos. */
const MIN_CELL = 104;
const MAX_CELL = 380;
/** Fracción de la celda que ocupa el diámetro del modelo (el resto es margen). */
const FILL = 0.78;
const GAP = 16;
const GUTTER = 16;
/** Desplazamiento (en celdas) de las filas impares: rompe la cuadrícula sin gastar ancho. */
const STAGGER = 0.35;

type ThreeModule = typeof import("three");
type GLTFLoaderCtor =
  typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;

type Region = { x: number; y: number; w: number; h: number };
type Slot = { cx: number; cy: number; cell: number; d: number; show: boolean };

type Item = {
  index: number;
  pivot: Group;
  /** Orienta de frente a cámara los modelos planos (tarjetas). */
  face: Group;
  radius: number;
  mats: { m: Material; transparent: boolean; opacity: number }[];
  /** Posición/escala suavizadas hacia el objetivo del layout (mundo). */
  x: number;
  y: number;
  s: number;
  placed: boolean;
  entered: boolean;
  t0: number;
  rot: [number, number, number];
  floatSpeed: number;
  floatPhase: number;
  depth: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/** Pseudo-aleatorio determinístico (0..1): el layout no cambia entre cargas. */
const rand = (i: number, salt: number) => {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Candidatas de espacio libre, medidas contra los elementos data-hero-avoid. */
function measureRegions(container: HTMLElement): Region[] {
  const c = container.getBoundingClientRect();
  const W = c.width;
  const H = c.height;

  let headerBottom = 72;
  let contentTop = Infinity;
  let contentRight = 0;
  document.querySelectorAll<HTMLElement>("[data-hero-avoid]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (el.dataset.heroAvoid === "header") {
      headerBottom = r.bottom - c.top;
    } else {
      contentTop = Math.min(contentTop, r.top - c.top);
      contentRight = Math.max(contentRight, r.right - c.left);
    }
  });
  if (!Number.isFinite(contentTop)) contentTop = H * 0.55;

  const top = headerBottom + GAP;
  const regions: Region[] = [
    // franja entre el header y el bloque de texto
    { x: GUTTER, y: top, w: W - 2 * GUTTER, h: contentTop - GAP - top },
    // columna a la derecha del texto
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
    const jx = (rand(i, 7) - 0.5) * 0.06 * cell;
    const jy = (rand(i, 8) - 0.5) * 0.06 * cell;
    slots.push({
      cx: x0 + offset + col * cell + cell / 2 + jx,
      cy: y0 + row * cell + cell / 2 + jy,
      cell,
      d: cell * FILL * (0.86 + 0.14 * rand(i, 1)),
      show: true,
    });
  }
  return slots;
}

/**
 * Rotación que lleva el lado más largo de un modelo plano al eje X, el medio
 * al Y y el más fino al Z (de frente a la cámara). Los modelos que no son
 * planos (un pin, un objeto con volumen) conservan su orientación original.
 */
function faceForwardQuat(THREE: ThreeModule, size: Vector3): Quaternion {
  const axes = [
    { v: new THREE.Vector3(1, 0, 0), s: size.x },
    { v: new THREE.Vector3(0, 1, 0), s: size.y },
    { v: new THREE.Vector3(0, 0, 1), s: size.z },
  ].sort((p, q) => q.s - p.s);
  if (!(axes[2].s < axes[1].s * 0.5)) return new THREE.Quaternion();
  const a = axes[0].v;
  const b = axes[1].v;
  const c = new THREE.Vector3().crossVectors(a, b);
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
  const finePointer = window.matchMedia("(pointer: fine)").matches && !reduceMotion;

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
  const viewH = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;

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

  // ── Estado del layout ─────────────────────────────────────
  const items: Item[] = [];
  const layout = { w, h, wpp: viewH / h, slots: [] as Slot[] };

  const relayout = () => {
    const size = getSize();
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    renderer.setSize(size.w, size.h);
    layout.w = size.w;
    layout.h = size.h;
    layout.wpp = viewH / size.h;
    layout.slots = computeSlots(measureRegions(container), items.length || HERO_MODELS.length);
  };

  // ── Carga de modelos (en paralelo; entran todos juntos) ───
  const loader = new GLTFLoader();
  (async () => {
    const results = await Promise.allSettled(HERO_MODELS.map((url) => loader.loadAsync(url)));
    if (isDisposed()) return;

    const born = performance.now() + ENTRY_DELAY_MS;
    let rank = 0;
    results.forEach((res, index) => {
      if (res.status === "rejected") {
        console.warn(`[HeroScene] No se pudo cargar ${HERO_MODELS[index]}:`, res.reason);
        return;
      }
      const model = res.value.scene;

      // Centrar y normalizar por la esfera envolvente (radio = 1 unidad).
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      model.position.sub(box.getCenter(new THREE.Vector3()));

      const face = new THREE.Group();
      face.add(model);
      face.quaternion.copy(faceForwardQuat(THREE, size));
      const pivot = new THREE.Group();
      pivot.add(face);

      const mats: Item["mats"] = [];
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.material) return;
        const list = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of list as Material[]) {
          const std = m as InstanceType<typeof THREE.MeshStandardMaterial>;
          if (std.isMeshStandardMaterial) {
            std.envMapIntensity = 1.5;
            std.needsUpdate = true;
          }
          mats.push({ m, transparent: m.transparent, opacity: m.opacity });
          if (!reduceMotion) {
            m.transparent = true;
            m.opacity = 0;
            m.needsUpdate = true;
          }
        }
      });

      pivot.visible = false;
      scene.add(pivot);
      items.push({
        index: items.length,
        pivot,
        face,
        radius: sphere.radius || 1,
        mats,
        x: 0,
        y: 0,
        s: 1,
        placed: false,
        entered: reduceMotion,
        t0: born + rank++ * STAGGER_MS,
        rot: [
          (rand(index, 2) - 0.5) * 0.3,
          (rand(index, 3) - 0.5) * 0.7,
          (rand(index, 4) - 0.5) * 0.24,
        ],
        floatSpeed: 0.6 + rand(index, 5) * 0.35,
        floatPhase: rand(index, 9) * Math.PI * 2,
        depth: 0.4 + 0.6 * rand(index, 6),
      });
    });
    relayout();
  })();

  // ── Parallax de puntero (solo mouse, nunca en touch ni reduced-motion) ──
  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  const onPointerMove = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (finePointer) window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ── Loop de animación ─────────────────────────────────────
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

    const kPointer = 1 - Math.exp(-dt * 5);
    pointer.x += (pointer.tx - pointer.x) * kPointer;
    pointer.y += (pointer.ty - pointer.y) * kPointer;
    const kMove = 1 - Math.exp(-dt * 10);

    for (const item of items) {
      const slot = layout.slots[item.index];
      const { pivot } = item;
      if (!slot || !slot.show) {
        pivot.visible = false;
        continue;
      }

      const wpp = layout.wpp;
      const tx = (slot.cx - layout.w / 2) * wpp;
      const ty = -(slot.cy - layout.h / 2) * wpp;
      const ts = (slot.d * wpp) / 2 / item.radius;
      const k = reduceMotion || !item.placed ? 1 : kMove;
      item.x += (tx - item.x) * k;
      item.y += (ty - item.y) * k;
      item.s += (ts - item.s) * k;
      item.placed = true;

      const cellW = slot.cell * wpp;

      if (reduceMotion) {
        pivot.visible = true;
        pivot.position.set(item.x, item.y, 0);
        pivot.scale.setScalar(item.s);
        pivot.rotation.set(item.rot[0], item.rot[1], item.rot[2]);
        continue;
      }

      const raw = clamp((now - item.t0) / ENTRY_MS, 0, 1);
      pivot.visible = raw > 0;
      if (raw <= 0) continue;
      const e = 1 - Math.pow(1 - raw, 4);
      const ramp = clamp((now - item.t0 - ENTRY_MS) / 800, 0, 1);

      if (!item.entered) {
        for (const o of item.mats) o.m.opacity = o.opacity * e;
        if (raw >= 1) {
          item.entered = true;
          for (const o of item.mats) {
            o.m.transparent = o.transparent;
            o.m.opacity = o.opacity;
            o.m.needsUpdate = true;
          }
        }
      }

      const amp = cellW * 0.03 * ramp;
      const par = cellW * 0.04 * item.depth;
      pivot.position.set(
        item.x +
          Math.sin(t * item.floatSpeed * 0.7 + item.floatPhase + 1) * amp * 0.5 +
          pointer.x * par,
        item.y -
          (1 - e) * slot.d * wpp * 0.5 +
          Math.sin(t * item.floatSpeed + item.floatPhase) * amp -
          pointer.y * par,
        0
      );
      pivot.scale.setScalar(item.s * (0.85 + 0.15 * e));
      pivot.rotation.set(
        item.rot[0] +
          Math.sin(t * item.floatSpeed * 0.5 + item.floatPhase) * 0.02 * ramp +
          pointer.y * 0.06 * item.depth,
        item.rot[1] +
          (1 - e) * 0.26 +
          Math.sin(t * item.floatSpeed * 0.3 + item.floatPhase + 0.5) * 0.03 * ramp +
          pointer.x * 0.1 * item.depth,
        item.rot[2]
      );
    }

    renderer.render(scene, camera);
  };
  animate();

  // ── Resize / relayout ─────────────────────────────────────
  const resizeObserver = new ResizeObserver(relayout);
  resizeObserver.observe(container);
  // Texto, CTAs y features cambian de alto al cargar la fuente o al hacer wrap.
  document
    .querySelectorAll("[data-hero-avoid]")
    .forEach((el) => resizeObserver.observe(el));
  relayout();

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
    window.removeEventListener("pointermove", onPointerMove);
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
