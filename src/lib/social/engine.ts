import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { SocialContent, type SocialContentDoc, type SocialRecipe } from "@/lib/db/models/SocialContent";
import { createNotificationForMany } from "@/lib/notifications/create";
import { agencyMemberIds } from "@/lib/notifications/agency-members";
import { dayStart } from "@/lib/tracking/record";
import { TEMPLATE_COUNT } from "./templates";

export const DAILY_REGENERATIONS = 3;
const RECENT_MAX = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

export class SocialError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Mode = "auto" | "manual";
type Doc = SocialContentDoc & { _id: Types.ObjectId; updatedAt: Date };
type Eligible = { id: string; title: string; photos: string[] };
type Pick = { propertyId: string; photoUrl: string; templateId: number };

/** Sólo fotos que el render puede leer (nuestro storage). Las 360° viven en `media.tours`: nunca entran. */
function renderable(url: string): boolean {
  return (
    url.startsWith("https://res.cloudinary.com/") ||
    url.startsWith("https://images.unsplash.com/") || // fotos de las propiedades demo
    url.startsWith("/uploads/")
  );
}

/** Propiedades publicadas de la inmobiliaria con al menos una foto normal. */
export async function eligibleProperties(agencyId: string): Promise<Eligible[]> {
  const docs = await Property.find({
    agencyId,
    status: "published",
    "media.images.0": { $exists: true },
  })
    .select("title media.images")
    .sort({ publishedAt: -1 })
    .lean();
  return docs
    .map((p) => ({
      id: String(p._id),
      title: p.title,
      photos: [...(p.media?.images ?? [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((i) => i.url)
        .filter(renderable),
    }))
    .filter((p) => p.photos.length > 0);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type Recent = NonNullable<SocialContentDoc["recent"]>;
type Avoid = { propertyIds?: string[]; photoUrls?: string[]; templateIds?: number[] };

/**
 * Elige propiedad → foto → template sin repetir enseguida.
 * Con `propertyId` fijo sólo elige foto y template. Devuelve `null` si no hay con qué.
 */
function pick(elig: Eligible[], recent: Recent, avoid: Avoid, propertyId?: string): Pick | null {
  let pool = propertyId ? elig.filter((p) => p.id === propertyId) : elig;
  if (!propertyId && avoid.propertyIds?.length) {
    const rest = pool.filter((p) => !avoid.propertyIds!.includes(p.id));
    if (rest.length > 0) pool = rest;
  }
  if (pool.length === 0) return null;
  // Menos usada recientemente primero (nunca usada = -1); el azar desempata.
  const prop = shuffle(pool).sort(
    (a, b) => recent.propertyIds.lastIndexOf(a.id) - recent.propertyIds.lastIndexOf(b.id)
  )[0]!;

  const blockedPhotos = new Set([...(avoid.photoUrls ?? []), ...recent.photoUrls]);
  const fresh = prop.photos.filter((u) => !blockedPhotos.has(u));
  const notAvoided = prop.photos.filter((u) => !(avoid.photoUrls ?? []).includes(u));
  const photoUrl = shuffle(fresh.length ? fresh : notAvoided.length ? notAvoided : prop.photos)[0]!;

  const all = Array.from({ length: TEMPLATE_COUNT }, (_, i) => i);
  const blockedTpl = new Set([...(avoid.templateIds ?? []), ...recent.templateIds.slice(-2)]);
  const freeTpl = all.filter((t) => !blockedTpl.has(t));
  const hardFree = all.filter((t) => !(avoid.templateIds ?? []).includes(t));
  const templateId = shuffle(freeTpl.length ? freeTpl : hardFree.length ? hardFree : all)[0]!;

  return { propertyId: prop.id, photoUrl, templateId };
}

function remember(recent: Recent, p: Pick): Recent {
  const cap = <T,>(a: T[]) => a.slice(-RECENT_MAX);
  return {
    propertyIds: cap([...recent.propertyIds.filter((x) => x !== p.propertyId), p.propertyId]),
    photoUrls: cap([...recent.photoUrls.filter((x) => x !== p.photoUrl), p.photoUrl]),
    templateIds: cap([...recent.templateIds, p.templateId]),
  };
}

function recipe(p: Pick, day: Date, version: number): SocialRecipe {
  return { propertyId: new Types.ObjectId(p.propertyId), photoUrl: p.photoUrl, templateId: p.templateId, day, version };
}

function valid(r: SocialRecipe | null | undefined, elig: Eligible[]): boolean {
  if (!r) return false;
  const p = elig.find((e) => e.id === String(r.propertyId));
  return !!p && p.photos.includes(r.photoUrl);
}

async function load(agencyId: string): Promise<Doc> {
  const find = () => SocialContent.findOne({ agencyId }).lean<Doc>();
  const found = await find();
  if (found) return found;
  try {
    await SocialContent.create({ agencyId });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return (await find())!;
}

/** Escritura con bloqueo optimista: falla (false) si alguien modificó el documento en el medio. */
async function commit(doc: Doc, set: Record<string, unknown>): Promise<boolean> {
  const res = await SocialContent.updateOne({ _id: doc._id, updatedAt: doc.updatedAt }, { $set: set });
  return res.matchedCount === 1;
}

async function notifyReady(agencyId: string, today: Date): Promise<void> {
  const members = await agencyMemberIds(agencyId);
  await createNotificationForMany(members, {
    type: "social_post",
    title: "Tu publicación está lista.",
    body: "Ya tenés nuevo contenido para compartir en redes.",
    href: "/dashboard/contenido",
    dedupeKey: `social:${agencyId}:${today.toISOString().slice(0, 10)}`,
  });
}

/**
 * Punto único de avance del día (idempotente, sin cron): pasa la "próxima" a "actual",
 * prepara la siguiente y descarta lo que ya no sirve (propiedad despublicada o sin esa foto).
 * Se llama cada vez que alguien abre la sección o se consulta el estado.
 */
export async function ensureToday(agencyId: string): Promise<Doc> {
  await connectDB();
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await load(agencyId);
    if (!doc.mode) return doc;

    const today = dayStart();
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const elig = await eligibleProperties(agencyId);
    const auto = doc.mode === "auto";
    let recent: Recent = { ...doc.recent! };
    let cur: SocialRecipe | null = doc.current ?? null;
    let nxt: SocialRecipe | null = doc.next ?? null;
    const before = JSON.stringify([cur, nxt]);
    let currentIsNew = false;

    if (cur && cur.day < today) {
      if (auto && valid(nxt, elig)) {
        cur = { ...nxt!, day: today, version: (cur.version ?? 0) + 1 };
        currentIsNew = true;
      } else {
        cur = null;
      }
      nxt = null;
    }
    if (cur && !valid(cur, elig)) cur = null;

    if (auto) {
      if (!cur) {
        const p = pick(elig, recent, { propertyIds: nxt ? [String(nxt.propertyId)] : [] });
        if (p) {
          recent = remember(recent, p);
          cur = recipe(p, today, (doc.current?.version ?? 0) + 1);
          currentIsNew = true;
        }
      }
      if (nxt && !valid(nxt, elig)) nxt = null;
      if (!nxt && cur) {
        const p = pick(elig, recent, {
          propertyIds: [String(cur.propertyId)],
          photoUrls: [cur.photoUrl],
          templateIds: [cur.templateId],
        });
        if (p) {
          recent = remember(recent, p);
          nxt = recipe(p, tomorrow, 1);
        }
      }
    } else {
      nxt = null;
    }

    if (JSON.stringify([cur, nxt]) === before) return doc;
    const set = { current: cur, next: nxt, recent };
    if (!(await commit(doc, set))) continue;
    if (currentIsNew) await notifyReady(agencyId, today);
    return { ...doc, ...set } as Doc;
  }
  return load(agencyId);
}

/** Regenera la publicación de hoy (otro template/foto) o, en manual, elige otra propiedad. */
export async function generateCurrent(args: {
  agencyId: string;
  propertyId?: string;
  isAdmin: boolean;
}): Promise<Doc> {
  await connectDB();
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await ensureToday(args.agencyId);
    if (!doc.mode) throw new SocialError(409, "Primero elegí cómo preparar tus publicaciones.");

    const today = dayStart();
    const cur = doc.current ?? null;
    const elig = await eligibleProperties(args.agencyId);
    if (elig.length === 0) throw new SocialError(422, "No hay propiedades publicadas con fotos para promocionar.");

    let target = cur ? String(cur.propertyId) : undefined;
    if (doc.mode === "manual" && args.propertyId) {
      if (!Types.ObjectId.isValid(args.propertyId) || !elig.some((e) => e.id === args.propertyId)) {
        throw new SocialError(404, "Propiedad no encontrada.");
      }
      target = args.propertyId;
    }
    if (doc.mode === "manual" && !target) throw new SocialError(400, "Elegí qué propiedad querés promocionar.");

    // La primera del día es gratis; después cada regeneración o cambio consume una (el admin no tiene tope).
    const sameDay = doc.regen?.day && +doc.regen.day === +today;
    const used = sameDay ? (doc.regen?.count ?? 0) : 0;
    const consumes = !!cur && !args.isAdmin;
    if (consumes && used >= DAILY_REGENERATIONS) {
      throw new SocialError(429, `Ya usaste las ${DAILY_REGENERATIONS} regeneraciones de hoy. Mañana vuelven a estar disponibles.`);
    }

    const p = pick(
      elig,
      doc.recent!,
      cur ? { photoUrls: [cur.photoUrl], templateIds: [cur.templateId] } : {},
      target
    );
    if (!p) throw new SocialError(422, "No hay fotos disponibles para esa propiedad.");

    const set = {
      current: recipe(p, today, (cur?.version ?? 0) + 1),
      recent: remember(doc.recent!, p),
      regen: { day: today, count: consumes ? used + 1 : used },
    };
    if (await commit(doc, set)) return { ...doc, ...set } as Doc;
  }
  throw new SocialError(409, "Se está actualizando, probá de nuevo.");
}

/** Cambia el modo. Automático → manual descarta la próxima; manual → automático retoma el ciclo. */
export async function setMode(agencyId: string, mode: Mode): Promise<Doc> {
  await connectDB();
  const doc = await load(agencyId);
  const set: Record<string, unknown> = { mode };
  if (mode === "manual") set.next = null;
  await SocialContent.updateOne({ _id: doc._id }, { $set: set });
  return ensureToday(agencyId);
}

export type SocialState = {
  mode: Mode | null;
  current: { propertyId: string; title: string; templateId: number; version: number } | null;
  nextReady: boolean;
  /** `null` = sin límite (admin). */
  regenLeft: number | null;
  properties: { id: string; title: string; photo: string }[];
};

/** Estado para la pantalla (avanza el día si hace falta). */
export async function getState(agencyId: string, isAdmin: boolean): Promise<SocialState> {
  const doc = await ensureToday(agencyId);
  const today = dayStart();
  const elig = await eligibleProperties(agencyId);
  const cur = doc.current ?? null;
  const used = doc.regen?.day && +doc.regen.day === +today ? (doc.regen.count ?? 0) : 0;
  return {
    mode: doc.mode ?? null,
    current: cur
      ? {
          propertyId: String(cur.propertyId),
          title: elig.find((e) => e.id === String(cur.propertyId))?.title ?? "",
          templateId: cur.templateId,
          version: cur.version ?? 1,
        }
      : null,
    nextReady: !!doc.next,
    regenLeft: isAdmin ? null : Math.max(0, DAILY_REGENERATIONS - used),
    properties: elig.map((e) => ({ id: e.id, title: e.title, photo: e.photos[0]! })),
  };
}
