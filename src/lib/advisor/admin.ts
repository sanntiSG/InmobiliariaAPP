/**
 * Operaciones del estudio del admin sobre la configuración del asesor. Todo pasa por
 * `normalizeContent`: lo que el cliente manda nunca se guarda tal cual.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { AdvisorConfig } from "@/lib/db/models/AdvisorConfig";
import { invalidate } from "@/lib/intelligence/cache";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { AGENTS, isAgentId, type AgentId } from "@/lib/agents/registry";
import { limitOr429 } from "@/lib/security/rate-limit";
import { BUNDLED_MODEL_URL, CONFIG_CACHE_PREFIX, MAX_LIBRARY, getAdminConfigState, normalizeContent, type AdminConfigState, type AdvisorContent, type ClipInfo } from "./config";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Guardia común de las rutas del estudio: admin real + límite de ritmo. */
export async function adminGuard(req: Request): Promise<{ userId: string } | NextResponse> {
  const user = await requireFreshAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "admin-advisor", 120, 60, { userId: user.id });
  if (limited) return limited;
  return { userId: user.id };
}

const refresh = () => invalidate(CONFIG_CACHE_PREFIX);

/** Documento donde viven los modelos 3D subidos: uno solo para todos los agentes (el del asesor, que ya existe). */
const LIBRARY_KEY = AGENTS.advisor.storageKey;

/** Agente al que se refiere una petición del estudio: `?agent=marketing`; sin parámetro, el asesor. `null` si es inválido. */
export function agentFromRequest(req: Request): AgentId | null {
  const raw = new URL(req.url).searchParams.get("agent");
  if (raw == null) return "advisor";
  return isAgentId(raw) ? raw : null;
}

/** Guarda el borrador. El modelo elegido tiene que ser el incluido o uno de la biblioteca. */
export async function saveDraft(raw: unknown, userId: string, agentId: AgentId = "advisor"): Promise<AdminConfigState> {
  await connectDB();
  const key = AGENTS[agentId].storageKey;
  const lib = await AdvisorConfig.findOne({ key: LIBRARY_KEY }).select("library").lean();
  const owned = new Set([BUNDLED_MODEL_URL, ...(lib?.library ?? []).map((l) => l.url)]);
  let draft = normalizeContent(raw, agentId);
  if (!owned.has(draft.model.url)) draft = normalizeContent({ ...draft, model: undefined }, agentId);
  // Un agente nuevo se crea con su "publicado" explícito y APAGADO (si no, el valor por defecto de Mongoose lo enciende).
  const onInsert = agentId === "advisor" ? { key } : { key, published: normalizeContent({}, agentId) };
  await AdvisorConfig.updateOne({ key }, { $set: { draft, updatedBy: userId }, $setOnInsert: onInsert }, { upsert: true });
  return getAdminConfigState(agentId);
}

export async function publishDraft(userId: string, agentId: AgentId = "advisor"): Promise<AdminConfigState> {
  await connectDB();
  const key = AGENTS[agentId].storageKey;
  const doc = await AdvisorConfig.findOne({ key }).select("draft published").lean();
  const published: AdvisorContent = normalizeContent(doc?.draft ?? doc?.published, agentId);
  await AdvisorConfig.updateOne({ key }, { $set: { published, draft: published, publishedAt: new Date(), updatedBy: userId }, $setOnInsert: { key } }, { upsert: true });
  refresh();
  return getAdminConfigState(agentId);
}

export async function discardDraft(agentId: AgentId = "advisor"): Promise<AdminConfigState> {
  await connectDB();
  const key = AGENTS[agentId].storageKey;
  const doc = await AdvisorConfig.findOne({ key }).select("published publishedAt").lean();
  const published = agentId === "advisor" || doc?.publishedAt ? normalizeContent(doc?.published, agentId) : normalizeContent({}, agentId);
  await AdvisorConfig.updateOne({ key }, { $set: { draft: published } });
  return getAdminConfigState(agentId);
}

export type NewModel = { url: string; providerId: string; bytes: number; label?: string; clips: ClipInfo[] };

export async function addToLibrary(entry: NewModel): Promise<void> {
  await connectDB();
  await AdvisorConfig.updateOne(
    { key: LIBRARY_KEY },
    { $push: { library: { ...entry, uploadedAt: new Date() } }, $setOnInsert: { key: LIBRARY_KEY } },
    { upsert: true }
  );
}

export async function libraryCount(): Promise<number> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: LIBRARY_KEY }).select("library").lean();
  return doc?.library?.length ?? 0;
}

export const LIBRARY_FULL = `Ya hay ${MAX_LIBRARY} modelos subidos: eliminá uno antes de subir otro.`;

/** ¿Algún agente (borrador o publicado) usa este modelo? La biblioteca es compartida, así que se revisan todos. */
export async function modelInUse(url: string): Promise<boolean> {
  await connectDB();
  return !!(await AdvisorConfig.exists({ $or: [{ "draft.model.url": url }, { "published.model.url": url }] }));
}

export async function removeFromLibrary(providerId: string): Promise<{ url: string } | null> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: LIBRARY_KEY }).select("library").lean();
  const entry = doc?.library?.find((l) => l.providerId === providerId);
  if (!entry) return null;
  await AdvisorConfig.updateOne({ key: LIBRARY_KEY }, { $pull: { library: { providerId } } });
  return { url: entry.url };
}

/** ¿El contenido de `bytes` empieza con la firma de un archivo glTF binario ("glTF")? */
export const isGlb = (head: Uint8Array): boolean => head.length >= 4 && head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46;
