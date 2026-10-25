/**
 * Configuración del asesor (identidad, modelo 3D, animaciones por caso, encuadre).
 * La edita el admin en `/admin/asesor`: trabaja sobre un BORRADOR, lo prueba y recién
 * entonces lo PUBLICA; la gente siempre ve lo publicado. Todo lo que entra se normaliza
 * acá (nunca se confía en la forma de lo que llega del cliente ni de la base).
 */
import { connectDB } from "@/lib/db/connect";
import { AdvisorConfig } from "@/lib/db/models/AdvisorConfig";
import { memo } from "@/lib/intelligence/cache";
import { AGENTS, AGENT_IDS, type AgentId } from "@/lib/agents/registry";

export type ClipInfo = { name: string; duration: number };
export type AdvisorRoles = { idle: string; talking: string[]; surprised: string[]; tap: string[] };
export type AdvisorFraming = { distance: number; height: number; rotationY: number; scale: number; light: number };

export type AdvisorContent = {
  name: string;
  description: string;
  enabled: { agency: boolean; explorer: boolean };
  model: { source: "bundled" | "uploaded"; url: string; providerId?: string; bytes?: number; label?: string };
  clips: ClipInfo[];
  roles: AdvisorRoles;
  disabled: string[];
  framing: AdvisorFraming;
  poster?: string;
};

export type LibraryEntry = { url: string; providerId: string; bytes: number; label?: string; clips: ClipInfo[]; uploadedAt: string };

/** Límites de la subida del modelo 3D. */
export const MODEL_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_LIBRARY = 5;

export const BUNDLED_MODEL_URL = "/advisor/agent.glb";

/** El modelo que viene en el repositorio: sus clips se conocen de antemano (se re-detectan al cargarlo en el estudio). */
export const DEFAULT_CONTENT: AdvisorContent = {
  name: "",
  description: "Tu asesor inmobiliario: analiza tus números, te cuenta qué cambió y te propone qué hacer.",
  enabled: { agency: true, explorer: true },
  model: { source: "bundled", url: BUNDLED_MODEL_URL, label: "Modelo incluido" },
  clips: [
    { name: "Normal", duration: 4 },
    { name: "Hablando", duration: 2 },
    { name: "Sorprendido", duration: 1.6 },
    { name: "Parpadeando", duration: 2 },
    { name: "Asintiendo", duration: 1.6 },
    { name: "Feliz", duration: 2 },
  ],
  roles: { idle: "Normal", talking: ["Hablando"], surprised: ["Sorprendido"], tap: ["Parpadeando", "Asintiendo", "Feliz"] },
  disabled: [],
  framing: { distance: 1, height: 0, rotationY: 0, scale: 1, light: 1 },
};

const clamp = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, each = 60): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, each)).filter(Boolean))].slice(0, max) : [];

/**
 * ¿Es una URL de modelo permitida? Sólo el modelo incluido, un archivo local de desarrollo
 * o un `.glb` de la carpeta del asesor en NUESTRO Cloudinary. Nunca un host de terceros.
 */
export function isAllowedModelUrl(url: string): boolean {
  if (/^\/(?:advisor|uploads)\/[A-Za-z0-9._-]+\.glb$/i.test(url)) return true;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      u.pathname.startsWith(`/${cloud}/raw/upload/`) &&
      /\.glb$/i.test(u.pathname) &&
      u.pathname.includes("/umbral/advisor/")
    );
  } catch {
    return false;
  }
}

/** Una imagen de póster permitida: archivo propio o de nuestro Cloudinary. */
export function isAllowedPosterUrl(url: string): boolean {
  if (/^\/(?:advisor|uploads)\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(url)) return true;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && u.pathname.startsWith(`/${cloud}/image/upload/`);
  } catch {
    return false;
  }
}

function normalizeClips(v: unknown): ClipInfo[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: ClipInfo[] = [];
  for (const c of v) {
    const name = text((c as { name?: unknown })?.name, 60);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, duration: clamp((c as { duration?: unknown })?.duration, 0, 600, 0) });
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * Completa y sanea un contenido (de la base o del cliente) con valores válidos. Con `agentId` aplica las reglas de ese
 * agente: el asesor nace encendido (como siempre); los demás NACEN APAGADOS y sólo se encienden si el admin los marca
 * a propósito, y nunca para un público al que no sirven (marketing y correo no son para exploradores).
 */
export function normalizeContent(raw: unknown, agentId: AgentId = "advisor"): AdvisorContent {
  const def = AGENTS[agentId];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = (r.model && typeof r.model === "object" ? r.model : {}) as Record<string, unknown>;

  const wantedUrl = text(m.url, 500);
  const modelOk = wantedUrl !== "" && isAllowedModelUrl(wantedUrl);
  const model: AdvisorContent["model"] = modelOk
    ? {
        source: m.source === "uploaded" ? "uploaded" : "bundled",
        url: wantedUrl,
        providerId: typeof m.providerId === "string" ? m.providerId.slice(0, 300) : undefined,
        bytes: typeof m.bytes === "number" && Number.isFinite(m.bytes) ? m.bytes : undefined,
        label: text(m.label, 80) || undefined,
      }
    : DEFAULT_CONTENT.model;

  // Si el modelo es el incluido y no hay clips guardados, se conocen de antemano.
  let clips = normalizeClips(r.clips);
  if (clips.length === 0 && model.url === BUNDLED_MODEL_URL) clips = DEFAULT_CONTENT.clips;
  const known = new Set(clips.map((c) => c.name));
  const keep = (names: string[]) => (known.size > 0 ? names.filter((n) => known.has(n)) : names);

  const rolesRaw = (r.roles && typeof r.roles === "object" ? r.roles : {}) as Record<string, unknown>;
  const idleWanted = text(rolesRaw.idle, 60) || DEFAULT_CONTENT.roles.idle;
  const roles: AdvisorRoles = {
    idle: known.size === 0 || known.has(idleWanted) ? idleWanted : (clips[0]?.name ?? idleWanted),
    talking: keep(list(rolesRaw.talking, 10)),
    surprised: keep(list(rolesRaw.surprised, 10)),
    tap: keep(list(rolesRaw.tap, 10)),
  };
  // Un contenido sin ninguna asignación explícita (primer uso) toma las de por defecto.
  const hasRoles = Array.isArray(rolesRaw.talking) || Array.isArray(rolesRaw.surprised) || Array.isArray(rolesRaw.tap);
  const finalRoles = hasRoles ? roles : { ...DEFAULT_CONTENT.roles, ...(known.size > 0 ? { talking: keep(DEFAULT_CONTENT.roles.talking), surprised: keep(DEFAULT_CONTENT.roles.surprised), tap: keep(DEFAULT_CONTENT.roles.tap) } : {}) };

  const f = (r.framing && typeof r.framing === "object" ? r.framing : {}) as Record<string, unknown>;
  const enabled = (r.enabled && typeof r.enabled === "object" ? r.enabled : {}) as Record<string, unknown>;
  const poster = text(r.poster, 500);

  const isAdvisor = agentId === "advisor";
  return {
    name: text(r.name, 40),
    description: text(r.description, 300) || def.defaultDescription,
    enabled: {
      agency: def.audiences.includes("agency") && (isAdvisor ? enabled.agency !== false : enabled.agency === true),
      explorer: def.audiences.includes("explorer") && (isAdvisor ? enabled.explorer !== false : enabled.explorer === true),
    },
    model,
    clips,
    roles: finalRoles,
    disabled: list(r.disabled, 30).filter((n) => known.size === 0 || known.has(n)),
    framing: {
      distance: clamp(f.distance, 0.5, 2.5, 1),
      height: clamp(f.height, -1, 1, 0),
      rotationY: clamp(f.rotationY, -3.2, 3.2, 0),
      scale: clamp(f.scale, 0.6, 1.6, 1),
      light: clamp(f.light, 0.3, 2.5, 1),
    },
    poster: poster && isAllowedPosterUrl(poster) ? poster : undefined,
  };
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** Prefijo de caché de todas las configuraciones de agentes (no lo borra `invalidateAgency`, que sólo toca `advisor:<agencia>…`). */
export const CONFIG_CACHE_PREFIX = "agents:config";
const PUBLISHED_KEY = `${CONFIG_CACHE_PREFIX}:published`;

/**
 * Lo publicado de CADA agente (lo que ve la gente), en una sola consulta. Cacheado 60 s; se descarta al publicar.
 * Un agente que no es el asesor y nunca se publicó vale "apagado": el `published` por defecto de Mongoose trae
 * `enabled` en true y lo encendería antes de tiempo, así que sin `publishedAt` no se lee.
 */
export function getPublishedAgents(): Promise<Record<AgentId, AdvisorContent>> {
  return memo(PUBLISHED_KEY, 60_000, async () => {
    const out = {} as Record<AgentId, AdvisorContent>;
    for (const id of AGENT_IDS) out[id] = normalizeContent({}, id);
    try {
      await connectDB();
      const docs = await AdvisorConfig.find({ key: { $in: AGENT_IDS.map((id) => AGENTS[id].storageKey) } })
        .select("key published publishedAt")
        .lean();
      for (const id of AGENT_IDS) {
        const doc = docs.find((d) => d.key === AGENTS[id].storageKey);
        if (doc && (id === "advisor" || doc.publishedAt)) out[id] = normalizeContent(doc.published, id);
      }
    } catch (err) {
      console.error("getPublishedAgents failed:", err);
    }
    return out;
  });
}

/** Lo publicado de un agente (por defecto, el asesor). */
export async function getPublishedConfig(agentId: AgentId = "advisor"): Promise<AdvisorContent> {
  return (await getPublishedAgents())[agentId];
}

export type AdminConfigState = {
  agentId: AgentId;
  draft: AdvisorContent;
  published: AdvisorContent;
  library: LibraryEntry[];
  hasUnpublished: boolean;
  publishedAt: string | null;
};

/** Estado completo para el estudio del admin (nunca se manda a clientes comunes). */
export async function getAdminConfigState(agentId: AgentId = "advisor"): Promise<AdminConfigState> {
  await connectDB();
  const key = AGENTS[agentId].storageKey;
  const doc = await AdvisorConfig.findOne({ key }).lean();
  // La biblioteca de modelos 3D es una sola, compartida por todos los agentes (vive en el documento del asesor).
  const libraryDoc = agentId === "advisor" ? doc : await AdvisorConfig.findOne({ key: AGENTS.advisor.storageKey }).select("library").lean();
  const published = agentId === "advisor" || doc?.publishedAt ? normalizeContent(doc?.published, agentId) : normalizeContent({}, agentId);
  const draft = doc?.draft ? normalizeContent(doc.draft, agentId) : published;
  return {
    agentId,
    draft,
    published,
    library: (libraryDoc?.library ?? []).map((e) => ({
      url: e.url,
      providerId: e.providerId,
      bytes: e.bytes ?? 0,
      label: e.label ?? undefined,
      clips: normalizeClips(e.clips),
      uploadedAt: new Date(e.uploadedAt ?? Date.now()).toISOString(),
    })),
    hasUnpublished: JSON.stringify(draft) !== JSON.stringify(published),
    publishedAt: doc?.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
  };
}

// ─── Vista pública ───────────────────────────────────────────────────────────

/** Lo único que recibe el navegador de cualquier persona. */
export type PublicAdvisorConfig = {
  /** Qué agente es (`advisor` si no se indica). */
  id: AgentId;
  /** Su rol, para distinguirlo en el selector cuando comparten modelo y no tienen nombre: "Marketing". */
  roleLabel: string;
  name: string;
  /** El nombre para mostrar: lo que definió el admin o "Asesor". */
  displayName: string;
  /** Complemento para "Preguntale …": "a Nubi" si tiene nombre, "al asesor" si no (nunca "a Asesor"). */
  ctaTo: string;
  description: string;
  enabled: { agency: boolean; explorer: boolean };
  modelUrl: string;
  clips: ClipInfo[];
  roles: AdvisorRoles;
  disabled: string[];
  framing: AdvisorFraming;
  poster: string | null;
};

export function toPublicConfig(c: AdvisorContent, agentId: AgentId = "advisor"): PublicAdvisorConfig {
  const def = AGENTS[agentId];
  return {
    id: agentId,
    roleLabel: def.roleLabel,
    name: c.name,
    displayName: c.name || def.roleLabel,
    ctaTo: c.name ? `a ${c.name}` : def.ctaFallback,
    description: c.description,
    enabled: c.enabled,
    modelUrl: c.model.url,
    clips: c.clips,
    roles: c.roles,
    disabled: c.disabled,
    framing: c.framing,
    poster: c.poster ?? null,
  };
}
