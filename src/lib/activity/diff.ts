/**
 * Diferencias entre dos versiones de una propiedad — módulo PURO (sin base de
 * datos ni mongoose), pensado para poder probarlo con datos sintéticos.
 *
 * Se compara contra un `PropertySnapshot`, no contra el documento: el
 * snapshot sólo extrae primitivos y listas chicas, así que no hay riesgo de
 * guardar un subdocumento entero ni de mutar por accidente el original.
 */

export type Primitive = string | number | boolean | null;

export type ActivityChange = {
  field: string;
  before?: Primitive;
  after?: Primitive;
  unit?: string;
  note?: string;
};

export type PropertySnapshot = {
  title: string;
  description: string;
  operation: string | null;
  type: string | null;
  status: string | null;
  price: { amount: number | null; currency: string | null; expenses: number | null; period: string | null };
  address: Record<"street" | "number" | "neighborhood" | "city" | "province", string | null> & {
    showExact: boolean | null;
  };
  location: [number, number] | null;
  features: Record<
    "rooms" | "bedrooms" | "bathrooms" | "garages" | "coveredArea" | "totalArea" | "age" | "floor",
    number | null
  > & { orientation: string | null };
  amenities: string[];
  /** URLs ordenadas por `order`: la primera es la portada. */
  photos: string[];
  floorPlans: string[];
  videos: string[];
  scenes: { id: string; label: string | null; links: number }[];
  virtualTourEnabled: boolean;
};

const TEXT_MAX = 280;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function clip(text: string, max = TEXT_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Extrae lo que importa de un documento (`doc.toObject()`) o de un objeto plano equivalente. */
export function snapshotProperty(raw: unknown): PropertySnapshot {
  const d = obj(raw);
  const price = obj(d.price);
  const address = obj(d.address);
  const features = obj(d.features);
  const media = obj(d.media);
  const coords = arr(obj(d.location).coordinates);

  const byOrder = (list: unknown[]): string[] =>
    list
      .map((item, index) => ({ url: str(obj(item).url), order: num(obj(item).order) ?? index }))
      .filter((x): x is { url: string; order: number } => !!x.url)
      .sort((a, b) => a.order - b.order)
      .map((x) => x.url);

  return {
    title: str(d.title) ?? "",
    description: typeof d.description === "string" ? d.description.trim() : "",
    operation: str(d.operation),
    type: str(d.type),
    status: str(d.status),
    price: {
      amount: num(price.amount),
      currency: str(price.currency),
      expenses: num(price.expenses),
      period: str(price.period),
    },
    address: {
      street: str(address.street),
      number: str(address.number),
      neighborhood: str(address.neighborhood),
      city: str(address.city),
      province: str(address.province),
      showExact: typeof address.showExact === "boolean" ? address.showExact : null,
    },
    location: coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number" ? [coords[0], coords[1]] : null,
    features: {
      rooms: num(features.rooms),
      bedrooms: num(features.bedrooms),
      bathrooms: num(features.bathrooms),
      garages: num(features.garages),
      coveredArea: num(features.coveredArea),
      totalArea: num(features.totalArea),
      age: num(features.age),
      floor: num(features.floor),
      orientation: str(features.orientation),
    },
    amenities: arr(d.amenities).filter((a): a is string => typeof a === "string"),
    photos: byOrder(arr(media.images)),
    floorPlans: byOrder(arr(media.floorPlans)),
    videos: arr(media.videos)
      .map((v) => str(obj(v).videoId) ?? str(obj(v).url))
      .filter((v): v is string => !!v),
    scenes: arr(media.tours).map((t) => ({
      id: str(obj(t).id) ?? str(obj(t).photo360Url) ?? "",
      label: str(obj(t).label),
      links: arr(obj(t).links).length,
    })),
    virtualTourEnabled: obj(media.virtualTour).enabled === true,
  };
}

/** Distancia aproximada (m) entre dos [lng, lat]. Alcanza para "se movió el pin". */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mínimo movimiento del pin que se considera un cambio real (ruido de geocodificación). */
const MOVED_PIN_METERS = 30;

function setDiff<T>(before: T[], after: T[]): { added: T[]; removed: T[] } {
  const b = new Set(before);
  const a = new Set(after);
  return { added: after.filter((x) => !b.has(x)), removed: before.filter((x) => !a.has(x)) };
}

function countNote(added: number, removed: number): string | undefined {
  const parts = [added > 0 ? `+${added}` : "", removed > 0 ? `-${removed}` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

/**
 * Lista ordenada de cambios entre `before` y `after`. Vacía si no cambió nada
 * que valga la pena registrar (guardar el formulario sin tocarlo no genera
 * ruido en la bitácora).
 */
export function diffProperty(before: PropertySnapshot, after: PropertySnapshot): ActivityChange[] {
  const out: ActivityChange[] = [];

  // Precio — la moneda se registra aparte para no comparar montos de unidades distintas.
  const sameCurrency = before.price.currency === after.price.currency;
  if (before.price.amount !== after.price.amount) {
    const change: ActivityChange = {
      field: "price",
      before: before.price.amount,
      after: after.price.amount,
      unit: after.price.currency ?? undefined,
    };
    if (sameCurrency && before.price.amount && after.price.amount) {
      const pct = ((after.price.amount - before.price.amount) / before.price.amount) * 100;
      change.note = `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)} %`;
    }
    out.push(change);
  }
  if (!sameCurrency) {
    out.push({ field: "currency", before: before.price.currency, after: after.price.currency });
  }
  if (before.price.expenses !== after.price.expenses) {
    out.push({
      field: "expenses",
      before: before.price.expenses,
      after: after.price.expenses,
      unit: after.price.currency ?? undefined,
    });
  }
  if (before.price.period !== after.price.period) {
    out.push({ field: "price_period", before: before.price.period, after: after.price.period });
  }

  if (before.status !== after.status) out.push({ field: "status", before: before.status, after: after.status });
  if (before.title !== after.title) {
    out.push({ field: "title", before: clip(before.title), after: clip(after.title) });
  }
  if (before.description !== after.description) {
    out.push({
      field: "description",
      before: before.description.length,
      after: after.description.length,
      unit: "caracteres",
      note: after.description ? clip(after.description, 200) : "Descripción vacía",
    });
  }
  if (before.operation !== after.operation) {
    out.push({ field: "operation", before: before.operation, after: after.operation });
  }
  if (before.type !== after.type) out.push({ field: "type", before: before.type, after: after.type });

  for (const key of ["street", "number", "neighborhood", "city", "province"] as const) {
    if (before.address[key] !== after.address[key]) {
      out.push({ field: `address.${key}`, before: before.address[key], after: after.address[key] });
    }
  }
  if (before.address.showExact !== after.address.showExact) {
    out.push({ field: "address.showExact", before: before.address.showExact, after: after.address.showExact });
  }
  if (before.location && after.location) {
    const moved = distanceMeters(before.location, after.location);
    if (moved >= MOVED_PIN_METERS) {
      out.push({ field: "location", note: `Pin movido ~${Math.round(moved)} m`, unit: "m", after: Math.round(moved) });
    }
  }

  for (const key of ["rooms", "bedrooms", "bathrooms", "garages", "coveredArea", "totalArea", "age", "floor"] as const) {
    if (before.features[key] !== after.features[key]) {
      out.push({ field: `features.${key}`, before: before.features[key], after: after.features[key] });
    }
  }
  if (before.features.orientation !== after.features.orientation) {
    out.push({ field: "features.orientation", before: before.features.orientation, after: after.features.orientation });
  }

  const amen = setDiff(before.amenities, after.amenities);
  if (amen.added.length > 0 || amen.removed.length > 0) {
    out.push({
      field: "amenities",
      before: before.amenities.length,
      after: after.amenities.length,
      note: clip([...amen.added.map((a) => `+${a}`), ...amen.removed.map((a) => `-${a}`)].join(", ")),
    });
  }

  // Fotos: agregadas/quitadas, portada nueva o sólo reordenadas.
  const photos = setDiff(before.photos, after.photos);
  if (photos.added.length > 0 || photos.removed.length > 0) {
    out.push({
      field: "photos",
      before: before.photos.length,
      after: after.photos.length,
      unit: "fotos",
      note: countNote(photos.added.length, photos.removed.length),
    });
  }
  if (before.photos[0] && after.photos[0] && before.photos[0] !== after.photos[0]) {
    out.push({ field: "cover", note: "Cambió la foto de portada" });
  }
  if (
    photos.added.length === 0 &&
    photos.removed.length === 0 &&
    before.photos.length > 1 &&
    before.photos.join("|") !== after.photos.join("|") &&
    before.photos[0] === after.photos[0]
  ) {
    out.push({ field: "photos_order", note: "Cambió el orden de las fotos" });
  }

  const plans = setDiff(before.floorPlans, after.floorPlans);
  if (plans.added.length > 0 || plans.removed.length > 0) {
    out.push({
      field: "floorPlans",
      before: before.floorPlans.length,
      after: after.floorPlans.length,
      unit: "planos",
      note: countNote(plans.added.length, plans.removed.length),
    });
  }

  const videos = setDiff(before.videos, after.videos);
  if (videos.added.length > 0 || videos.removed.length > 0) {
    out.push({
      field: "videos",
      before: before.videos.length,
      after: after.videos.length,
      unit: "videos",
      note: countNote(videos.added.length, videos.removed.length),
    });
  }

  // Recorrido 360°: escenas agregadas/quitadas y marcadores (enlaces) entre ellas.
  const scenes = setDiff(
    before.scenes.map((s) => s.id),
    after.scenes.map((s) => s.id)
  );
  const linksBefore = before.scenes.reduce((n, s) => n + s.links, 0);
  const linksAfter = after.scenes.reduce((n, s) => n + s.links, 0);
  if (scenes.added.length > 0 || scenes.removed.length > 0) {
    out.push({
      field: "tour360",
      before: before.scenes.length,
      after: after.scenes.length,
      unit: "fotos 360°",
      note: countNote(scenes.added.length, scenes.removed.length),
    });
  }
  if (linksBefore !== linksAfter) {
    out.push({ field: "tour360_links", before: linksBefore, after: linksAfter, unit: "enlaces" });
  }
  if (before.virtualTourEnabled !== after.virtualTourEnabled) {
    out.push({ field: "virtualTour", before: before.virtualTourEnabled, after: after.virtualTourEnabled });
  }

  return out;
}

// ─── Perfil de la inmobiliaria ───────────────────────────────────────────────

export type AgencySnapshot = Record<
  "name" | "description" | "whatsapp" | "phone" | "email" | "website" | "city" | "province" | "logo" | "cover",
  string
>;

/** Extrae el perfil público de una inmobiliaria (`doc.toObject()` / `.lean()`); vacío = "". */
export function snapshotAgency(raw: unknown): AgencySnapshot {
  const d = obj(raw);
  const contact = obj(d.contact);
  const address = obj(d.address);
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    name: s(d.name),
    description: s(d.description),
    whatsapp: s(contact.whatsapp),
    phone: s(contact.phone),
    email: s(contact.email),
    website: s(contact.website),
    city: s(address.city),
    province: s(address.province),
    logo: s(d.logo),
    cover: s(d.cover),
  };
}

export function diffAgency(before: AgencySnapshot, after: AgencySnapshot): ActivityChange[] {
  const out: ActivityChange[] = [];
  const nullable = (v: string) => (v === "" ? null : v);

  for (const key of ["name", "whatsapp", "phone", "email", "website", "city", "province"] as const) {
    if (before[key] !== after[key]) {
      out.push({ field: `agency.${key}`, before: nullable(before[key]), after: nullable(after[key]) });
    }
  }
  if (before.description !== after.description) {
    out.push({
      field: "agency.description",
      before: before.description.length,
      after: after.description.length,
      unit: "caracteres",
      note: after.description ? clip(after.description, 200) : "Descripción vacía",
    });
  }
  // Logo y portada son URLs de storage: sólo interesa si hay y si cambió, no la URL.
  for (const key of ["logo", "cover"] as const) {
    if (before[key] !== after[key]) {
      out.push({
        field: `agency.${key}`,
        before: before[key] !== "",
        after: after[key] !== "",
        note: after[key] === "" ? "Quitado" : before[key] === "" ? "Cargado" : "Reemplazado",
      });
    }
  }
  return out;
}

/** Recorta y sanea un cambio antes de guardarlo (defensa extra: nada enorme ni con tipos raros). */
export function sanitizeChange(change: ActivityChange): ActivityChange {
  const prim = (v: unknown): Primitive | undefined => {
    if (v === undefined) return undefined;
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") return clip(v);
    return null;
  };
  const clean: ActivityChange = { field: clip(change.field, 60) };
  const before = prim(change.before);
  const after = prim(change.after);
  if (before !== undefined) clean.before = before;
  if (after !== undefined) clean.after = after;
  if (change.unit) clean.unit = clip(change.unit, 20);
  if (change.note) clean.note = clip(change.note, 300);
  return clean;
}
