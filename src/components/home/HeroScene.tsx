"use client";

import { useRef, useEffect } from "react";
import type { Group, Quaternion, Vector3 } from "three";

/**
 * Escena Three.js que renderiza modelos GLB flotando al estilo del hero
 * de referencia (HeroSecuence). Los modelos entran volando desde fuera
 * de la pantalla y se asientan con una flotación continua. Usa Three.js
 * directo (sin R3F) para minimizar el bundle.
 *
 * Desktop: layout libre a la derecha del texto.
 * Mobile (vertical): los modelos se acomodan en la franja libre entre el
 * header y el bloque de texto (.hero-typing-container), medida en runtime,
 * y se orientan de frente a la cámara.
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
  /** Posición mobile: u = 0..1 a lo ancho, v = 0..1 dentro de la franja libre */
  mobileU: number;
  mobileV: number;
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
    mobileU: 0.62, mobileV: 0.36,
    startX: 1.8, startY: -1.2, startZ: 2,
    rotX: -0.15, rotY: 0.3, rotZ: -0.1,
    scale: 2.8, delay: 200,
    floatSpeed: 0.8, floatAmplitude: 0.06, floatPhase: 0,
  },
  {
    url: "/HeroIdea/models/playbackvisa.glb",
    targetX: 0.35, targetY: 0.2, targetZ: -0.5,
    mobileU: 0.36, mobileV: 0.2,
    startX: 1.5, startY: -1.5, startZ: 3,
    rotX: 0.2, rotY: -0.4, rotZ: 0.15,
    scale: 2.8, delay: 400,
    floatSpeed: 0.65, floatAmplitude: 0.08, floatPhase: 1.2,
  },
  {
    url: "/HeroIdea/models/pinLocation.glb",
    targetX: 0.7, targetY: 0.55, targetZ: 0.5,
    mobileU: 0.68, mobileV: 0.78,
    startX: 2.0, startY: -0.8, startZ: 1.5,
    rotX: -0.1, rotY: 0.5, rotZ: -0.2,
    scale: 2.8, delay: 600,
    floatSpeed: 0.9, floatAmplitude: 0.05, floatPhase: 2.4,
  },
  {
    url: "/HeroIdea/models/plano.glb",
    targetX: 0.75, targetY: 0.75, targetZ: -0.3,
    mobileU: 0.3, mobileV: 0.74,
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
/** Por debajo de este aspect ratio (alto > ancho) se usa el layout mobile. */
const MOBILE_ASPECT = 0.9;

type ThreeModule = typeof import("three");
type GLTFLoaderCtor =
  typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;

/** Franja vertical libre (normalizada 0-1 respecto al alto del canvas). */
type Band = { topN: number; hN: number };

type Layout = {
  width: number;
  height: number;
  isMobile: boolean;
  band: Band | null;
  fit: number;
};

type Item = {
  pivot: Group;
  /** Grupo intermedio: orienta el modelo de frente a cámara en mobile. */
  face: Group;
  faceQ: Quaternion;
  config: ModelConfig;
  baseScale: number;
  t0: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/** Mide el espacio libre entre el header y el bloque de texto del hero. */
function measureBand(container: HTMLElement): Band | null {
  const c = container.getBoundingClientRect();
  if (c.height < 1) return null;

  const header = document.querySelector("header");
  const text = document.querySelector(".hero-typing-container");

  const top =
    Math.max(0, (header ? header.getBoundingClientRect().bottom : 72) - c.top) + 12;
  const bottom =
    (text ? text.getBoundingClientRect().top - c.top : c.height * 0.45) - 12;
  const h = bottom - top;

  // Si casi no hay espacio, mejor el layout desktop que apretar todo.
  if (h < 120 || h < c.height * 0.16) return null;
  return { topN: top / c.height, hN: h / c.height };
}

function computeLayout(aspect: number, band: Band | null): Layout {
  const height = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
  const width = height * aspect;
  const isMobile = aspect < MOBILE_ASPECT && band !== null;

  let fit = clamp(width / DESKTOP_REF_WIDTH, 0.4, 1);
  if (isMobile && band) {
    // Lado largo de la tarjeta grande (2.8 u en desktop) ≤ 55% del ancho
    // y ≤ 75% del alto de la franja libre.
    const bandWorldH = band.hN * height;
    fit = clamp(Math.min(width * 0.55, bandWorldH * 0.75) / 2.8, 0.2, 1);
  }
  return { width, height, isMobile, band, fit };
}

function writeTarget(out: Vector3, c: ModelConfig, l: Layout) {
  if (l.isMobile && l.band) {
    const yN = l.band.topN + c.mobileV * l.band.hN;
    out.set((c.mobileU - 0.5) * l.width, (0.5 - yN) * l.height, c.targetZ);
  } else {
    out.set(
      (c.targetX - 0.5) * l.width,
      -(c.targetY - 0.5) * l.height,
      c.targetZ
    );
  }
}

function writeStart(out: Vector3, c: ModelConfig, l: Layout) {
  out.set(c.startX * l.width, c.startY * l.height, c.startZ);
}

/**
 * Rotación que lleva el lado más largo del modelo al eje X, el medio al Y y
 * el más fino (el espesor de la tarjeta) al Z, o sea de frente a la cámara.
 */
function faceForwardQuat(THREE: ThreeModule, size: Vector3) {
  const axes = [
    { v: new THREE.Vector3(1, 0, 0), s: size.x },
    { v: new THREE.Vector3(0, 1, 0), s: size.y },
    { v: new THREE.Vector3(0, 0, 1), s: size.z },
  ].sort((p, q) => q.s - p.s);
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

  const layout: Layout = computeLayout(w / h, measureBand(container));

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
    item.pivot.scale.setScalar(item.baseScale * layout.fit);
    if (layout.isMobile) item.face.quaternion.copy(item.faceQ);
    else item.face.quaternion.identity();
  };

  MODEL_CONFIGS.forEach(async (config) => {
    try {
      const gltf = await loader.loadAsync(config.url);
      if (isDisposed()) return;
      const model = gltf.scene;

      // Normalizar tamaño y centrar dentro de pivote > face > modelo
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
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
        pivot,
        face,
        faceQ: faceForwardQuat(THREE, size),
        config,
        baseScale: config.scale / maxDim,
        t0: performance.now() + config.delay,
      };
      applyLayout(item);
      scene.add(pivot);
      items.push(item);
    } catch (e) {
      console.warn(`[HeroScene] No se pudo cargar ${config.url}:`, e);
    }
  });

  // ── Loop de animación ─────────────────────────────────────
  const target = new THREE.Vector3();
  const start = new THREE.Vector3();
  let visible = true;
  let rafId = 0;

  const animate = () => {
    rafId = requestAnimationFrame(animate);
    if (!visible) return;

    const now = performance.now();
    const t = now * 0.001;

    for (const item of items) {
      const { pivot, config } = item;
      writeTarget(target, config, layout);

      if (reduceMotion) {
        pivot.position.copy(target);
        pivot.rotation.set(config.rotX, config.rotY, config.rotZ);
        continue;
      }

      writeStart(start, config, layout);
      const raw = clamp((now - item.t0) / ENTRY_MS, 0, 1);
      const eased = 1 - Math.pow(1 - raw, 4);
      // La flotación se activa de a poco al terminar la entrada (sin saltos)
      const ramp = clamp((now - item.t0 - ENTRY_MS) / 800, 0, 1);
      const amp = config.floatAmplitude * layout.fit * ramp;

      pivot.position.lerpVectors(start, target, eased);
      pivot.position.y += Math.sin(t * config.floatSpeed + config.floatPhase) * amp;
      pivot.position.x +=
        Math.sin(t * config.floatSpeed * 0.7 + config.floatPhase + 1) * amp * 0.5;

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
    Object.assign(layout, computeLayout(rw / rh, measureBand(container)));
    items.forEach(applyLayout);
  };
  const resizeObserver = new ResizeObserver(relayout);
  resizeObserver.observe(container);
  // El bloque de texto cambia de alto al cargar la fuente o al hacer wrap.
  const textEl = document.querySelector(".hero-typing-container");
  if (textEl) resizeObserver.observe(textEl);

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