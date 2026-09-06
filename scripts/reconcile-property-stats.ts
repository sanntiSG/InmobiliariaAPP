/**
 * Recalcula `stats.likes/saves/comments/views/ratingAvg/ratingCount` de cada
 * propiedad a partir de los documentos reales (`Like`, `Favorite`,
 * `Comment`, `Interaction` de tipo "view", `Rating`) — en vez de confiar
 * ciegamente en el contador desnormalizado, que puede desviarse (datos
 * falsos del seed viejo, una actualización perdida antes del fix a `$inc`
 * atómico en /like y /favorite, una propiedad borrada sin limpiar sus
 * interacciones, etc.).
 *
 * Es una herramienta ad-hoc, no algo que corra solo — usarla cuando se
 * sospecha un desvío, o simplemente para dejar la base consistente de una
 * vez (ver plan de sesión: likes falsos en el seed).
 *
 * Correr con: npx tsx scripts/reconcile-property-stats.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { Property } from "../src/lib/db/models/Property";
import { Like } from "../src/lib/db/models/Like";
import { Favorite } from "../src/lib/db/models/Favorite";
import { Comment } from "../src/lib/db/models/Comment";
import { Rating } from "../src/lib/db/models/Rating";
import { Interaction } from "../src/lib/db/models/Interaction";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado a MongoDB.");

  const properties = await Property.find({}).select("_id stats").lean();
  let changed = 0;

  for (const p of properties) {
    const propertyId = p._id;

    const [likes, saves, comments, views, ratingAgg] = await Promise.all([
      Like.countDocuments({ propertyId }),
      Favorite.countDocuments({ propertyId }),
      Comment.countDocuments({ propertyId, deletedAt: null }),
      Interaction.countDocuments({ propertyId, type: "view" }),
      Rating.aggregate([
        { $match: { propertyId } },
        { $group: { _id: null, avg: { $avg: "$value" }, count: { $sum: 1 } } },
      ]),
    ]);

    const ratingCount = ratingAgg[0]?.count ?? 0;
    // Mismo redondeo que usa POST /api/properties/[id]/rate al recalcular en vivo.
    const ratingAvg = ratingCount > 0 ? Math.round(ratingAgg[0].avg * 10) / 10 : 0;

    const next = { likes, saves, comments, views, ratingAvg, ratingCount };
    const isDifferent =
      p.stats?.likes !== next.likes ||
      p.stats?.saves !== next.saves ||
      p.stats?.comments !== next.comments ||
      p.stats?.views !== next.views ||
      p.stats?.ratingAvg !== next.ratingAvg ||
      p.stats?.ratingCount !== next.ratingCount;
    if (!isDifferent) continue;

    await Property.updateOne(
      { _id: propertyId },
      {
        $set: {
          "stats.likes": next.likes,
          "stats.saves": next.saves,
          "stats.comments": next.comments,
          "stats.views": next.views,
          "stats.ratingAvg": next.ratingAvg,
          "stats.ratingCount": next.ratingCount,
        },
      }
    );
    changed++;
  }

  console.log(`Propiedades revisadas: ${properties.length}. Corregidas: ${changed}.`);

  await mongoose.disconnect();
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
