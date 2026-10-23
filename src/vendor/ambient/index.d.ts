// Tipos escritos a mano para el reproductor de la portada viva (los .js de esta carpeta no se tipan).
// Sólo declara lo que usa la plataforma; ver README.md de esta carpeta.

export type AmbientParams = Record<string, number>;

export type AmbientAsset = { file: string; bytes: number; sha256?: string; width: number; height: number };

export type AmbientState = {
  id: string;
  label: string;
  plates: Record<string, Record<string, AmbientAsset>>;
  params: AmbientParams;
};

export type AmbientManifest = {
  schemaVersion: 1;
  propertyId: string;
  title?: string;
  disclosure: string;
  aspect: [number, number];
  focus: [number, number];
  initialState: string;
  transitionMs: number;
  variants: Record<string, { width: number; height: number }>;
  formats: string[];
  layers: Record<"masks" | "lights" | "lightOrder", Record<string, AmbientAsset> | null>;
  states: AmbientState[];
};

export type AmbientPlayerOptions = {
  manifest?: AmbientManifest;
  manifestUrl?: string;
  initialState?: string;
  /** `false` = sin botones propios del reproductor (la plataforma dibuja los suyos). */
  controls?: boolean | HTMLElement;
  weatherControls?: boolean;
  forceFallback?: boolean;
  reducedMotion?: boolean;
  maxDpr?: number;
  messages?: Record<string, unknown>;
  onReady?: (manifest: AmbientManifest) => void;
  onError?: (error: unknown) => void;
  onStateChange?: (id: string, state: AmbientState) => void;
};

export type AmbientPlayer = {
  ready: Promise<void>;
  setState: (id: string) => Promise<boolean>;
  getState: () => string;
  getStates: () => { id: string; label: string }[];
  getManifest: () => AmbientManifest;
  retry: () => void;
  stats: () => { mode: "webgl" | "fallback"; fps: number; state: string | null; transitioning: boolean; bytesLoaded: number };
  destroy: () => void;
};

export function createAmbientPlayer(container: HTMLElement, options?: AmbientPlayerOptions): AmbientPlayer;
