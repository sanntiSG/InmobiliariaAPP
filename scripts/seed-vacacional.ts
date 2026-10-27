/**
 * seedVacacional — datos de demostración de alquileres temporales en la costa atlántica (Mar del Plata, Aguas Verdes, Mar del
 * Tuyú y Cariló) para grabar la demo de la plataforma.
 *
 *   npm run seedVacacional              crea las propiedades que falten
 *   npm run seedVacacional -- --dry-run muestra qué crearía, sin escribir nada
 *
 * Qué hace y qué NO hace:
 * - Reutiliza las 4 inmobiliarias del seed original. NO crea inmobiliarias ni usuarios: si falta alguna, se detiene.
 * - Excluye por completo a «Inmobiliaria SS» y «test 1 santi» (por id y por slug).
 * - Es idempotente: cada propiedad lleva `seedTag` + `seedKey` únicos; correrlo otra vez no duplica nada ni pisa lo que se
 *   haya editado. Nunca toca propiedades reales ni las de otros seeds.
 * - Escribe todo en UNA transacción (si Mongo no la soporta, deshace lo creado si algo falla): nunca deja datos a medias.
 * - Las fotos son enlaces de Unsplash (sin subir nada a Cloudinary): el inverso sólo borra registros.
 *
 * Para retirar esta demo: `npm run eliminarSeedVacacional`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { Agency } from "../src/lib/db/models/Agency";
import { Property } from "../src/lib/db/models/Property";
import { normalizeRentalFields } from "../src/lib/properties/normalize";
import { todayAr } from "../src/lib/availability";
import { slugify } from "../src/lib/utils/slugify";
import { EXCLUDED_AGENCIES, LISTINGS, LOCALITY_CENTER, SEED_AGENCY_SLUGS, SEED_TAG, photosFor, resolveBlocked, seedKeyOf, type Listing } from "./vacacional/data";

const dryRun = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** ¿El error es "esta base no admite transacciones" (no es un replica set)? */
const noTransactions = (err: unknown): boolean => /replica set|transaction numbers|Transaction.*not supported|IllegalOperation/i.test((err as Error)?.message ?? "");

function buildDoc(listing: Listing, index: number, agencyId: mongoose.Types.ObjectId, today: string, now: Date) {
  const norm = normalizeRentalFields(
    {
      operation: "alquiler_temporal",
      status: "published",
      price: { amount: listing.price.amount, currency: listing.price.currency, expenses: 0, period: listing.price.period },
      availability: { state: listing.availability.state, blocked: resolveBlocked(listing, today) },
    },
    now
  );
  const center = LOCALITY_CENTER[listing.locality];
  return {
    agencyId,
    slug: `${slugify(listing.title).slice(0, 64)}-${listing.key}`,
    title: listing.title,
    description: listing.description,
    operation: "alquiler_temporal" as const,
    type: listing.type,
    status: norm.status,
    price: norm.price,
    priceHistory: [{ amount: norm.price.amount, currency: norm.price.currency, changedAt: now }],
    // Si el barrio es la propia localidad no se repite ("Aguas Verdes, Aguas Verdes").
    address: { neighborhood: listing.neighborhood !== listing.locality ? listing.neighborhood : undefined, city: listing.locality, province: center.province, country: "Argentina", showExact: true },
    location: { type: "Point" as const, coordinates: [center.lng + listing.offset.lng, center.lat + listing.offset.lat] as [number, number] },
    features: { rooms: listing.rooms, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms, garages: listing.garages, coveredArea: listing.coveredArea, totalArea: listing.totalArea, beachDistance: listing.beachDistance },
    amenities: listing.amenities,
    availability: norm.availability,
    media: {
      images: photosFor(listing, index).map((url, order) => ({ url, alt: listing.title, order })),
      videos: [],
      floorPlans: [],
      tours: [],
      virtualTour: { enabled: false },
      hasTour3d: false,
      hasAmbientCover: false,
    },
    // Sin actividad inventada: los contadores nacen en 0 como en cualquier publicación real.
    publishedAt: new Date(now.getTime() - (index % 9) * 86_400_000),
    seedTag: SEED_TAG,
    seedKey: seedKeyOf(listing),
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) fail("Falta MONGODB_URI en .env.local — ver SETUP.md.");
  await mongoose.connect(uri!);
  await Property.init();

  // 1. Las inmobiliarias del seed original (sólo esas, sólo activas, nunca las excluidas).
  const found = await Agency.find({ slug: { $in: [...SEED_AGENCY_SLUGS] }, status: "active" }).select("name slug").lean();
  const missing = SEED_AGENCY_SLUGS.filter((slug) => !found.some((a) => a.slug === slug));
  if (missing.length > 0) fail(`Faltan inmobiliarias del seed original: ${missing.join(", ")}. No se crean otras: corré antes el seed original o revisá los slugs.`);
  for (const a of found) {
    if ((EXCLUDED_AGENCIES.ids as readonly string[]).includes(String(a._id)) || (EXCLUDED_AGENCIES.slugs as readonly string[]).includes(a.slug)) fail(`La inmobiliaria «${a.name}» está excluida de este seed. Me detengo.`);
  }
  const agencies = SEED_AGENCY_SLUGS.map((slug) => found.find((a) => a.slug === slug)!);

  // 2. Qué falta crear.
  const keys = LISTINGS.map(seedKeyOf);
  const existing = new Set((await Property.find({ seedKey: { $in: keys } }).select("seedKey").lean()).map((p) => p.seedKey));
  const now = new Date();
  const today = todayAr(now);
  const todo = LISTINGS.map((l, i) => ({ l, i })).filter(({ l }) => !existing.has(seedKeyOf(l)));
  const docs = todo.map(({ l, i }) => ({ listing: l, doc: buildDoc(l, i, agencies[i % agencies.length]!._id, today, now) }));

  console.log(`Seed ${SEED_TAG}: ${LISTINGS.length} propiedades definidas, ${existing.size} ya existen, ${docs.length} por crear.`);
  for (const { listing, doc } of docs) {
    const owner = agencies.find((a) => String(a._id) === String(doc.agencyId))!;
    console.log(`  + ${listing.locality} · ${listing.type} · ${doc.price.amount.toLocaleString("es-AR")} ${doc.price.currency} ${doc.price.period} · ${doc.availability.current === "available" ? "disponible" : "no disponible"} → ${owner.name}`);
  }
  if (dryRun) {
    console.log("(--dry-run: no se escribió nada)");
    return;
  }
  if (docs.length === 0) {
    console.log("Nada que crear: la demo ya está cargada.");
    return;
  }

  // 3. Todo o nada.
  const agencyIds = [...new Set(docs.map((d) => String(d.doc.agencyId)))];
  const recount = async (session?: mongoose.ClientSession) => {
    for (const id of agencyIds) {
      const n = await Property.countDocuments({ agencyId: id }).session(session ?? null);
      await Agency.updateOne({ _id: id }, { $set: { "stats.propertiesCount": n } }, { session });
    }
  };
  let mode = "transacción";
  const created: string[] = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Property.create(docs.map((d) => d.doc), { session, ordered: true });
      await recount(session);
    });
    created.push(...docs.map((d) => d.doc.seedKey));
  } catch (err) {
    if (!noTransactions(err)) {
      console.error("✗ No se pudo crear la demo (no quedó nada a medias):", (err as Error)?.message);
      process.exitCode = 1;
      return;
    }
    // Sin transacciones (Mongo sin replica set): se crea una por una y, si algo falla, se deshace lo creado.
    mode = "sin transacción (se deshace si falla)";
    try {
      for (const { doc } of docs) {
        await Property.create(doc);
        created.push(doc.seedKey);
      }
      await recount();
    } catch (inner) {
      await Property.deleteMany({ seedTag: SEED_TAG, seedKey: { $in: created } });
      await recount();
      console.error("✗ Falló a mitad de camino; se deshizo lo creado:", (inner as Error)?.message);
      process.exitCode = 1;
      return;
    }
  } finally {
    await session.endSession();
  }

  const byLocality = new Map<string, number>();
  for (const { listing } of docs) byLocality.set(listing.locality, (byLocality.get(listing.locality) ?? 0) + 1);
  console.log(`✓ Creadas ${created.length} propiedades (${mode}): ${[...byLocality].map(([k, v]) => `${k} ${v}`).join(", ")}. Errores: 0.`);
  console.log("  Para retirarlas: npm run eliminarSeedVacacional");
}

main()
  .catch((err) => {
    console.error("✗ Error inesperado:", (err as Error)?.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
