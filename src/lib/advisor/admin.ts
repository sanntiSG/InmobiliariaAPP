/**
 * Operaciones del estudio del admin sobre la configuración del asesor. Todo pasa por
 * `normalizeContent`: lo que el cliente manda nunca se guarda tal cual.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { AdvisorConfig } from "@/lib/db/models/AdvisorConfig";
import { invalidate } from "@/lib/intelligence/cache";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { limitOr429 } from "@/lib/security/rate-limit";
import { BUNDLED_MODEL_URL, MAX_LIBRARY, getAdminConfigState, normalizeContent, type AdminConfigState, type AdvisorContent, type ClipInfo } from "./config";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Guardia común de las rutas del estudio: admin real + límite de ritmo. */
export async function adminGuard(req: Request): Promise<{ userId: string } | NextResponse> {
  const user = await requireFreshAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "admin-advisor", 120, 60, { userId: user.id });
  if (limited) return limited;
  return { userId: user.id };
}

const refresh = () => invalidate("advisor:config");

/** Guarda el borrador. El modelo elegido tiene que ser el incluido o uno de la biblioteca. */
export async function saveDraft(raw: unknown, userId: string): Promise<AdminConfigState> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: "default" }).select("library").lean();
  const owned = new Set([BUNDLED_MODEL_URL, ...(doc?.library ?? []).map((l) => l.url)]);
  let draft = normalizeContent(raw);
  if (!owned.has(draft.model.url)) draft = normalizeContent({ ...draft, model: undefined });
  await AdvisorConfig.updateOne({ key: "default" }, { $set: { draft, updatedBy: userId }, $setOnInsert: { key: "default" } }, { upsert: true });
  return getAdminConfigState();
}

export async function publishDraft(userId: string): Promise<AdminConfigState> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: "default" }).select("draft published").lean();
  const published: AdvisorContent = normalizeContent(doc?.draft ?? doc?.published);
  await AdvisorConfig.updateOne({ key: "default" }, { $set: { published, draft: published, publishedAt: new Date(), updatedBy: userId }, $setOnInsert: { key: "default" } }, { upsert: true });
  refresh();
  return getAdminConfigState();
}

export async function discardDraft(): Promise<AdminConfigState> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: "default" }).select("published").lean();
  await AdvisorConfig.updateOne({ key: "default" }, { $set: { draft: normalizeContent(doc?.published) } });
  return getAdminConfigState();
}

export type NewModel = { url: string; providerId: string; bytes: number; label?: string; clips: ClipInfo[] };

export async function addToLibrary(entry: NewModel): Promise<void> {
  await connectDB();
  await AdvisorConfig.updateOne(
    { key: "default" },
    { $push: { library: { ...entry, uploadedAt: new Date() } }, $setOnInsert: { key: "default" } },
    { upsert: true }
  );
}

export async function libraryCount(): Promise<number> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: "default" }).select("library").lean();
  return doc?.library?.length ?? 0;
}

export const LIBRARY_FULL = `Ya hay ${MAX_LIBRARY} modelos subidos: eliminá uno antes de subir otro.`;

/** ¿Algún modelo en uso (borrador o publicado) apunta a este archivo? */
export async function modelInUse(url: string): Promise<boolean> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: "default" }).select("draft.model.url published.model.url").lean();
  return doc?.draft?.model?.url === url || doc?.published?.model?.url === url;
}

export async function removeFromLibrary(providerId: string): Promise<{ url: string } | null> {
  await connectDB();
  const doc = await AdvisorConfig.findOne({ key: "default" }).select("library").lean();
  const entry = doc?.library?.find((l) => l.providerId === providerId);
  if (!entry) return null;
  await AdvisorConfig.updateOne({ key: "default" }, { $pull: { library: { providerId } } });
  return { url: entry.url };
}

/** ¿El contenido de `bytes` empieza con la firma de un archivo glTF binario ("glTF")? */
export const isGlb = (head: Uint8Array): boolean => head.length >= 4 && head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46;
