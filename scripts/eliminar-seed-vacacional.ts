/**
 * eliminarSeedVacacional — retira los datos de demostración que creó `seedVacacional`, y SÓLO esos.
 *
 *   npm run eliminarSeedVacacional              muestra qué borraría (no borra nada)
 *   npm run eliminarSeedVacacional -- --confirm borra de verdad
 *
 * Reglas de seguridad:
 * - Sólo se considera una propiedad si tiene `seedTag` = "vacacional-v1" Y un `seedKey` de este seed que está en la lista de
 *   claves conocidas. Lo que tenga la marca pero no se pueda atribuir con certeza, o pertenezca a una inmobiliaria excluida, NO
 *   se borra: se conserva y se informa.
 * - Antes de borrar se muestra con precisión qué se va a eliminar (sin `--confirm` es una simulación).
 * - Borra la propiedad y lo que sólo existe por ella: me gusta, favoritos, puntajes, comentarios, avisos de "cuando se libere",
 *   métricas, interacciones y notificaciones de esa propiedad. NO borra inmobiliarias, usuarios, propiedades reales, propiedades
 *   de otros seeds, ni los clientes potenciales (Lead) ni los mails: son datos de personas reales; se conservan y se informan.
 * - Las fotos son enlaces de Unsplash (nada propio en Cloudinary), así que no hay archivos que liberar.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { Agency } from "../src/lib/db/models/Agency";
import { AvailabilityWatch } from "../src/lib/db/models/AvailabilityWatch";
import { Comment } from "../src/lib/db/models/Comment";
import { Favorite } from "../src/lib/db/models/Favorite";
import { Interaction } from "../src/lib/db/models/Interaction";
import { Lead } from "../src/lib/db/models/Lead";
import { Like } from "../src/lib/db/models/Like";
import { MailMessage } from "../src/lib/db/models/MailMessage";
import { Notification } from "../src/lib/db/models/Notification";
import { Property } from "../src/lib/db/models/Property";
import { PropertyDailyStat } from "../src/lib/db/models/PropertyDailyStat";
import { Rating } from "../src/lib/db/models/Rating";
import { EXCLUDED_AGENCIES, LISTINGS, SEED_TAG, seedKeyOf } from "./vacacional/data";

const confirm = process.argv.includes("--confirm");
const KNOWN_KEYS = new Set(LISTINGS.map(seedKeyOf));

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("✗ Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(uri);

  // 1. Lo que tiene la marca de este seed, y qué de eso se puede atribuir con certeza.
  const tagged = await Property.find({ seedTag: SEED_TAG }).select("title seedKey agencyId").lean();
  const excludedAgencies = await Agency.find({ $or: [{ slug: { $in: [...EXCLUDED_AGENCIES.slugs] } }, { _id: { $in: EXCLUDED_AGENCIES.ids.filter((id) => mongoose.isValidObjectId(id)) } }] }).select("_id").lean();
  const excluded = new Set(excludedAgencies.map((a) => String(a._id)));

  const toDelete: typeof tagged = [];
  const kept: { id: string; title: string; why: string }[] = [];
  for (const p of tagged) {
    if (!p.seedKey || !KNOWN_KEYS.has(p.seedKey)) kept.push({ id: String(p._id), title: p.title, why: "tiene la marca del seed pero su clave no es de este seed (no se puede atribuir con seguridad)" });
    else if (excluded.has(String(p.agencyId))) kept.push({ id: String(p._id), title: p.title, why: "pertenece a una inmobiliaria excluida" });
    else toDelete.push(p);
  }

  const ids = toDelete.map((p) => p._id);
  const [likes, favorites, ratings, comments, watches, stats, interactions, notifications, leads, mails] = await Promise.all([
    Like.countDocuments({ propertyId: { $in: ids } }),
    Favorite.countDocuments({ propertyId: { $in: ids } }),
    Rating.countDocuments({ propertyId: { $in: ids } }),
    Comment.countDocuments({ propertyId: { $in: ids } }),
    AvailabilityWatch.countDocuments({ propertyId: { $in: ids } }),
    PropertyDailyStat.countDocuments({ propertyId: { $in: ids } }),
    Interaction.countDocuments({ propertyId: { $in: ids } }),
    Notification.countDocuments({ propertyId: { $in: ids } }),
    Lead.countDocuments({ propertyId: { $in: ids } }),
    MailMessage.countDocuments({ propertyIds: { $in: ids } }),
  ]);

  console.log(`Seed ${SEED_TAG}: ${tagged.length} propiedades con la marca.`);
  console.log(`  Se eliminarían ${toDelete.length} propiedades y ${likes} me gusta, ${favorites} favoritos, ${ratings} puntajes, ${comments} comentarios, ${watches} avisos de disponibilidad, ${stats} métricas diarias, ${interactions} interacciones y ${notifications} notificaciones.`);
  for (const p of toDelete) console.log(`    - ${p.title}`);
  if (leads + mails > 0) console.log(`  Se CONSERVAN ${leads} clientes potenciales y ${mails} mails que mencionan estas propiedades (son datos de personas reales).`);
  for (const k of kept) console.log(`  Se CONSERVA «${k.title}» (${k.id}): ${k.why}.`);

  if (toDelete.length === 0) {
    console.log("Nada que eliminar.");
    return;
  }
  if (!confirm) {
    console.log("\n(Simulación: no se borró nada. Para eliminar de verdad: npm run eliminarSeedVacacional -- --confirm)");
    return;
  }

  // 2. Borrar: primero lo que depende de las propiedades, después las propiedades (si algo falla, se puede volver a correr).
  const agencyIds = [...new Set(toDelete.map((p) => String(p.agencyId)))];
  await Promise.all([
    Like.deleteMany({ propertyId: { $in: ids } }),
    Favorite.deleteMany({ propertyId: { $in: ids } }),
    Rating.deleteMany({ propertyId: { $in: ids } }),
    Comment.deleteMany({ propertyId: { $in: ids } }),
    AvailabilityWatch.deleteMany({ propertyId: { $in: ids } }),
    PropertyDailyStat.deleteMany({ propertyId: { $in: ids } }),
    Interaction.deleteMany({ propertyId: { $in: ids } }),
    Notification.deleteMany({ propertyId: { $in: ids } }),
  ]);
  const deleted = await Property.deleteMany({ _id: { $in: ids }, seedTag: SEED_TAG, seedKey: { $in: [...KNOWN_KEYS] } });
  for (const id of agencyIds) await Agency.updateOne({ _id: id }, { $set: { "stats.propertiesCount": await Property.countDocuments({ agencyId: id }) } });

  console.log(`\n✓ Eliminadas ${deleted.deletedCount} propiedades de demostración y sus datos asociados.${kept.length > 0 ? ` Se conservaron ${kept.length} por seguridad (ver arriba).` : ""}`);
}

main()
  .catch((err) => {
    console.error("✗ Error inesperado:", (err as Error)?.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
