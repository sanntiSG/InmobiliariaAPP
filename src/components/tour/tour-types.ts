/**
 * Modelo del recorrido 360° navegable — compartido entre el visor público y
 * el editor del dashboard. Ángulos en radianes (convención de Photo Sphere
 * Viewer): yaw ∈ [0, 2π), pitch ∈ [-π/2, π/2].
 */

export type TourLink = {
  id: string;
  /** Id de la escena a la que lleva este marcador. */
  targetId: string;
  label: string;
  /** Posición del marcador en la esfera de ESTA escena. */
  yaw: number;
  pitch: number;
  /** Hacia dónde mira la cámara al llegar a la escena destino. */
  arrivalYaw: number;
  arrivalPitch: number;
};

export type TourScene = {
  id: string;
  label?: string;
  photo360Url: string;
  links: TourLink[];
  /** Posición del nodo en la vista de grafo. */
  graph?: { x: number; y: number };
};

export type VirtualTourConfig = {
  enabled: boolean;
  startId?: string;
};

export const MAX_SCENES = 20;
export const MAX_LINKS_PER_SCENE = 12;

const TAU = Math.PI * 2;

export function normalizeYaw(yaw: number): number {
  return ((yaw % TAU) + TAU) % TAU;
}

export function clampPitch(pitch: number): number {
  return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
}

export function newId(): string {
  return crypto.randomUUID();
}

export function sceneName(scene: TourScene, index: number): string {
  return scene.label?.trim() || `Foto ${index + 1}`;
}

/**
 * Vínculo de regreso: vive en la escena destino de `link` y apunta a la
 * escena de origen. La posición del marcador la elige la persona a mano; al
 * volver, la cámara mira de espaldas al marcador original (180°).
 */
export function makeReturnLink(
  link: TourLink,
  pos: { yaw: number; pitch: number },
  label: string,
  originId: string
): TourLink {
  return {
    id: newId(),
    targetId: originId,
    label: label.slice(0, 40),
    yaw: normalizeYaw(pos.yaw),
    pitch: pos.pitch,
    arrivalYaw: normalizeYaw(link.yaw + Math.PI),
    arrivalPitch: 0,
  };
}

/** Quita una escena y todos los vínculos que apuntaban a ella. */
export function removeScene<T extends { id: string; links: TourLink[] }>(scenes: T[], id: string): T[] {
  return scenes
    .filter((s) => s.id !== id)
    .map((s) => ({ ...s, links: s.links.filter((l) => l.targetId !== id) }));
}

/** Ids alcanzables desde `startId` siguiendo vínculos (BFS). */
export function reachableScenes(scenes: TourScene[], startId: string): Set<string> {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const l of byId.get(id)!.links) queue.push(l.targetId);
  }
  return seen;
}

/** Escenas legacy (sin id/links) → forma nueva. Id estable derivado del índice. */
export function normalizeLegacyScene(
  t: { id?: string; label?: string; photo360Url: string; links?: Partial<TourLink>[]; graph?: { x: number; y: number } },
  index: number
): TourScene {
  return {
    id: t.id ?? `legacy-${index}`,
    label: t.label,
    photo360Url: t.photo360Url,
    links: (t.links ?? []) as TourLink[],
    graph: t.graph,
  };
}

const NODE_COL_GAP = 1;

/**
 * Posiciones por BFS desde la foto de inicio: una columna por "salto" y una
 * fila por escena dentro de cada columna (unidades de grilla, no píxeles).
 * Las escenas inalcanzables van en una columna extra al final. Lo usan el
 * mapa de nodos (React Flow) y el mini mapa del panel.
 */
export function layoutScenes(
  scenes: TourScene[],
  startId: string | undefined
): Map<string, { col: number; row: number }> {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const layer = new Map<string, number>();
  const queue: string[] = [];
  const seed = startId && byId.has(startId) ? startId : scenes[0]?.id;
  if (seed) {
    layer.set(seed, 0);
    queue.push(seed);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of byId.get(id)?.links ?? []) {
      if (!layer.has(l.targetId) && byId.has(l.targetId)) {
        layer.set(l.targetId, layer.get(id)! + NODE_COL_GAP);
        queue.push(l.targetId);
      }
    }
  }
  const extra = Math.max(-1, ...layer.values()) + 1;
  const rows = new Map<number, number>();
  const out = new Map<string, { col: number; row: number }>();
  for (const s of scenes) {
    const col = layer.get(s.id) ?? extra;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    out.set(s.id, { col, row });
  }
  return out;
}
